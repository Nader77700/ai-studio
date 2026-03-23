const express = require("express");
const axios = require("axios");
const multer = require("multer");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

app.get("/", (req, res) => {
  res.send("AI Studio API Running 🚀");
});

// توليد صورة
app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "No prompt provided" });
    }

    const response = await axios({
      url: "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: {
        inputs: prompt,
        options: { wait_for_model: true }
      },
      responseType: "arraybuffer",
      timeout: 60000
    });

    const base64 = Buffer.from(response.data).toString("base64");

    res.json({
      result: `data:image/png;base64,${base64}`
    });

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Generation failed" });
  }
});

// استخراج prompt من صورة
app.post("/extract-prompt", upload.single("image"), async (req, res) => {
  try {
    // هنا تقدر تربط AI تاني زي BLIP
    res.json({
      prompt: "A man standing in front of a luxury car, outdoor daylight"
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to extract prompt" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on " + PORT));
