const EventEmitter = require("events");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.running = false;
  }

  add(job) {
    this.queue.push(job);
    this.run();
  }

  async run() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    const job = this.queue.shift();
    job.status = "processing";

    const ffmpeg = spawn("ffmpeg", job.args);

    ffmpeg.stderr.on("data", data => {
      const match = data.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
      if (match && job.duration) {
        const t = hmsToSeconds(match[1]);
        job.progress = Math.min(100, (t / job.duration) * 100);
        this.emit("update", job);
      }
    });

    ffmpeg.on("close", code => {
      job.status = code === 0 ? "done" : "error";
      job.progress = 100;
      this.emit("update", job);
      this.running = false;
      this.run();
    });
  }
}

function hmsToSeconds(hms) {
  const [h, m, s] = hms.split(":");
  return (+h) * 3600 + (+m) * 60 + parseFloat(s);
}

module.exports = new JobQueue();
