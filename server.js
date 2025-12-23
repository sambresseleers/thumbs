const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ---------- WebSocket setup ----------
const wss = new WebSocket.Server({ noServer: true });

function broadcast(msg) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  });
}

// ---------- Queue management ----------
let queue = [];
let processing = false;
let paused = false;

// Scan folder recursively and collect supported extensions
function scanFolder(dir, extensions = ["mp4","mkv","avi","mov","ts"], results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanFolder(fullPath, extensions, results);
    } else if (extensions.some(ext => entry.name.toLowerCase().endsWith(`.${ext.toLowerCase()}`))) {
      results.push(fullPath);
    }
  }
  return results;
}

// Process next item in the queue
function processQueue() {
  if (processing || paused || queue.length === 0) return;

  processing = true;
  const file = queue.shift();

  console.log("[WORKER START]", file);
  broadcast({ type: "start", file });

  const worker = spawn("node", ["/app/worker.js", file]);

  worker.stdout.on("data", d => {
    const msg = d.toString();
    console.log(msg.trim());
    broadcast({ type: "log", msg: msg.trim() });
  });

  worker.stderr.on("data", d => {
    const msg = d.toString();
    console.error(msg.trim());
    broadcast({ type: "error", msg: msg.trim() });
  });

  worker.on("exit", code => {
    console.log("[WORKER DONE]", file, "exit:", code);
    broadcast({ type: "done", file });
    processing = false;
    setImmediate(processQueue);
  });
}

// ---------- API Endpoints ----------

// Enqueue folder
app.post("/enqueue-folder", (req, res) => {
  const folder = req.body?.path;
  if (!folder || !fs.existsSync(folder)) {
    return res.status(400).json({ error: "Invalid folder" });
  }

  const extensions = process.env.EXTENSIONS ? process.env.EXTENSIONS.split("|") : ["mp4","mkv","avi","mov","ts"];
  const files = scanFolder(folder, extensions);

  files.forEach(f => queue.push(f));

  console.log(`[QUEUE] ${files.length} files added`);
  broadcast({ type: "queue", queue });

  processQueue();
  res.json({ added: files.length });
});

// Pause queue
app.post("/pause", (_, res) => {
  paused = true;
  console.log("[QUEUE] paused");
  res.json({ paused });
});

// Resume queue
app.post("/resume", (_, res) => {
  paused = false;
  console.log("[QUEUE] resumed");
  processQueue();
  res.json({ paused });
});

// ---------- HTTP + WebSocket server ----------
const server = app.listen(3000, () => console.log("Thumbnailer UI on :3000"));

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
});
