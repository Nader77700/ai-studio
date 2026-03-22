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
    const prompt = req.body.prompt;

    if (!prompt) {
      return res.status(400).json({ error: "No prompt provided" });
    }

    const response = await axios({
      url: "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: {
        inputs: prompt,
        options: {
          wait_for_model: true,
          use_cache: false
        }
      },
      responseType: "arraybuffer",
      timeout: 60000
    });

    const contentType = response.headers["content-type"];

    // 🔥 لو رجع JSON (يعني فيه Error من HuggingFace)
    if (contentType.includes("application/json")) {
      const errorText = Buffer.from(response.data).toString();
      console.log("HF ERROR:", errorText);
      return res.status(500).json({ error: "Model not ready or failed" });
    }

    // ✅ تحويل الصورة
    const base64 = Buffer.from(response.data).toString("base64");

    res.json({
      result: `data:image/png;base64,${base64}`,
    });

  } catch (err) {
    console.log("FULL ERROR:", err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running on " + PORT));
