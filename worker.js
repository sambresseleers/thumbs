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

console.log(`[THUMB] generating ${output}`);

const args = [
  "-hide_banner",
  "-loglevel", "error",
  "-i", input,
  "-vf",
  `fps=1/5,scale=320:-1,tile=5x4:padding=5:margin=5,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=18:fontcolor=white:fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf`,
  "-frames:v",
  "1",
  "-q:v",
  "3",
  output
];

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
