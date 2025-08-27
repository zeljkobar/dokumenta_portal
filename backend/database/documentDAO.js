const { query } = require("./connection");

class DocumentDAO {
  // Create new document record with multi-tenant support
  static async create(documentData, adminId) {
    const sql = `
      INSERT INTO documents (
        admin_id, user_id, filename, original_name, file_path, mime_type,
        original_size, compressed_size, compression_ratio, document_type, 
        document_subtype, user_comment, suggested_year, suggested_month, 
        suggested_onedrive_path, actual_year, actual_month, actual_onedrive_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Auto-generate suggested OneDrive path
    const uploadDate = new Date();
    const suggestedYear = uploadDate.getFullYear();
    const suggestedMonth = uploadDate.getMonth() + 1;
    const monthNames = [
      "",
      "01_januar",
      "02_februar",
      "03_mart",
      "04_april",
      "05_maj",
      "06_juni",
      "07_juli",
      "08_avgust",
      "09_septembar",
      "10_oktobar",
      "11_novembar",
      "12_decembar",
    ];

    const suggestedPath = `/Firme/${
      documentData.companyName || "Unknown"
    }/${suggestedYear}/${documentData.documentType}/${
      monthNames[suggestedMonth]
    }/`;

    const params = [
      adminId,
      documentData.userId,
      documentData.filename,
      documentData.originalName,
      documentData.filePath,
      documentData.mimeType || null,
      documentData.originalSize,
      documentData.compressedSize || null,
      documentData.compressionRatio || null,
      documentData.documentType,
      documentData.documentSubtype || "ostalo",
      documentData.userComment || null,
      suggestedYear,
      suggestedMonth,
      suggestedPath,
      suggestedYear, // initially same as suggested
      suggestedMonth, // initially same as suggested
      suggestedPath, // initially same as suggested
    ];

    const result = await query(sql, params);
    return result.insertId;
  }

  // Get all documents for specific admin with optional filters
  static async getAll(adminId, filters = {}) {
    let sql = `
      SELECT d.*, u.username, u.company_name, u.full_name,
             au.username as reviewed_by_username
      FROM documents d 
      JOIN users u ON d.user_id = u.id
      LEFT JOIN admin_users au ON d.reviewed_by = au.id
      WHERE d.admin_id = ?
    `;
    const params = [adminId];

    // Apply filters
    if (filters.documentType) {
      sql += " AND d.document_type = ?";
      params.push(filters.documentType);
    }

    if (filters.documentSubtype) {
      sql += " AND d.document_subtype = ?";
      params.push(filters.documentSubtype);
    }

    if (filters.status) {
      sql += " AND d.status = ?";
      params.push(filters.status);
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

    if (filters.syncStatus) {
      sql += " AND d.sync_status = ?";
      params.push(filters.syncStatus);
    }

    if (filters.syncPendingReview) {
      sql += " AND d.sync_pending_review = ?";
      params.push(filters.syncPendingReview);
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

  // Get document by ID (with admin check)
  static async getById(id, adminId) {
    const sql = `
      SELECT d.*, u.username, u.company_name, u.full_name,
             au.username as reviewed_by_username
      FROM documents d 
      JOIN users u ON d.user_id = u.id
      LEFT JOIN admin_users au ON d.reviewed_by = au.id
      WHERE d.id = ? AND d.admin_id = ?
    `;

    const result = await query(sql, [id, adminId]);
    return result[0] || null;
  }

  // Get documents by user ID (with admin check)
  static async getByUserId(userId, adminId) {
    const sql = `
      SELECT d.*, u.username, u.company_name, u.full_name
      FROM documents d 
      JOIN users u ON d.user_id = u.id 
      WHERE d.user_id = ? AND d.admin_id = ?
      ORDER BY d.upload_date DESC
    `;

    return await query(sql, [userId, adminId]);
  }

  // Update document status with history tracking
  static async updateStatus(id, newStatus, adminId, comment = null) {
    // First get current status
    const currentDoc = await this.getById(id, adminId);
    if (!currentDoc) return false;

    // Update document
    const updateSql = `
      UPDATE documents 
      SET status = ?, admin_comment = ?, reviewed_date = CURRENT_TIMESTAMP, reviewed_by = ?
      WHERE id = ? AND admin_id = ?
    `;

    const updateResult = await query(updateSql, [
      newStatus,
      comment,
      adminId,
      id,
      adminId,
    ]);

    if (updateResult.affectedRows > 0) {
      // Add to status history
      const historySql = `
        INSERT INTO document_status_history (document_id, old_status, new_status, changed_by, comment)
        VALUES (?, ?, ?, ?, ?)
      `;
      await query(historySql, [
        id,
        currentDoc.status,
        newStatus,
        adminId,
        comment,
      ]);

      return true;
    }

    return false;
  }

  // Update OneDrive sync path (admin override)
  static async updateOneDrivePath(
    id,
    actualYear,
    actualMonth,
    actualPath,
    adminId
  ) {
    const sql = `
      UPDATE documents 
      SET actual_year = ?, actual_month = ?, actual_onedrive_path = ?, 
          path_manually_set = TRUE, sync_pending_review = FALSE
      WHERE id = ? AND admin_id = ?
    `;

    const result = await query(sql, [
      actualYear,
      actualMonth,
      actualPath,
      id,
      adminId,
    ]);
    return result.affectedRows > 0;
  }

  // Get documents pending sync review
  static async getPendingSyncReview(adminId) {
    const sql = `
      SELECT d.*, u.company_name, u.full_name
      FROM documents d
      JOIN users u ON d.user_id = u.id
      WHERE d.admin_id = ? AND d.sync_pending_review = TRUE
      ORDER BY d.upload_date DESC
    `;

    return await query(sql, [adminId]);
  }

  // Update OneDrive sync status
  static async updateSyncStatus(
    id,
    syncStatus,
    oneDriveFileId = null,
    errorMessage = null,
    adminId
  ) {
    const sql = `
      UPDATE documents 
      SET sync_status = ?, onedrive_file_id = ?, sync_error_message = ?,
          onedrive_synced_at = CASE WHEN ? = 'synced' THEN CURRENT_TIMESTAMP ELSE onedrive_synced_at END
      WHERE id = ? AND admin_id = ?
    `;

    const result = await query(sql, [
      syncStatus,
      oneDriveFileId,
      errorMessage,
      syncStatus,
      id,
      adminId,
    ]);
    return result.affectedRows > 0;
  }

  // Delete document by ID (with admin check)
  static async deleteById(id, adminId) {
    const sql = "DELETE FROM documents WHERE id = ? AND admin_id = ?";
    const result = await query(sql, [id, adminId]);
    return result.affectedRows > 0;
  }

  // Get statistics for specific admin
  static async getStats(adminId) {
    const statsQueries = [
      // Total documents
      "SELECT COUNT(*) as total FROM documents WHERE admin_id = ?",

      // Today's documents
      `SELECT COUNT(*) as today FROM documents 
       WHERE admin_id = ? AND DATE(upload_date) = CURDATE()`,

      // Documents by status
      `SELECT status, COUNT(*) as count FROM documents 
       WHERE admin_id = ? GROUP BY status`,

      // Sync status
      `SELECT sync_status, COUNT(*) as count FROM documents 
       WHERE admin_id = ? GROUP BY sync_status`,

      // Total size
      "SELECT SUM(COALESCE(compressed_size, original_size)) as totalSize FROM documents WHERE admin_id = ?",

      // Pending review count
      "SELECT COUNT(*) as pending FROM documents WHERE admin_id = ? AND sync_pending_review = TRUE",
    ];

    const [total, today, byStatus, bySyncStatus, size, pending] =
      await Promise.all([
        query(statsQueries[0], [adminId]),
        query(statsQueries[1], [adminId]),
        query(statsQueries[2], [adminId]),
        query(statsQueries[3], [adminId]),
        query(statsQueries[4], [adminId]),
        query(statsQueries[5], [adminId]),
      ]);

    return {
      totalDocuments: total[0].total,
      todayDocuments: today[0].today,
      documentsByStatus: byStatus,
      documentsBySyncStatus: bySyncStatus,
      totalSize: size[0].totalSize || 0,
      pendingSyncReview: pending[0].pending,
    };
  }

  // Get documents grouped by type for specific admin
  static async getByType(adminId) {
    const sql = `
      SELECT 
        document_type,
        document_subtype,
        COUNT(*) as count,
        SUM(COALESCE(compressed_size, original_size)) as totalSize
      FROM documents 
      WHERE admin_id = ?
      GROUP BY document_type, document_subtype
      ORDER BY document_type, document_subtype
    `;

    return await query(sql, [adminId]);
  }

  // Update document (with admin check)
  static async update(id, updateData, adminId) {
    const allowedFields = [
      "filename",
      "original_name",
      "document_type",
      "document_subtype",
      "user_comment",
      "admin_comment",
      "status",
      "actual_year",
      "actual_month",
      "actual_onedrive_path",
      "sync_status",
    ];

    const fields = [];
    const params = [];

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        params.push(updateData[key]);
      }
    });

    if (fields.length === 0) return false;

    params.push(id, adminId);
    const sql = `UPDATE documents SET ${fields.join(
      ", "
    )} WHERE id = ? AND admin_id = ?`;

    const result = await query(sql, params);
    return result.affectedRows > 0;
  }

  // Get document status history
  static async getStatusHistory(documentId, adminId) {
    const sql = `
      SELECT h.*, au.username as changed_by_username
      FROM document_status_history h
      JOIN admin_users au ON h.changed_by = au.id
      JOIN documents d ON h.document_id = d.id
      WHERE h.document_id = ? AND d.admin_id = ?
      ORDER BY h.created_at DESC
    `;

    return await query(sql, [documentId, adminId]);
  }
}

// Notification handling
class NotificationDAO {
  // Create notification for user
  static async create(userId, documentId, type, title, message) {
    const sql = `
      INSERT INTO notifications (user_id, document_id, type, title, message)
      VALUES (?, ?, ?, ?, ?)
    `;

    const result = await query(sql, [userId, documentId, type, title, message]);
    return result.insertId;
  }

  // Get user notifications
  static async getByUserId(userId, unreadOnly = false) {
    let sql = `
      SELECT n.*, d.filename, d.document_type
      FROM notifications n
      LEFT JOIN documents d ON n.document_id = d.id
      WHERE n.user_id = ?
    `;

    if (unreadOnly) {
      sql += " AND n.is_read = FALSE";
    }

    sql += " ORDER BY n.created_at DESC LIMIT 50";

    return await query(sql, [userId]);
  }

  // Mark notification as read
  static async markAsRead(id, userId) {
    const sql = `
      UPDATE notifications 
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND user_id = ?
    `;

    const result = await query(sql, [id, userId]);
    return result.affectedRows > 0;
  }

  // Mark all notifications as read for user
  static async markAllAsRead(userId) {
    const sql = `
      UPDATE notifications 
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
      WHERE user_id = ? AND is_read = FALSE
    `;

    const result = await query(sql, [userId]);
    return result.affectedRows > 0;
  }
}

module.exports = {
  DocumentDAO,
  NotificationDAO,
};
