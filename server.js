const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const app = express();

/* 🔑 REQUIRED */
app.use(express.json());
app.use(express.static("public"));

const wss = new WebSocket.Server({ noServer: true });

let queue = [];
let processing = false;
let paused = false;

/* ---------- helpers ---------- */

function broadcast(msg) {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify(msg));
    }
  });
}

function scanFolder(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanFolder(fullPath, results);
    } else if (/\.(mp4|mkv|avi|mov|ts)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function processQueue() {
  if (processing || paused || queue.length === 0) return;

  processing = true;
  const file = queue.shift();

  broadcast({ type: "start", file });

  const worker = spawn("node", ["worker.js", file], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  worker.stdout.on("data", d =>
    broadcast({ type: "log", msg: d.toString() })
  );

  worker.stderr.on("data", d =>
    broadcast({ type: "error", msg: d.toString() })
  );

  worker.on("exit", () => {
    broadcast({ type: "done", file });
    processing = false;
    processQueue();
  });
}

/* ---------- API ---------- */

app.post("/enqueue", (req, res) => {
  console.log("[ENQUEUE FILE]", req.body);

  if (!req.body?.path) {
    return res.status(400).json({ error: "Missing path" });
  }

  queue.push(req.body.path);
  broadcast({ type: "queue", queue });
  processQueue();

  res.json({ ok: true });
});

app.post("/enqueue-folder", (req, res) => {
  console.log("[ENQUEUE FOLDER]", req.body);

  const folder = req.body?.path;

  if (!folder) {
    return res.status(400).json({ error: "Missing folder path" });
  }

  if (!folder.startsWith("/media")) {
    return res.status(400).json({ error: "Folder must be inside /media" });
  }

  if (!fs.existsSync(folder)) {
    return res.status(400).json({ error: "Folder does not exist" });
  }

  try {
    const files = scanFolder(folder);
    files.forEach(f => queue.push(f));

    console.log(`[SCAN] added ${files.length} files`);

    broadcast({ type: "queue", queue });
    processQueue();

    res.json({ added: files.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- server ---------- */

const server = app.listen(3000, () => {
  console.log("UI running on port 3000");
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit("connection", ws);
  });
});
