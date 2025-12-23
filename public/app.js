const log = document.getElementById("log");
const ws = new WebSocket(`ws://${location.host}`);

ws.onmessage = e => {
  const m = JSON.parse(e.data);
  log.textContent += JSON.stringify(m) + "\n";
};

function enqueue() {
  fetch("/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: document.getElementById("path").value })
  });
}

function pause() { fetch("/pause", { method: "POST" }); }
function resume() { fetch("/resume", { method: "POST" }); }
