const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.static("."));
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
        "Content-Type": "application/json"
      },
      data: {
        inputs: req.body.prompt,
        options: {
          wait_for_model: true
        }
      },
      responseType: "arraybuffer",
    });

    if (response.headers["content-type"] !== "image/png") {
      throw new Error("Model did not return image");
    }

    const base64 = Buffer.from(response.data).toString("base64");

    res.json({
      result: `data:image/png;base64,${base64}`,
    });

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Generation failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running on " + PORT));
