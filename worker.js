const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------- Read environment variables ----------
const rows = parseInt(process.env.ROWS || 4);
const cols = parseInt(process.env.COLS || 5);
const width = parseInt(process.env.WIDTH || 1920);
const quality = parseInt(process.env.QUALITY || 3); 
const fontSize = parseInt(process.env.FONT_SIZE || 18);
const forceOverwrite = process.env.FORCE_OVERWRITE === "true";

// ---------- Get input file ----------
const input = process.argv[2];
if (!input) {
  console.error("[ERROR] No input file provided");
  process.exit(1);
}

const dir = path.dirname(input);
const base = path.basename(input, path.extname(input));
const output = path.join(dir, `${base}.jpg`);

if (fs.existsSync(output) && !forceOverwrite) {
  console.log(`[SKIP] ${output} already exists`);
  process.exit(0);
}

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// ==========================================
// NEW: Get Video Duration using ffprobe
// ==========================================
console.log(`[PROBE] Checking duration for ${input}`);

const ffprobeArgs = [
  "-v", "error",
  "-show_entries", "format=duration",
  "-of", "default=noprint_wrappers=1:nokey=1",
  input
];

const probe = spawnSync("ffprobe", ffprobeArgs);

if (probe.error || probe.stderr.toString()) {
    console.error("[ERROR] ffprobe failed:", probe.stderr.toString());
    process.exit(1);
}

const duration = parseFloat(probe.stdout.toString());

if (isNaN(duration)) {
    console.error("[ERROR] Could not determine video duration.");
    process.exit(1);
}

console.log(`[INFO] Duration: ${duration}s`);

// ==========================================
// NEW: Calculate dynamic FPS
// ==========================================
// If you specifically want 110 images, change this to: const totalTiles = 110;
const totalTiles = rows * cols; 

// We calculate the Frames Per Second needed to get exactly 'totalTiles' over 'duration'
// Formula: FPS = Total_Frames_Needed / Duration_In_Seconds
const calculatedFps = totalTiles / duration;

console.log(`[THUMB] Generating ${output} (Tiles: ${totalTiles}, FPS: ${calculatedFps.toFixed(4)})`);

// ==========================================
// Build filter (With Scale fix + Dynamic FPS)
// ==========================================
// 1. fps=${calculatedFps} -> Captures exactly enough frames to fill the grid based on video length
// 2. scale=... -> Scales down input frame FIRST
// 3. drawtext=... -> Draws text on the small frame (keeps font size relative to thumbnail)
// 4. tile=... -> Stitches them together
const ffmpegFilter = `fps=${calculatedFps},scale=${Math.floor(width/cols)}:-1,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.5:font='Sans',tile=${cols}x${rows}:padding=5:margin=5`;

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

console.log("[FFMPEG] running generation...");

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