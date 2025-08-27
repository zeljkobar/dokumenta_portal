const mysql = require("mysql2/promise");
require("dotenv").config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "dokumenta_portal",
  charset: "utf8mb4",
};

async function checkDatabaseStructure() {
  let connection;

  try {
    console.log("🔌 Connecting to database...");
    console.log("📍 Host:", dbConfig.host);
    console.log("👤 User:", dbConfig.user);
    console.log("🏗️  Database:", dbConfig.database);
    console.log("─".repeat(60));

    connection = await mysql.createConnection(dbConfig);

    console.log("✅ Connected successfully!\n");

    // 1. Show all tables
    console.log("📋 ALL TABLES:");
    console.log("─".repeat(30));
    const [tables] = await connection.execute("SHOW TABLES");
    tables.forEach((table, index) => {
      const tableName = Object.values(table)[0];
      console.log(`${index + 1}. ${tableName}`);
    });

    console.log("\n" + "═".repeat(60) + "\n");

    // 2. Detailed structure for each table
    for (const table of tables) {
      const tableName = Object.values(table)[0];

      console.log(`🏗️  TABLE STRUCTURE: ${tableName.toUpperCase()}`);
      console.log("─".repeat(40));

      // Get table structure
      const [columns] = await connection.execute(`DESCRIBE ${tableName}`);

      console.log("COLUMNS:");
      columns.forEach((col, index) => {
        console.log(
          `  ${index + 1}. ${col.Field} | ${col.Type} | ${col.Null} | ${
            col.Key
          } | ${col.Default} | ${col.Extra}`
        );
      });

      // Get row count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as count FROM ${tableName}`
      );
      console.log(`📊 Total rows: ${countResult[0].count}`);

      // Show foreign keys
      const [foreignKeys] = await connection.execute(
        `
                SELECT 
                    COLUMN_NAME,
                    CONSTRAINT_NAME,
                    REFERENCED_TABLE_NAME,
                    REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE 
                WHERE TABLE_SCHEMA = ? 
                AND TABLE_NAME = ? 
                AND REFERENCED_TABLE_NAME IS NOT NULL
            `,
        [dbConfig.database, tableName]
      );

      if (foreignKeys.length > 0) {
        console.log("🔗 FOREIGN KEYS:");
        foreignKeys.forEach((fk) => {
          console.log(
            `  ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`
          );
        });
      }

      // Show indexes
      const [indexes] = await connection.execute(
        `SHOW INDEX FROM ${tableName}`
      );
      if (indexes.length > 0) {
        console.log("📇 INDEXES:");
        const indexGroups = {};
        indexes.forEach((idx) => {
          if (!indexGroups[idx.Key_name]) {
            indexGroups[idx.Key_name] = [];
          }
          indexGroups[idx.Key_name].push(idx.Column_name);
        });

        Object.keys(indexGroups).forEach((indexName) => {
          console.log(`  ${indexName}: ${indexGroups[indexName].join(", ")}`);
        });
      }

      console.log("\n" + "─".repeat(60) + "\n");
    }

    // 3. Check for potential issues
    console.log("🔍 POTENTIAL ISSUES CHECK:");
    console.log("─".repeat(30));

    // Check for tables with similar names
    const tableNames = tables.map((t) => Object.values(t)[0]);
    const similarTables = [];

    for (let i = 0; i < tableNames.length; i++) {
      for (let j = i + 1; j < tableNames.length; j++) {
        const table1 = tableNames[i].toLowerCase();
        const table2 = tableNames[j].toLowerCase();

        // Check if tables are similar (dokumenti vs documents)
        if (
          (table1.includes("dokument") && table2.includes("document")) ||
          (table1.includes("document") && table2.includes("dokument"))
        ) {
          similarTables.push([tableNames[i], tableNames[j]]);
        }
      }
    }

    if (similarTables.length > 0) {
      console.log("⚠️  Found potentially duplicate tables:");
      similarTables.forEach((pair) => {
        console.log(`  ${pair[0]} ↔️ ${pair[1]}`);
      });
    } else {
      console.log("✅ No duplicate table names found");
    }

    // 4. Check all foreign key constraints in database
    console.log("\n🔗 ALL FOREIGN KEY CONSTRAINTS:");
    console.log("─".repeat(40));
    const [allForeignKeys] = await connection.execute(
      `
            SELECT 
                TABLE_NAME,
                COLUMN_NAME,
                CONSTRAINT_NAME,
                REFERENCED_TABLE_NAME,
                REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE 
            WHERE TABLE_SCHEMA = ? 
            AND REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY TABLE_NAME, COLUMN_NAME
        `,
      [dbConfig.database]
    );

    if (allForeignKeys.length > 0) {
      allForeignKeys.forEach((fk) => {
        console.log(
          `${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`
        );
      });
    } else {
      console.log("No foreign key constraints found");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    if (connection) {
      await connection.end();
      console.log("\n🔌 Database connection closed");
    }
  }
}

// Run the script
if (require.main === module) {
  console.log("🚀 Starting database structure check...\n");
  checkDatabaseStructure()
    .then(() => {
      console.log("\n✅ Database structure check completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Script failed:", error);
      process.exit(1);
    });
}

module.exports = { checkDatabaseStructure };
