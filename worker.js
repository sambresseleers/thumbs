const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------- Read environment variables ----------
const rows = parseInt(process.env.ROWS || 4);
const cols = parseInt(process.env.COLS || 5);
const width = parseInt(process.env.WIDTH || 1920);
const quality = parseInt(process.env.QUALITY || 3); // ffmpeg q:v 2-31
const fontSize = parseInt(process.env.FONT_SIZE || 18);
const extensions = process.env.EXTENSIONS ? process.env.EXTENSIONS.split("|") : ["mp4","mkv","avi","mov","ts"];
const forceOverwrite = process.env.FORCE_OVERWRITE === "true";

// ---------- Get input file ----------
const input = process.argv[2];
if (!input) {
  console.error("[ERROR] No input file provided");
  process.exit(1);
}

// ---------- Validate input ----------
const dir = path.dirname(input);
const base = path.basename(input, path.extname(input));
const output = path.join(dir, `${base}.jpg`);

// Skip if file exists and FORCE_OVERWRITE=false
if (fs.existsSync(output) && !forceOverwrite) {
  console.log(`[SKIP] ${output} already exists`);
  process.exit(0);
}

// Ensure output folder exists
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

console.log(`[THUMB] generating ${output}`);

// ---------- Build ffmpeg filter ----------
const ffmpegFilter = `fps=1/5,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=${fontSize}:fontcolor=white:font='Sans',scale=${Math.floor(width/cols)}:-1,tile=${cols}x${rows}:padding=5:margin=5`;

// ---------- Run ffmpeg ----------
const args = [
  "-hide_banner",
  "-loglevel", "error",
  "-i", input,
  "-vf", ffmpegFilter,
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
