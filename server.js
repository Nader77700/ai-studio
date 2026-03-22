const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("AI Studio is running 🚀");
});

app.post("/generate", async (req, res) => {
  try {
    const response = await axios({
      url: "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
      },
      data: {
        inputs: req.body.prompt,
      },
      responseType: "arraybuffer",
    });

    const base64 = Buffer.from(response.data).toString("base64");

    res.json({
      result: `data:image/png;base64,${base64}`,
    });
  } catch (err) {
    res.status(500).json({ error: "error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running on " + PORT));
