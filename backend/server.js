const express = require("express");
const multer = require("multer");
const path = require("path");
const generate = require("./thumbnailer");

const app = express();
const upload = multer({ dest: "/data/input" });

app.use(express.static("/app/public"));
app.use("/output", express.static("/data/output"));

app.post("/generate", upload.single("video"), async (req, res) => {
  const input = req.file.path;
  const out = `/data/output/${req.file.originalname}.jpg`;

  try {
    await generate(input, out);
    res.json({ preview: `/output/${path.basename(out)}` });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.listen(3000, () => console.log("▶ WebUI on :3000"));
