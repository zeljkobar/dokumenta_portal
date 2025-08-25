// Login page functionality
document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");
  const loginSpinner = document.getElementById("loginSpinner");
  const errorAlert = document.getElementById("errorAlert");

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    // Show loading state
    loginBtn.disabled = true;
    loginSpinner.classList.remove("d-none");
    errorAlert.classList.add("d-none");

    try {
      const result = await Auth.login(username, password);

      if (result.success) {
        // Redirect to dashboard
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

  // Pre-fill demo credentials for testing
  document.getElementById("username").value = "demo";
  document.getElementById("password").value = "demo123";
});
