const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const queue = require("./jobQueue");
const buildArgs = require("./thumbnailArgs");

const app = express();
app.use(express.json());
app.use(express.static("/app/public"));

const jobs = [];

app.get("/api/list", (req, res) => {
  const dir = req.query.dir || "/data";
  const files = fs.readdirSync(dir)
    .filter(f => /\.(mp4|mkv|avi|mov|ts|webm)$/i.test(f));
  res.json(files);
});

app.post("/api/enqueue", (req, res) => {
  const fullPath = path.join("/data", req.body.file);
  const output = `${fullPath}.thumb.jpg`;

  if (fs.existsSync(output)) {
    return res.json({ skipped: true });
  }

  const duration = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${fullPath}"`)
  );

  const job = {
    id: Date.now(),
    input: fullPath,
    output,
    duration,
    progress: 0,
    status: "queued",
    args: buildArgs(fullPath, output, duration)
  };

  jobs.push(job);
  queue.add(job);
  res.json(job);
});

app.get("/api/jobs", (req, res) => res.json(jobs));

queue.on("update", job => {});

app.listen(3000, () => console.log("▶ WebUI on :3000"));
