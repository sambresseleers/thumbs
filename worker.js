const { spawn } = require("child_process");
const path = require("path");

const video = process.argv[2];
const dir = path.dirname(video);
const name = path.basename(video, path.extname(video));
const out = path.join(dir, `${name}.jpg`);

const rows = process.env.ROWS || 4;
const cols = process.env.COLS || 5;
const width = process.env.WIDTH || 1920;

const ffmpeg = spawn("ffmpeg", [
  "-y",
  "-nostdin",
  "-i", video,
  "-vf",
  `fps=1/(${rows * cols + 1}),
   scale=${width}/${cols}:-1,
   drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=18:box=1,
   tile=${cols}x${rows}:padding=10:margin=10`,
  "-frames:v", "1",
  out
]);

ffmpeg.stdout.pipe(process.stdout);
ffmpeg.stderr.pipe(process.stderr);

ffmpeg.on("exit", code => process.exit(code));
