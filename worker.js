const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const input = process.argv[2];
if (!input) {
  console.error("[ERROR] No input file");
  process.exit(1);
}

const dir = path.dirname(input);
const base = path.basename(input, path.extname(input));
const output = path.join(dir, `${base}.jpg`);

if (fs.existsSync(output)) {
  console.log(`[SKIP] ${output} already exists`);
  process.exit(0);
}

// Ensure output folder exists
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

console.log(`[THUMB] generating ${output}`);

// Set thumbnail options (grid sheet)
const rows = parseInt(process.env.ROWS || 4);
const cols = parseInt(process.env.COLS || 5);
const width = parseInt(process.env.WIDTH || 1920);
const quality = parseInt(process.env.QUALITY || 3); // ffmpeg q:v 2-31

// Build ffmpeg args
const args = [
  "-hide_banner",
  "-loglevel", "error",
  "-i", input,
  "-vf",
  `fps=1/5,scale=${Math.floor(width/cols)}:-1,tile=${cols}x${rows}:padding=5:margin=5,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=18:fontcolor=white`,
  "-frames:v", "1",
  "-q:v", quality,
  output
];

console.log("[FFMPEG] args:", args.join(" "));

const ff = spawnSync("ffmpeg", args);

if (ff.error) {
  console.error("[ERROR] ffmpeg failed:", ff.error);
  process.exit(1);
}

if (!fs.existsSync(output)) {
  console.error("[ERROR] Thumbnail not created!");
  console.error(ff.stderr.toString());
  process.exit(1);
}

console.log(`[DONE] ${output}`);
