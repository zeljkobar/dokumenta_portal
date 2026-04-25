const mysql = require("mysql2/promise");
const fs = require("fs").promises;
const path = require("path");
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
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};
const dbName = dbConfig.database;

function escapeIdentifier(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}

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
    if (error && error.code === "ER_BAD_DB_ERROR") {
      try {
        const bootstrapConnection = await mysql.createConnection({
          host: dbConfig.host,
          user: dbConfig.user,
          password: dbConfig.password,
          charset: dbConfig.charset,
          timezone: dbConfig.timezone,
        });

        await bootstrapConnection.query(
          `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(dbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        await bootstrapConnection.end();
        console.log(`✅ Database '${dbName}' created`);
        return true;
      } catch (bootstrapError) {
        console.error("❌ Database bootstrap failed:", bootstrapError.message);
      }
    }

    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

// Execute query with error handling
function isTransientDbError(error) {
  return ["ECONNRESET", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST"].includes(
    error && error.code
  );
}

async function query(sql, params = [], attempt = 1) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    if (attempt === 1 && isTransientDbError(error)) {
      console.warn("Transient database error, retrying query:", error.code);
      const [results] = await pool.execute(sql, params);
      return results;
    }

    console.error("Database query error:", error);
    throw error;
  }
}

// Get connection for transactions
async function getConnection() {
  return await pool.getConnection();
}

// Initialize database from the schema file.
async function initializeDatabase() {
  let connection;

  try {
    const schemaPath = path.join(__dirname, "schema.sql");
    let schemaSql = await fs.readFile(schemaPath, "utf8");

    // Respect configured DB_NAME instead of hardcoded schema defaults.
    schemaSql = schemaSql.replace(
      /CREATE DATABASE IF NOT EXISTS\s+\w+\s*;/i,
      `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(dbName)};`
    );
    schemaSql = schemaSql.replace(/USE\s+\w+\s*;/i, `USE ${escapeIdentifier(dbName)};`);

    connection = await getConnection();
    await connection.query(schemaSql);

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  pool,
  query,
  getConnection,
  testConnection,
  initializeDatabase,
};
