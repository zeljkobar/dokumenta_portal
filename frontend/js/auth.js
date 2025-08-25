// Auth utility functions
const API_BASE = "http://localhost:3001/api";

class Auth {
  static getToken() {
    return localStorage.getItem("documentaToken");
  }

  static setToken(token) {
    localStorage.setItem("documentaToken", token);
  }

  static removeToken() {
    localStorage.removeItem("documentaToken");
  }

  static isLoggedIn() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.exp * 1000 > Date.now();
    } catch (e) {
      return false;
    }
  }

  static getUser() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return { id: payload.id, username: payload.username };
    } catch (e) {
      return null;
    }
  }

  static async login(username, password) {
    const response = await fetch(`${API_BASE}/login`, {
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

  static getAuthHeaders(includeContentType = true) {
    const token = this.getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }
}

// Check if user is already logged in and redirect
if (Auth.isLoggedIn() && window.location.pathname.includes("index.html")) {
  window.location.href = "dashboard.html";
}
