// backend/thumbnailArgs.js

const path = require("path");

/**
 * Generates FFmpeg arguments for creating a tiled video thumbnail
 * 
 * @param {string} input - path to input video file
 * @param {string} output - path to output thumbnail
 * @param {number} fps - frames per second to sample from video
 * @param {number} cols - number of columns in the tile
 * @param {number} rows - number of rows in the tile
 * @param {number} border - border size in pixels between frames
 * @param {number} fontSize - font size for timestamps
 * @returns {string[]} FFmpeg command arguments
 */
function generateThumbnailArgs({
  input,
  output,
  fps = 1,
  cols = 11,
  rows = 10,
  border = 2,
  fontSize = 16,
}) {
  // Maximum output resolution (4K)
  const OUTPUT_WIDTH = 3840;
  const OUTPUT_HEIGHT = 2160;

  // Compute per-frame size to fit tile into 4K
  const TILE_W = Math.floor(OUTPUT_WIDTH / cols);
  const TILE_H = Math.floor(OUTPUT_HEIGHT / rows);

  // Build FFmpeg filter
  const vf = [
    `fps=${fps}`,
    `scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=decrease`,
    `pad=${TILE_W}:${TILE_H}:(ow-iw)/2:(oh-ih)/2`, // center each frame if aspect ratio differs
    `drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.6`,
    `tile=${cols}x${rows}:padding=${border}:margin=${border}`
  ].join(",");

  return [
    "-y", // overwrite output
    "-i", input,
    "-vf", vf,
    "-frames:v", "1",
    "-q:v", "3",            // JPEG quality
    "-pix_fmt", "yuv420p",  // avoid deprecated pixel format warnings
    output
  ];
}

module.exports = { generateThumbnailArgs };