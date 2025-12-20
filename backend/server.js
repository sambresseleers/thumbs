const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { generateThumbnailArgs } = require("./thumbnailArgs");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

let queue = [];
let processing = false;

// Recursive folder scan
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

// Add folder to queue
app.post("/queue/add", (req, res) => {
  const { folder } = req.body;
  if (!folder || !fs.existsSync(folder)) {
    return res.status(400).json({ error: "Folder not found" });
  }

  const files = scanFolderRecursive(folder);
  let added = [];

  files.forEach(f => {
    const output = f.replace(/\.ts$/, ".jpg");
    if (!fs.existsSync(output) && !queue.find(j => j.input === f)) {
      const job = { id: Date.now() + Math.random(), input: f, output };
      queue.push(job);
      added.push(job);
    }
  });

  console.log(`▶ Added ${added.length} jobs to the queue`);
  processQueue();
  res.json({ added });
});

// Remove job from queue
app.delete("/queue/:id", (req, res) => {
  const jobId = parseFloat(req.params.id);
  const index = queue.findIndex(j => j.id === jobId);
  if (index !== -1) {
    queue.splice(index, 1);
    console.log(`▶ Removed job ${jobId} from queue`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Job not found" });
  }
});

// List queue
app.get("/queue", (req, res) => {
  res.json(queue);
});

// Process queue sequentially
function processQueue() {
  if (processing) return;
  if (queue.length === 0) return;

  processing = true;
  const job = queue[0];
  console.log(`▶ Starting job: ${job.input}`);

  const args = generateThumbnailArgs({ input: job.input, output: job.output });
  const ffmpeg = spawn("ffmpeg", args);

  ffmpeg.stderr.on("data", data => {
    console.log(`[FFMPEG STDERR] ${data.toString()}`);
  });

  ffmpeg.on("close", code => {
    console.log(`▶ Job finished with code ${code}: ${job.input}`);
    queue.shift();
    processing = false;
    // Process next job
    if (queue.length > 0) {
      processQueue();
    }
  });

  ffmpeg.on("error", err => {
    console.error(`▶ FFmpeg error: ${err}`);
    processing = false;
    queue.shift();
    processQueue();
  });
}

app.listen(3000, () => console.log("▶ WebUI on :3000"));
