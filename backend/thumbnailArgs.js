// backend/thumbnailArgs.js
function generateThumbnailArgs({
    input,
    output,
    fps = 1,
    cols = 11,
    rows = 10,
    border = 2,
    fontSize = 16,
  }) {
    return [
      "-y",
      "-i", input,
      "-vf",
      `fps=${fps},tile=${cols}x${rows}:margin=${border}:padding=${border},drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='%{filename}':x=10:y=10:fontsize=${fontSize}:fontcolor=white`,
      "-q:v", "2",
      output,
    ];
  }
  
  module.exports = { generateThumbnailArgs };
  