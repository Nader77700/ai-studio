const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();
app.use(express.json());
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
  role: { type: String, default: "user" } // 🔥 جديد
});

const PaymentSchema = new mongoose.Schema({
  userId: String,
  screenshot: String,
  status: { type: String, default: "pending" }
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

// 🔥 Admin middleware
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
    role: email === "www.aanadr@gmail.com" ? "admin" : "user" // 👈 انت الأدمن
  });

  res.json({ message: "Account created ✅" });
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) return res.json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.json({ error: "Wrong password" });

  const token = jwt.sign({
    id: user._id,
    role: user.role // 🔥 مهم
  }, SECRET);

  res.json({ token, username: user.username });
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

// ================= ADMIN =================

// كل الطلبات (محمية)
app.get("/admin/payments", auth, adminOnly, async (req, res) => {
  const payments = await Payment.find();
  res.json(payments);
});

// الموافقة (محمية)
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

// ================= GENERATE =================
app.post("/generate", auth, async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) return res.json({ error: "User not found" });

  if (user.plan !== "premium") {
    return res.status(403).json({ error: "اشترك الاول" });
  }

  try {
    const response = await axios({
      url: "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`
      },
      data: {
        inputs: req.body.prompt
      },
      responseType: "arraybuffer"
    });

    const base64 = Buffer.from(response.data).toString("base64");

    res.json({
      result: `data:image/png;base64,${base64}`
    });

  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: "فشل التوليد" });
  }
});

// ================= RUN =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running 🚀"));
