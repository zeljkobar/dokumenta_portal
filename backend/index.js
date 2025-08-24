require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Multer konfiguracija (upload u lokalni folder uploads/)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Dummy user (za demo, zamijeniti s bazom kasnije)
const demoUser = {
  id: 1,
  username: "demo",
  password: "demo123", // U produkciji koristiti hash!
};

// JWT middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required" });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// Login ruta
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username !== demoUser.username || password !== demoUser.password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const payload = { id: demoUser.id, username: demoUser.username };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

// Zaštićena ruta primjer
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "Ovo je zaštićena ruta!", user: req.user });
});

app.get("/", (req, res) => {
  res.json({ message: "DOKUMENTA PORTAL backend radi!" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
