const EventEmitter = require("events");
const { spawn } = require("child_process");

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

    console.log(`▶ Starting job: ${job.input}`);

    const ffmpeg = spawn("ffmpeg", job.args);

    ffmpeg.stdout.on("data", data => {
      console.log(`[FFMPEG STDOUT] ${data}`);
    });

    ffmpeg.stderr.on("data", data => {
      const str = data.toString();
      console.log(`[FFMPEG STDERR] ${str}`);

      const match = str.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (match && job.duration) {
        const t = hmsToSeconds(match[1]);
        job.progress = Math.min(100, (t / job.duration) * 100);
        this.emit("update", job);
      }
    });

    ffmpeg.on("error", err => {
      console.error(`❌ FFmpeg spawn error: ${err}`);
      job.status = "error";
      this.emit("update", job);
    });

    ffmpeg.on("close", code => {
      console.log(`▶ Job finished with code ${code}: ${job.input}`);
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
