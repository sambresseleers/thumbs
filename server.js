const express = require("express");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const wss = new WebSocket.Server({ noServer: true });

let queue = [];
let processing = false;
let paused = false;

function broadcast(msg) {
  wss.clients.forEach(c => c.readyState === 1 && c.send(JSON.stringify(msg)));
}

async function processQueue() {
  if (processing || paused || queue.length === 0) return;

  processing = true;
  const job = queue.shift();
  broadcast({ type: "start", file: job });

  const worker = spawn("node", ["worker.js", job], { stdio: ["ignore", "pipe", "pipe"] });

  worker.stdout.on("data", d => broadcast({ type: "log", msg: d.toString() }));
  worker.stderr.on("data", d => broadcast({ type: "error", msg: d.toString() }));

  worker.on("exit", () => {
    broadcast({ type: "done", file: job });
    processing = false;
    processQueue(); // next job (unless paused)
  });
}

app.post("/enqueue", (req, res) => {
  queue.push(req.body.path);
  broadcast({ type: "queue", queue });
  processQueue();
  res.sendStatus(200);
});

app.post("/pause", (_, res) => {
  paused = true;
  broadcast({ type: "paused" });
  res.sendStatus(200);
});

app.post("/resume", (_, res) => {
  paused = false;
  broadcast({ type: "resumed" });
  processQueue();
  res.sendStatus(200);
});

const server = app.listen(3000, () => {
  console.log("UI running on port 3000");
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit("connection", ws);
  });
});
