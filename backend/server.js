const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { generateThumbnailArgs } = require("./thumbnailArgs");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

let queue = [];

function scanFolderRecursive(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  list.forEach(file => {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(scanFolderRecursive(filePath));
    } else if (file.name.endsWith(".ts")) {
      results.push(filePath);
    }
  });
  return results;
}

// Add files to queue if output doesn't exist
app.post("/queue/add", (req, res) => {
  const { folder } = req.body;
  const files = scanFolderRecursive(folder);
  const added = [];
  files.forEach(f => {
    const output = f.replace(/\.ts$/, ".jpg");
    if (!fs.existsSync(output) && !queue.find(j => j.input === f)) {
      const job = { id: Date.now() + Math.random(), input: f, output };
      queue.push(job);
      added.push(job);
    }
  });
  processQueue();
  res.json({ added });
});

// Remove job
app.delete("/queue/:id", (req, res) => {
  const jobId = parseFloat(req.params.id);
  const index = queue.findIndex(j => j.id === jobId);
  if (index !== -1) {
    // optionally stop FFmpeg process if running
    queue.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Job not found" });
  }
});

let processing = false;
function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  const job = queue[0];
  const args = generateThumbnailArgs({
    input: job.input,
    output: job.output,
  });
  const ffmpeg = spawn("ffmpeg", args);

  ffmpeg.stderr.on("data", data => {
    console.log("[FFMPEG STDERR]", data.toString());
  });

  ffmpeg.on("close", code => {
    console.log(`▶ Job finished with code ${code}: ${job.input}`);
    queue.shift();
    processing = false;
    processQueue();
  });
}

// List queue
app.get("/queue", (req, res) => {
  res.json(queue);
});

app.listen(3000, () => console.log("▶ WebUI on :3000"));
