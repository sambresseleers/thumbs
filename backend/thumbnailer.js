const { exec } = require("child_process");
const path = require("path");

module.exports = function generate(input, output) {
  const COLS = process.env.COLS || 11;
  const ROWS = process.env.ROWS || 10;
  const WIDTH = process.env.WIDTH || 3840;
  const HEIGHT = process.env.HEIGHT || 2160;
  const FONT_SIZE = process.env.FONT_SIZE || 30;
  const BORDER = process.env.BORDER || 4;

  const cmd = `
ffmpeg -y -hwaccel vaapi -hwaccel_output_format vaapi -i "${input}" \
-vf "
fps=${COLS * ROWS}/$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${input}"),
scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,
pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,
drawtext=text='%{pts\\\\:hms}':x=10:y=10:fontsize=${FONT_SIZE}:fontcolor=white:box=1:boxcolor=black@0.6,
tile=${COLS}x${ROWS}:padding=${BORDER}:margin=${BORDER}
" \
-frames:v 1 -q:v 3 "${output}"
`;

  return new Promise((res, rej) =>
    exec(cmd, (e) => (e ? rej(e) : res()))
  );
};
