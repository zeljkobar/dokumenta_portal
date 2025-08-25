const { query } = require("./connection");

class DocumentDAO {
  // Create new document record
  static async create(documentData) {
    const sql = `
      INSERT INTO documents (
        filename, original_name, user_id, document_type, 
        original_size, compressed_size, compression_ratio,
        comment, page_number, total_pages, file_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      documentData.filename,
      documentData.originalName,
      documentData.userId,
      documentData.documentType,
      documentData.originalSize,
      documentData.compressedSize,
      documentData.compressionRatio,
      documentData.comment || "",
      documentData.pageNumber || 1,
      documentData.totalPages || 1,
      documentData.filePath,
    ];

    const result = await query(sql, params);
    return result.insertId;
  }

  // Get all documents with optional filters
  static async getAll(filters = {}) {
    let sql = `
      SELECT d.*, u.username 
      FROM documents d 
      JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Apply filters
    if (filters.documentType) {
      sql += " AND d.document_type = ?";
      params.push(filters.documentType);
    }

    if (filters.userId) {
      sql += " AND d.user_id = ?";
      params.push(filters.userId);
    }

    if (filters.dateFrom) {
      sql += " AND d.upload_date >= ?";
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      sql += " AND d.upload_date <= ?";
      params.push(filters.dateTo);
    }

    // Order by upload date (newest first)
    sql += " ORDER BY d.upload_date DESC";

    // Apply limit
    if (filters.limit) {
      sql += " LIMIT ?";
      params.push(parseInt(filters.limit));
    }

    return await query(sql, params);
  }

  // Get document by ID
  static async getById(id) {
    const sql = `
      SELECT d.*, u.username 
      FROM documents d 
      JOIN users u ON d.user_id = u.id 
      WHERE d.id = ?
    `;

    const result = await query(sql, [id]);
    return result[0] || null;
  }

  // Get documents by user ID
  static async getByUserId(userId) {
    const sql = `
      SELECT d.*, u.username 
      FROM documents d 
      JOIN users u ON d.user_id = u.id 
      WHERE d.user_id = ? 
      ORDER BY d.upload_date DESC
    `;

    return await query(sql, [userId]);
  }

  // Delete document by ID
  static async deleteById(id) {
    const sql = "DELETE FROM documents WHERE id = ?";
    const result = await query(sql, [id]);
    return result.affectedRows > 0;
  }

  // Get statistics
  static async getStats() {
    const statsQueries = [
      // Total documents
      "SELECT COUNT(*) as total FROM documents",

      // Today's documents
      `SELECT COUNT(*) as today FROM documents 
       WHERE DATE(upload_date) = CURDATE()`,

      // Total size
      "SELECT SUM(compressed_size) as totalSize FROM documents",

      // Active users
      "SELECT COUNT(DISTINCT user_id) as activeUsers FROM documents",
    ];

    const [total, today, size, users] = await Promise.all(
      statsQueries.map((sql) => query(sql))
    );

    return {
      totalDocuments: total[0].total,
      todayDocuments: today[0].today,
      totalSize: size[0].totalSize || 0,
      activeUsers: users[0].activeUsers,
    };
  }

  // Get documents grouped by type
  static async getByType() {
    const sql = `
      SELECT 
        document_type,
        COUNT(*) as count,
        SUM(compressed_size) as totalSize
      FROM documents 
      GROUP BY document_type
    `;

    return await query(sql);
  }

  // Update document
  static async update(id, updateData) {
    const fields = [];
    const params = [];

    Object.keys(updateData).forEach((key) => {
      fields.push(`${key} = ?`);
      params.push(updateData[key]);
    });

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE documents SET ${fields.join(", ")} WHERE id = ?`;

    const result = await query(sql, params);
    return result.affectedRows > 0;
  }
}

module.exports = DocumentDAO;
