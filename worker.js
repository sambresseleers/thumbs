const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const input = process.argv[2];
if (!input) process.exit(1);

const dir = path.dirname(input);
const base = path.basename(input, path.extname(input));
const output = path.join(dir, `${base}.jpg`);

if (fs.existsSync(output)) {
  console.log(`[SKIP] ${output} already exists`);
  process.exit(0);
}

console.log(`[THUMB] generating for ${input}`);

const args = [
  "-hide_banner",
  "-loglevel", "error",
  "-i", input,
  "-vf",
  "select=not(mod(n\\,60)),drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=18:fontcolor=white",
  "-frames:v", "12",
  "-q:v", "3",
  output
];

const ff = spawnSync("ffmpeg", args);

if (ff.error) {
  console.error(ff.error);
  process.exit(1);
}

console.log(`[DONE] ${output}`);
