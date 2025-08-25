// Admin login functionality
document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("adminLoginForm");
  const loginBtn = document.getElementById("adminLoginBtn");
  const loginSpinner = document.getElementById("adminLoginSpinner");
  const errorAlert = document.getElementById("adminErrorAlert");

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("adminUsername").value;
    const password = document.getElementById("adminPassword").value;

    // Show loading state
    loginBtn.disabled = true;
    loginSpinner.classList.remove("d-none");
    errorAlert.classList.add("d-none");

    try {
      const result = await AdminAuth.login(username, password);

      if (result.success) {
        // Redirect to admin dashboard
        window.location.href = "dashboard.html";
      } else {
        // Show error
        errorAlert.textContent = result.error || "Greška prilikom prijave";
        errorAlert.classList.remove("d-none");
      }
    } catch (error) {
      errorAlert.textContent = "Greška mreže. Pokušajte ponovo.";
      errorAlert.classList.remove("d-none");
    } finally {
      // Hide loading state
      loginBtn.disabled = false;
      loginSpinner.classList.add("d-none");
    }
  });

  // Pre-fill admin credentials for testing
  document.getElementById("adminUsername").value = "admin";
  document.getElementById("adminPassword").value = "admin123";
});
