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
const { DocumentDAO, NotificationDAO } = require("./database/documentDAO");
const { UserDAO, AdminUserDAO } = require("./database/userDAO");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));

// Serve static files
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/admin", express.static(path.join(__dirname, "../admin")));

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image files and PDFs are allowed!"), false);
    }
  },
});

// JWT middleware for regular users
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required" });

  jwt.verify(token, process.env.JWT_SECRET, async (err, payload) => {
    if (err) return res.status(403).json({ error: "Invalid token" });

    // Get full user data including admin_id
    const user = await UserDAO.getById(payload.id);
    if (!user) return res.status(403).json({ error: "User not found" });

    req.user = {
      id: user.id,
      username: user.username,
      adminId: user.admin_id,
      role: "user",
    };
    next();
  });
}

// JWT middleware for admin users
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Admin token required" });

  jwt.verify(token, process.env.JWT_SECRET, async (err, payload) => {
    if (err) return res.status(403).json({ error: "Invalid admin token" });
    if (payload.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });

    // Get full admin data
    const admin = await AdminUserDAO.getById(payload.id);
    if (!admin) return res.status(403).json({ error: "Admin not found" });

    req.user = {
      id: admin.id,
      username: admin.username,
      adminId: admin.id, // Admin's own ID
      role: "admin",
    };
    next();
  });
}

// ============================================================================
// USER AUTHENTICATION ROUTES
// ============================================================================

// User login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password, adminId } = req.body;

    // For demo purposes, we'll use admin_id = 2 (our actual admin)
    // In production, this could come from subdomain or admin selection
    const actualAdminId = adminId || 2;

    const user = await UserDAO.getByUsername(username, actualAdminId);

    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.status !== "active") {
      return res.status(401).json({ error: "Account is inactive" });
    }

    await UserDAO.updateLastLogin(user.id);

    const payload = {
      id: user.id,
      username: user.username,
      adminId: user.admin_id,
      role: "user",
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        companyName: user.company_name,
        role: "user",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await AdminUserDAO.getByUsername(username);

    if (!admin || admin.password_hash !== password) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    if (!admin.is_active) {
      return res.status(401).json({ error: "Admin account is inactive" });
    }

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
      user: {
        id: admin.id,
        username: admin.username,
        companyName: admin.company_name,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// FILE PROCESSING
// ============================================================================

async function processFile(buffer, filename, documentType, mimetype) {
  try {
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e9);

    let processedFilename;
    let processedBuffer;
    let outputPath;

    if (mimetype.startsWith("image/")) {
      processedFilename = `${documentType}_${timestamp}_${randomSuffix}.jpg`;
      outputPath = path.join(__dirname, "uploads", processedFilename);

      processedBuffer = await sharp(buffer)
        .resize(1920, 1080, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 80,
          progressive: true,
        })
        .rotate()
        .toBuffer();
    } else if (mimetype === "application/pdf") {
      const fileExtension = path.extname(filename) || ".pdf";
      processedFilename = `${documentType}_${timestamp}_${randomSuffix}${fileExtension}`;
      outputPath = path.join(__dirname, "uploads", processedFilename);
      processedBuffer = buffer;
    } else {
      throw new Error("Unsupported file type");
    }

    await fs.writeFile(outputPath, processedBuffer);
    const stats = await fs.stat(outputPath);

    return {
      filename: processedFilename,
      path: outputPath,
      size: stats.size,
      originalSize: buffer.length,
      compressionRatio: Math.round((1 - stats.size / buffer.length) * 100),
    };
  } catch (error) {
    console.error("File processing error:", error);
    throw new Error("Failed to process file");
  }
}

// ============================================================================
// USER API ROUTES
// ============================================================================

// Upload document
app.post(
  "/api/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const { documentType, documentSubtype, userComment } = req.body;

      if (!documentType) {
        return res.status(400).json({ error: "Document type is required" });
      }

      // Get user info for company name
      const user = await UserDAO.getById(req.user.id);

      const processedFile = await processFile(
        req.file.buffer,
        req.file.originalname,
        documentType,
        req.file.mimetype
      );

      const documentData = {
        userId: req.user.id,
        filename: processedFile.filename,
        originalName: req.file.originalname,
        filePath: processedFile.path,
        mimeType: req.file.mimetype,
        originalSize: processedFile.originalSize,
        compressedSize: processedFile.size,
        compressionRatio: processedFile.compressionRatio,
        documentType: documentType,
        documentSubtype: documentSubtype || "ostalo",
        userComment: userComment,
        companyName: user.company_name,
      };

      const documentId = await DocumentDAO.create(
        documentData,
        req.user.adminId
      );

      // Create notification for user
      await NotificationDAO.create(
        req.user.id,
        documentId,
        "general",
        "Dokument upload-ovan",
        `Dokument "${req.file.originalname}" je uspešno upload-ovan i čeka review.`
      );

      res.json({
        message: "File uploaded successfully",
        documentId,
        file: {
          filename: processedFile.filename,
          originalSize: processedFile.originalSize,
          compressedSize: processedFile.size,
          compressionRatio: processedFile.compressionRatio,
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process uploaded file" });
    }
  }
);

// Get user's documents
app.get("/api/documents", authenticateToken, async (req, res) => {
  try {
    const documents = await DocumentDAO.getByUserId(
      req.user.id,
      req.user.adminId
    );
    res.json(documents);
  } catch (error) {
    console.error("Error getting user documents:", error);
    res.status(500).json({ error: "Failed to get documents" });
  }
});

// Get user's notifications
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const notifications = await NotificationDAO.getByUserId(
      req.user.id,
      unreadOnly
    );
    res.json(notifications);
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

// Mark notification as read
app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
  try {
    const success = await NotificationDAO.markAsRead(
      req.params.id,
      req.user.id
    );
    if (success) {
      res.json({ message: "Notification marked as read" });
    } else {
      res.status(404).json({ error: "Notification not found" });
    }
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// ============================================================================
// ADMIN API ROUTES
// ============================================================================

// Admin dashboard stats
app.get("/api/admin/stats", authenticateAdmin, async (req, res) => {
  try {
    const stats = await DocumentDAO.getStats(req.user.adminId);
    const userStats = await UserDAO.getStats(req.user.adminId);
    const limits = await AdminUserDAO.checkLimits(req.user.adminId);

    res.json({
      ...stats,
      ...userStats,
      limits,
    });
  } catch (error) {
    console.error("Error getting admin stats:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

// Get admin's users
app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const users = await UserDAO.getAll(req.user.adminId);
    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
});

// Create new user
app.post("/api/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      fullName,
      companyName,
      phone,
      pib,
      notes,
    } = req.body;

    if (!username || !password || !fullName) {
      return res
        .status(400)
        .json({ error: "Username, password, and full name are required" });
    }

    // Check if user already exists for this admin
    const existingUser = await UserDAO.getByUsername(
      username,
      req.user.adminId
    );
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }

    if (email) {
      const existingEmail = await UserDAO.getByEmail(email, req.user.adminId);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }
    }

    // Check subscription limits
    const limits = await AdminUserDAO.checkLimits(req.user.adminId);
    if (limits.current_clients >= limits.max_clients) {
      return res.status(400).json({
        error: `Client limit reached. Maximum ${limits.max_clients} clients allowed.`,
      });
    }

    const userData = {
      username,
      email,
      password_hash: password, // In production, hash this!
      fullName,
      companyName,
      phone,
      pib,
      notes,
      status: "active",
    };

    const userId = await UserDAO.create(userData, req.user.adminId);
    res.json({ message: "User created successfully", userId });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Update user
app.put("/api/admin/users/:id", authenticateAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;

    delete updates.id;
    delete updates.admin_id;

    if (updates.password) {
      updates.password_hash = updates.password;
      delete updates.password;
    }

    const success = await UserDAO.update(userId, updates, req.user.adminId);
    if (success) {
      res.json({ message: "User updated successfully" });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Delete user
app.delete("/api/admin/users/:id", authenticateAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const userDocuments = await DocumentDAO.getByUserId(
      userId,
      req.user.adminId
    );
    if (userDocuments.length > 0) {
      return res.status(400).json({
        error:
          "Cannot delete user with existing documents. Please delete documents first.",
      });
    }

    const success = await UserDAO.delete(userId, req.user.adminId);
    if (success) {
      res.json({ message: "User deleted successfully" });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Get admin's documents
app.get("/api/admin/documents", authenticateAdmin, async (req, res) => {
  try {
    const filters = {
      documentType: req.query.type,
      documentSubtype: req.query.subtype,
      status: req.query.status,
      userId: req.query.userId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      syncStatus: req.query.syncStatus,
      limit: req.query.limit,
    };

    Object.keys(filters).forEach(
      (key) => filters[key] === undefined && delete filters[key]
    );

    const documents = await DocumentDAO.getAll(req.user.adminId, filters);
    res.json(documents);
  } catch (error) {
    console.error("Error getting documents:", error);
    res.status(500).json({ error: "Failed to get documents" });
  }
});

// Update document status
app.put(
  "/api/admin/documents/:id/status",
  authenticateAdmin,
  async (req, res) => {
    try {
      const { status, comment } = req.body;
      const documentId = req.params.id;

      const success = await DocumentDAO.updateStatus(
        documentId,
        status,
        req.user.adminId,
        comment
      );

      if (success) {
        // Get document to create notification
        const document = await DocumentDAO.getById(
          documentId,
          req.user.adminId
        );

        if (document) {
          let notificationType, title, message;

          switch (status) {
            case "approved":
              notificationType = "document_approved";
              title = "Dokument odobren";
              message = `Dokument "${document.original_name}" je odobren.`;
              break;
            case "rejected":
              notificationType = "document_rejected";
              title = "Dokument odbačen";
              message = `Dokument "${document.original_name}" je odbačen. ${
                comment || ""
              }`;
              break;
            case "reshoot_requested":
              notificationType = "reshoot_requested";
              title = "Potrebno ponovo slikati";
              message = `Za dokument "${
                document.original_name
              }" je potrebno da ponovo slikate. ${comment || ""}`;
              break;
          }

          if (notificationType) {
            await NotificationDAO.create(
              document.user_id,
              documentId,
              notificationType,
              title,
              message
            );
          }
        }

        res.json({ message: "Document status updated successfully" });
      } else {
        res.status(404).json({ error: "Document not found" });
      }
    } catch (error) {
      console.error("Error updating document status:", error);
      res.status(500).json({ error: "Failed to update document status" });
    }
  }
);

// Get documents pending sync review
app.get("/api/admin/sync-review", authenticateAdmin, async (req, res) => {
  try {
    const documents = await DocumentDAO.getPendingSyncReview(req.user.adminId);
    res.json(documents);
  } catch (error) {
    console.error("Error getting sync review documents:", error);
    res.status(500).json({ error: "Failed to get sync review documents" });
  }
});

// Update OneDrive path
app.put(
  "/api/admin/documents/:id/onedrive-path",
  authenticateAdmin,
  async (req, res) => {
    try {
      const { year, month, path } = req.body;
      const documentId = req.params.id;

      const success = await DocumentDAO.updateOneDrivePath(
        documentId,
        year,
        month,
        path,
        req.user.adminId
      );

      if (success) {
        res.json({ message: "OneDrive path updated successfully" });
      } else {
        res.status(404).json({ error: "Document not found" });
      }
    } catch (error) {
      console.error("Error updating OneDrive path:", error);
      res.status(500).json({ error: "Failed to update OneDrive path" });
    }
  }
);

// Delete document
app.delete("/api/admin/documents/:id", authenticateAdmin, async (req, res) => {
  try {
    const docId = parseInt(req.params.id);
    const document = await DocumentDAO.getById(docId, req.user.adminId);

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    const filePath = path.join(__dirname, "uploads", document.filename);
    try {
      await fs.unlink(filePath);
    } catch (fileError) {
      console.warn("File not found on disk:", document.filename);
    }

    const deleted = await DocumentDAO.deleteById(docId, req.user.adminId);

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

// ============================================================================
// STATIC FILE ROUTES
// ============================================================================

// Serve uploaded files
app.get("/api/files/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);
  res.sendFile(filePath);
});

// Frontend routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "../admin", "index.html"));
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../admin", "dashboard.html"));
});

// API health check
app.get("/api/health", (req, res) => {
  res.json({ message: "DOKUMENTA PORTAL backend ready!" });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer() {
  try {
    const dbConnected = await testConnection();

    if (dbConnected) {
      await initializeDatabase();

      const PORT = process.env.PORT || 3001;
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`✅ Database connected successfully`);
        console.log(`✅ Database initialized successfully`);
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

startServer();
