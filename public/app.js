const log = document.getElementById("log");
const ws = new WebSocket(`ws://${location.host}`);

ws.onmessage = e => {
  const m = JSON.parse(e.data);
  log.textContent += JSON.stringify(m) + "\n";
  log.scrollTop = log.scrollHeight;
};

function enqueueFile() {
  fetch("/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: document.getElementById("filePath").value })
  });
}

function enqueueFolder() {
  fetch("/enqueue-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: document.getElementById("folderPath").value
    })
  })
    .then(r => r.json())
    .then(d => {
      log.textContent += `Added ${d.added} files\n`;
    })
    .catch(err => {
      log.textContent += `Error: ${err}\n`;
    });
}

function pause() {
  fetch("/pause", { method: "POST" });
}

function resume() {
  fetch("/resume", { method: "POST" });
}
