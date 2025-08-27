const { query } = require("./connection");

class UserDAO {
  // Get user by username and admin_id (multi-tenant)
  static async getByUsername(username, adminId) {
    const sql = "SELECT * FROM users WHERE username = ? AND admin_id = ?";
    const result = await query(sql, [username, adminId]);
    return result[0] || null;
  }

  // Get user by email and admin_id (multi-tenant)
  static async getByEmail(email, adminId) {
    const sql = "SELECT * FROM users WHERE email = ? AND admin_id = ?";
    const result = await query(sql, [email, adminId]);
    return result[0] || null;
  }

  // Get user by ID
  static async getById(id) {
    const sql = `
      SELECT 
        id, admin_id, username, email, full_name, company_name, 
        phone, pib, address, notes, status, created_at, last_login 
      FROM users 
      WHERE id = ?
    `;
    const result = await query(sql, [id]);
    return result[0] || null;
  }

  // Create new user (multi-tenant)
  static async create(userData, adminId) {
    const sql = `
      INSERT INTO users (
        admin_id, username, email, password_hash, full_name, 
        company_name, phone, pib, address, notes, status, created_by
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      adminId,
      userData.username,
      userData.email || null,
      userData.password_hash || userData.passwordHash,
      userData.full_name || userData.fullName,
      userData.company_name || userData.companyName || null,
      userData.phone || null,
      userData.pib || null,
      userData.address || null,
      userData.notes || null,
      userData.status || "active",
      adminId, // created_by
    ];

    const result = await query(sql, params);
    return result.insertId;
  }

  // Get all users for specific admin with document count
  static async getAll(adminId) {
    const sql = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.full_name,
        u.company_name, 
        u.phone, 
        u.pib,
        u.status, 
        u.created_at, 
        u.last_login,
        u.notes,
        COUNT(d.id) as document_count
      FROM users u
      LEFT JOIN documents d ON u.id = d.user_id
      WHERE u.admin_id = ?
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    return await query(sql, [adminId]);
  }

  // Update user
  static async update(id, updateData, adminId) {
    const fields = [];
    const params = [];

    // Only allow updates to users belonging to this admin
    Object.keys(updateData).forEach((key) => {
      if (key !== "id" && key !== "admin_id") {
        fields.push(`${key} = ?`);
        params.push(updateData[key]);
      }
    });

    if (fields.length === 0) return false;

    params.push(id, adminId);
    const sql = `UPDATE users SET ${fields.join(
      ", "
    )} WHERE id = ? AND admin_id = ?`;

    const result = await query(sql, params);
    return result.affectedRows > 0;
  }

  // Delete user (only if belongs to admin)
  static async delete(id, adminId) {
    const sql = "DELETE FROM users WHERE id = ? AND admin_id = ?";
    const result = await query(sql, [id, adminId]);
    return result.affectedRows > 0;
  }

  // Update last login
  static async updateLastLogin(id) {
    const sql = "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?";
    await query(sql, [id]);
  }

  // Check if username exists for this admin
  static async usernameExists(username, adminId, excludeId = null) {
    let sql =
      "SELECT COUNT(*) as count FROM users WHERE username = ? AND admin_id = ?";
    let params = [username, adminId];

    if (excludeId) {
      sql += " AND id != ?";
      params.push(excludeId);
    }

    const result = await query(sql, params);
    return result[0].count > 0;
  }

  // Get user stats for admin dashboard
  static async getStats(adminId) {
    const sql = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_users,
        COUNT(CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as recent_logins
      FROM users 
      WHERE admin_id = ?
    `;
    const result = await query(sql, [adminId]);
    return result[0] || {};
  }
}

class AdminUserDAO {
  // Get admin by username
  static async getByUsername(username) {
    const sql = "SELECT * FROM admin_users WHERE username = ?";
    const result = await query(sql, [username]);
    return result[0] || null;
  }

  // Get admin by email
  static async getByEmail(email) {
    const sql = "SELECT * FROM admin_users WHERE email = ?";
    const result = await query(sql, [email]);
    return result[0] || null;
  }

  // Get admin by ID
  static async getById(id) {
    const sql = `
      SELECT 
        id, username, email, company_name, full_name, phone, 
        subscription_plan, max_clients, max_storage_mb, is_active,
        created_at, last_login
      FROM admin_users 
      WHERE id = ?
    `;
    const result = await query(sql, [id]);
    return result[0] || null;
  }

  // Update last login
  static async updateLastLogin(id) {
    const sql =
      "UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?";
    await query(sql, [id]);
  }

  // Get all admins (super admin function)
  static async getAll() {
    const sql = `
      SELECT 
        id, username, email, company_name, full_name, 
        subscription_plan, is_active, created_at, last_login 
      FROM admin_users 
      ORDER BY created_at DESC
    `;
    return await query(sql);
  }

  // Create new admin
  static async create(adminData) {
    const sql = `
      INSERT INTO admin_users (
        username, email, password_hash, company_name, full_name, 
        phone, subscription_plan, max_clients, max_storage_mb
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      adminData.username,
      adminData.email,
      adminData.password_hash || adminData.passwordHash,
      adminData.company_name || adminData.companyName,
      adminData.full_name || adminData.fullName || null,
      adminData.phone || null,
      adminData.subscription_plan || "basic",
      adminData.max_clients || 10,
      adminData.max_storage_mb || 1000,
    ];

    const result = await query(sql, params);
    return result.insertId;
  }

  // Update admin profile
  static async update(id, updateData) {
    const fields = [];
    const params = [];

    Object.keys(updateData).forEach((key) => {
      if (key !== "id") {
        fields.push(`${key} = ?`);
        params.push(updateData[key]);
      }
    });

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE admin_users SET ${fields.join(", ")} WHERE id = ?`;

    const result = await query(sql, params);
    return result.affectedRows > 0;
  }

  // Check subscription limits
  static async checkLimits(adminId) {
    const sql = `
      SELECT 
        au.max_clients,
        au.max_storage_mb,
        COUNT(u.id) as current_clients,
        COALESCE(SUM(d.original_size), 0) / (1024 * 1024) as current_storage_mb
      FROM admin_users au
      LEFT JOIN users u ON au.id = u.admin_id AND u.status = 'active'
      LEFT JOIN documents d ON u.id = d.user_id
      WHERE au.id = ?
      GROUP BY au.id
    `;
    const result = await query(sql, [adminId]);
    return result[0] || {};
  }
}

module.exports = {
  UserDAO,
  AdminUserDAO,
};
