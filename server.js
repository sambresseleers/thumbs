const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const app = express();
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
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanFolder(full, results);
    else if (/\.(mp4|mkv|avi|mov|ts)$/i.test(entry.name)) results.push(full);
  }
  return results;
}

function processQueue() {
  if (processing || paused || queue.length === 0) return;

  processing = true;
  const file = queue.shift();

  console.log("[WORKER START]", file);
  broadcast({ type: "start", file });

  const worker = spawn("node", ["/app/worker.js", file]);

  worker.stdout.on("data", d =>
    broadcast({ type: "log", msg: d.toString() })
  );

  worker.stderr.on("data", d => {
    console.error(d.toString());
    broadcast({ type: "error", msg: d.toString() });
  });

  worker.on("exit", code => {
    console.log("[WORKER DONE]", file, "exit:", code);
    broadcast({ type: "done", file });

    processing = false;
    setImmediate(processQueue);
  });
}

/* ---------- API ---------- */

app.post("/enqueue-folder", (req, res) => {
  const folder = req.body?.path;

  if (!folder || !fs.existsSync(folder)) {
    return res.status(400).json({ error: "Invalid folder" });
  }

  const files = scanFolder(folder);
  files.forEach(f => queue.push(f));

  console.log(`[QUEUE] ${files.length} files added`);
  broadcast({ type: "queue", queue });

  processQueue();
  res.json({ added: files.length });
});

app.post("/pause", (_, res) => {
  paused = true;
  console.log("[QUEUE] paused");
  res.json({ paused });
});

app.post("/resume", (_, res) => {
  paused = false;
  console.log("[QUEUE] resumed");
  processQueue();
  res.json({ paused });
});

/* ---------- server ---------- */

const server = app.listen(3000, () =>
  console.log("Thumbnailer UI on :3000")
);

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws =>
    wss.emit("connection", ws)
  );
});
