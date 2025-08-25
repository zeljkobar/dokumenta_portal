const { query } = require("./connection");

class UserDAO {
  // Get user by username
  static async getByUsername(username) {
    const sql = "SELECT * FROM users WHERE username = ?";
    const result = await query(sql, [username]);
    return result[0] || null;
  }

  // Get user by ID
  static async getById(id) {
    const sql = "SELECT id, username, role, created_at FROM users WHERE id = ?";
    const result = await query(sql, [id]);
    return result[0] || null;
  }

  // Create new user
  static async create(userData) {
    const sql = `
      INSERT INTO users (username, password_hash, role) 
      VALUES (?, ?, ?)
    `;

    const params = [
      userData.username,
      userData.passwordHash,
      userData.role || "user",
    ];

    const result = await query(sql, params);
    return result.insertId;
  }

  // Get all users
  static async getAll() {
    const sql =
      "SELECT id, username, role, created_at FROM users ORDER BY created_at DESC";
    return await query(sql);
  }

  // Update user
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
    const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;

    const result = await query(sql, params);
    return result.affectedRows > 0;
  }

  // Delete user
  static async deleteById(id) {
    const sql = "DELETE FROM users WHERE id = ?";
    const result = await query(sql, [id]);
    return result.affectedRows > 0;
  }

  // Check if username exists
  static async usernameExists(username) {
    const sql = "SELECT COUNT(*) as count FROM users WHERE username = ?";
    const result = await query(sql, [username]);
    return result[0].count > 0;
  }
}

class AdminUserDAO {
  // Get admin by username
  static async getByUsername(username) {
    const sql = "SELECT * FROM admin_users WHERE username = ?";
    const result = await query(sql, [username]);
    return result[0] || null;
  }

  // Update last login
  static async updateLastLogin(id) {
    const sql =
      "UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?";
    await query(sql, [id]);
  }

  // Get all admins
  static async getAll() {
    const sql =
      "SELECT id, username, created_at, last_login FROM admin_users ORDER BY created_at DESC";
    return await query(sql);
  }

  // Create new admin
  static async create(adminData) {
    const sql =
      "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)";
    const result = await query(sql, [
      adminData.username,
      adminData.passwordHash,
    ]);
    return result.insertId;
  }
}

module.exports = {
  UserDAO,
  AdminUserDAO,
};
