const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static("public"));

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("DB Connected ✅"))
  .catch(err => console.log(err));

// ================= SCHEMA =================
const UserSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  plan: { type: String, default: "free" },
  role: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  imagesCount: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false }
});

const PaymentSchema = new mongoose.Schema({
  userId: String,
  screenshot: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Payment = mongoose.model("Payment", PaymentSchema);

// ================= AUTH =================
const SECRET = "NADER_SECRET";

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "مش مسموح" });
  }
  next();
}

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.json({ error: "كل البيانات مطلوبة" });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.json({ error: "Email already exists" });
  }

  const hashed = await bcrypt.hash(password, 10);

  await User.create({
    username,
    email,
    password: hashed,
    role: email === "www.aanadr@gmail.com" ? "admin" : "user"
  });

  res.json({ message: "Account created ✅" });
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.json({ error: "User not found" });

  if (user.isBanned) {
    return res.json({ error: "تم حظرك" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: "Wrong password" });

  user.lastLogin = new Date();
  await user.save();

  const token = jwt.sign({
    id: user._id,
    role: user.role
  }, SECRET);

  res.json({ token, username: user.username });
});

// ================= GENERATE =================
app.post("/generate", auth, async (req, res) => {
  const { prompt, images } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.json({ error: "User not found" });

    if (user.isBanned) {
      return res.status(403).json({ error: "تم حظرك" });
    }

    if (user.plan !== "premium" && user.role !== "admin") {
      return res.status(403).json({ error: "اشترك الاول" });
    }

    let finalPrompt = prompt || "";

    if (images && images.length > 0) {
      if (images.length > 4) {
        return res.json({ error: "اقصى عدد صور 4" });
      }

      finalPrompt += `
STRICT FACE IDENTITY LOCK:
- Preserve exact face from reference
- No face modification
- No beautification
- Keep real skin texture
- Same identity 100%
`;
    }

    // 🔥 Retry system (مهم جدا)
    let response;
    for (let i = 0; i < 3; i++) {
      try {
        response = await axios.post(
          "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"
          { inputs: finalPrompt },
          {
            headers: {
              Authorization: `Bearer ${process.env.HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            responseType: "arraybuffer",
            timeout: 60000
          }
        );

        break;
      } catch (err) {
        console.log("Retry...", i + 1);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!response) {
      return res.status(500).json({ error: "الموديل مش بيرد" });
    }

    const contentType = response.headers["content-type"];

    if (contentType.includes("application/json")) {
      const errorData = JSON.parse(response.data.toString());
      return res.status(500).json({
        error: errorData.error || "الموديل لسه بيحمل"
      });
    }

    const base64 = Buffer.from(response.data).toString("base64");

    user.imagesCount += 1;
    await user.save();

    res.json({
      result: `data:image/png;base64,${base64}`
    });

  } catch (err) {
    console.log("🔥 ERROR:", err.message);

    res.status(500).json({
      error: "فشل التوليد (راجع التوكن)"
    });
  }
});

// ================= ADMIN =================
app.get("/admin/users", auth, adminOnly, async (req, res) => {
  const users = await User.find();
  res.json(users);
});

app.post("/admin/ban", auth, adminOnly, async (req, res) => {
  const { id } = req.body;

  const user = await User.findById(id);
  if (!user) return res.json({ error: "Not found" });

  user.isBanned = !user.isBanned;
  await user.save();

  res.json({ message: user.isBanned ? "تم الحظر" : "تم فك الحظر" });
});

app.post("/admin/role", auth, adminOnly, async (req, res) => {
  const { id, role } = req.body;

  await User.findByIdAndUpdate(id, { role });
  res.json({ message: "تم تحديث الصلاحية" });
});

app.post("/admin/reset-password", auth, adminOnly, async (req, res) => {
  const { id, newPassword } = req.body;

  const hashed = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(id, { password: hashed });

  res.json({ message: "تم تغيير الباسورد" });
});

// ================= PAYMENTS =================
app.get("/admin/payments", auth, adminOnly, async (req, res) => {
  const payments = await Payment.find();
  res.json(payments);
});

app.post("/admin/approve", auth, adminOnly, async (req, res) => {
  const { id } = req.body;

  const payment = await Payment.findById(id);
  if (!payment) return res.json({ error: "Not found" });

  payment.status = "approved";
  await payment.save();

  await User.findByIdAndUpdate(payment.userId, {
    plan: "premium"
  });

  res.json({ message: "تم التفعيل ✅" });
});

// ================= SUBMIT PAYMENT =================
app.post("/submit-payment", auth, async (req, res) => {
  const { screenshot } = req.body;

  if (!screenshot) {
    return res.json({ error: "ارفع صورة" });
  }

  await Payment.create({
    userId: req.user.id,
    screenshot
  });

  res.json({ message: "تم ارسال الطلب" });
});

// ================= RUN =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running 🚀"));
