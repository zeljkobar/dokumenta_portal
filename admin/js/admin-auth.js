// Admin Auth utility functions
const API_BASE = "/api";

class AdminAuth {
  static getToken() {
    return localStorage.getItem("adminToken");
  }

  static setToken(token) {
    localStorage.setItem("adminToken", token);
  }

  static removeToken() {
    localStorage.removeItem("adminToken");
  }

  static isLoggedIn() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.exp * 1000 > Date.now() && payload.role === "admin";
    } catch (e) {
      return false;
    }
  }

  static getAdmin() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return { id: payload.id, username: payload.username, role: payload.role };
    } catch (e) {
      return null;
    }
  }

  static async login(username, password) {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok) {
      this.setToken(data.token);
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  }

  static logout() {
    this.removeToken();
    window.location.href = "index.html";
  }

  static getAuthHeaders() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

// Check if admin is already logged in and redirect
if (AdminAuth.isLoggedIn() && window.location.pathname.includes("index.html")) {
  window.location.href = "dashboard.html";
}
