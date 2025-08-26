require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;

// Database imports
const { testConnection, initializeDatabase } = require("./database/connection");
const DocumentDAO = require("./database/documentDAO");
const { UserDAO, AdminUserDAO } = require("./database/userDAO");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increase JSON payload limit
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Increase URL encoded payload limit
app.use(morgan("dev"));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, "../frontend")));

// Multer konfiguracija (temporary upload)
const storage = multer.memoryStorage(); // Store in memory for Sharp processing
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (increased from 10MB)
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Database initialization will replace these hardcoded users
// Demo user credentials: demo/demo123
// Admin user credentials: admin/admin123

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

// Admin middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Admin token required" });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid admin token" });
    if (user.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    req.user = user;
    next();
  });
}

// Login ruta
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get user from database
    const user = await UserDAO.getByUsername(username);

    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload = { id: user.id, username: user.username, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin login ruta
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get admin from database
    const admin = await AdminUserDAO.getByUsername(username);

    if (!admin || admin.password_hash !== password) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    // Update last login
    await AdminUserDAO.updateLastLogin(admin.id);

    const payload = {
      id: admin.id,
      username: admin.username,
      role: "admin",
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "8h",
    });

    res.json({
      token,
      user: { id: admin.id, username: admin.username, role: "admin" },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Image processing function
async function processImage(buffer, filename, documentType) {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e9);
    const processedFilename = `${documentType}_${timestamp}_${randomSuffix}.jpg`;
    const outputPath = path.join(__dirname, "uploads", processedFilename);

    // Process image with Sharp
    const processedBuffer = await sharp(buffer)
      .resize(1920, 1080, {
        fit: "inside",
        withoutEnlargement: true,
      }) // Max dimensions, maintain aspect ratio
      .jpeg({
        quality: 80,
        progressive: true,
      }) // 80% quality, progressive JPEG
      .rotate() // Auto-rotate based on EXIF
      .toBuffer();

    // Save processed image
    await fs.writeFile(outputPath, processedBuffer);

    // Get file stats
    const stats = await fs.stat(outputPath);

    return {
      filename: processedFilename,
      path: outputPath,
      size: stats.size,
      originalSize: buffer.length,
      compressionRatio: Math.round((1 - stats.size / buffer.length) * 100),
    };
  } catch (error) {
    console.error("Image processing error:", error);
    throw new Error("Failed to process image");
  }
}

// Upload ruta (zaštićena)
app.post(
  "/api/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const documentType = req.body.documentType || "ostalo";
      const comment = req.body.comment || "";
      const pageNumber = req.body.pageNumber || 1;
      const totalPages = req.body.totalPages || 1;

      // Process image with Sharp
      const processedImage = await processImage(
        req.file.buffer,
        req.file.originalname,
        documentType
      );

      console.log("Upload successful:", {
        filename: processedImage.filename,
        originalSize: processedImage.originalSize,
        compressedSize: processedImage.size,
        compressionRatio: `${processedImage.compressionRatio}%`,
        documentType,
        comment,
        pageNumber,
        totalPages,
      });

      // Store document metadata in database
      const documentData = {
        filename: processedImage.filename,
        originalName: req.file.originalname,
        userId: req.user.id,
        documentType,
        originalSize: processedImage.originalSize,
        compressedSize: processedImage.size,
        compressionRatio: `${processedImage.compressionRatio}%`,
        comment,
        pageNumber: parseInt(pageNumber),
        totalPages: parseInt(totalPages),
        filePath: path.join(__dirname, "uploads", processedImage.filename),
      };

      const documentId = await DocumentDAO.create(documentData);

      res.json({
        message: "File uploaded and processed successfully",
        documentId,
        file: {
          filename: processedImage.filename,
          originalSize: processedImage.originalSize,
          compressedSize: processedImage.size,
          compressionRatio: processedImage.compressionRatio,
          documentType,
          pageNumber,
          totalPages,
        },
      });
    } catch (error) {
      console.error("Upload processing error:", error);
      res.status(500).json({ error: "Failed to process uploaded file" });
    }
  }
);

// Zaštićena ruta primjer
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "Ovo je zaštićena ruta!", user: req.user });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

// API health check
app.get("/api/health", (req, res) => {
  res.json({ message: "DOKUMENTA PORTAL backend radi!" });
});

// Admin API routes
app.get("/api/admin/stats", authenticateAdmin, async (req, res) => {
  try {
    const stats = await DocumentDAO.getStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const users = await UserDAO.getAll();
    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
});

app.get("/api/admin/documents", authenticateAdmin, async (req, res) => {
  try {
    const filters = {
      documentType: req.query.type,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: req.query.limit,
    };

    // Remove undefined filters
    Object.keys(filters).forEach(
      (key) => filters[key] === undefined && delete filters[key]
    );

    const documents = await DocumentDAO.getAll(filters);
    res.json(documents);
  } catch (error) {
    console.error("Error getting documents:", error);
    res.status(500).json({ error: "Failed to get documents" });
  }
});

app.delete("/api/admin/documents/:id", authenticateAdmin, async (req, res) => {
  try {
    const docId = parseInt(req.params.id);

    // Get document from database
    const document = await DocumentDAO.getById(docId);

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Delete file from filesystem
    const filePath = path.join(__dirname, "uploads", document.filename);
    try {
      await fs.unlink(filePath);
    } catch (fileError) {
      console.warn("File not found on disk:", document.filename);
    }

    // Remove from database
    const deleted = await DocumentDAO.deleteById(docId);

    if (deleted) {
      res.json({ message: "Document deleted successfully" });
    } else {
      res.status(404).json({ error: "Document not found" });
    }
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Serve uploaded files
app.get("/api/files/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);
  res.sendFile(filePath);
});

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();

    if (dbConnected) {
      // Initialize database (create tables, default users)
      await initializeDatabase();

      const PORT = process.env.PORT || 3001;
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`📄 Document Portal API ready!`);
      });
    } else {
      console.error("❌ Cannot start server - database connection failed");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Server startup error:", error);
    process.exit(1);
  }
}

// Start the server
startServer();
