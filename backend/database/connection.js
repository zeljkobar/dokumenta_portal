const mysql = require("mysql2/promise");
require("dotenv").config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "dokumenta_portal",
  charset: "utf8mb4",
  timezone: "+00:00",
  multipleStatements: true,
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully");
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

// Execute query with error handling
async function query(sql, params = []) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

// Get connection for transactions
async function getConnection() {
  return await pool.getConnection();
}

// Initialize database (create tables if they don't exist)
async function initializeDatabase() {
  try {
    const connection = await getConnection();

    // Read schema file would be better, but for now inline SQL
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    const createDocumentsTable = `
      CREATE TABLE IF NOT EXISTS documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        user_id INT NOT NULL,
        document_type ENUM('racun', 'ugovor', 'izvod', 'potvrda', 'ostalo') NOT NULL,
        original_size INT NOT NULL,
        compressed_size INT NOT NULL,
        compression_ratio VARCHAR(10),
        comment TEXT,
        page_number INT DEFAULT 1,
        total_pages INT DEFAULT 1,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        file_path VARCHAR(500) NOT NULL,
        processed BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_document_type (document_type),
        INDEX idx_upload_date (upload_date)
      )
    `;

    const createAdminUsersTable = `
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      )
    `;

    await connection.execute(createUsersTable);
    await connection.execute(createDocumentsTable);
    await connection.execute(createAdminUsersTable);

    // Insert default demo user (password: demo123)
    const demoUserExists = await connection.execute(
      "SELECT id FROM users WHERE username = ?",
      ["demo"]
    );

    if (demoUserExists[0].length === 0) {
      await connection.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ["demo", "demo123", "user"] // In production, this should be hashed
      );
      console.log("✅ Demo user created");
    }

    // Insert default admin user (password: admin123)
    const adminUserExists = await connection.execute(
      "SELECT id FROM admin_users WHERE username = ?",
      ["admin"]
    );

    if (adminUserExists[0].length === 0) {
      await connection.execute(
        "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
        ["admin", "admin123"] // In production, this should be hashed
      );
      console.log("✅ Admin user created");
    }

    connection.release();
    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  getConnection,
  testConnection,
  initializeDatabase,
};
