const logBox = document.getElementById("log");
const queueBox = document.getElementById("queue");

function log(msg) {
  logBox.value += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

/* ---------- WebSocket ---------- */

const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}`);

ws.onopen = () => log("[WS] connected");
ws.onerror = () => log("[WS] error");
ws.onclose = () => log("[WS] disconnected");

ws.onmessage = ev => {
  const data = JSON.parse(ev.data);

  if (data.type === "log") {
    log(data.msg.trim());
  }

  if (data.type === "start") {
    log(`[START] ${data.file}`);
  }

  if (data.type === "done") {
    log(`[DONE] ${data.file}`);
  }

  if (data.type === "error") {
    log(`[ERROR] ${data.msg}`);
  }

  if (data.type === "queue") {
    queueBox.textContent = data.queue.length + " files queued";
  }
};

/* ---------- UI actions ---------- */

async function scanFolder() {
  const path = document.getElementById("folder").value;

  const res = await fetch("/enqueue-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });

  const json = await res.json();
  log(`[SCAN] Added ${json.added} files`);
}

async function pauseQueue() {
  await fetch("/pause", { method: "POST" });
  log("[QUEUE] paused (after current)");
}

async function resumeQueue() {
  await fetch("/resume", { method: "POST" });
  log("[QUEUE] resumed");
}
