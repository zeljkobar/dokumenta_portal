// Admin dashboard functionality
document.addEventListener("DOMContentLoaded", function () {
  // Check if admin is logged in
  if (!AdminAuth.isLoggedIn()) {
    window.location.href = "index.html";
    return;
  }

  // Display admin welcome message
  const admin = AdminAuth.getAdmin();
  document.getElementById(
    "adminWelcome"
  ).textContent = `Pozdrav, ${admin.username}!`;

  // Initialize dashboard
  loadStats();
  loadUsers();
  loadDocuments();

  // Setup tab change handlers
  document.getElementById("users-tab").addEventListener("click", function () {
    loadUsers();
  });

  // Setup form handlers
  setupUserManagement();
});

function setupUserManagement() {
  // Add user form
  document
    .getElementById("addUserForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      await addUser();
    });

  // Edit user form
  document
    .getElementById("editUserForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      await updateUser();
    });
}

async function addUser() {
  const userData = {
    username: document.getElementById("userUsername").value,
    email: document.getElementById("userEmail").value,
    password: document.getElementById("userPassword").value,
    fullName: document.getElementById("userFullName").value,
    companyName: document.getElementById("userCompanyName").value,
    phone: document.getElementById("userPhone").value,
    pib: document.getElementById("userPib").value,
    notes: document.getElementById("userNotes").value,
  };

  try {
    const response = await fetch(`${API_BASE}/admin/users`, {
      method: "POST",
      headers: {
        ...AdminAuth.getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (response.ok) {
      const result = await response.json();
      alert("Korisnik je uspešno dodat!");

      // Close modal and reset form
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("addUserModal")
      );
      modal.hide();
      document.getElementById("addUserForm").reset();

      // Reload users table
      loadUsers();
    } else {
      const error = await response.json();
      alert("Greška: " + (error.error || "Neuspešno dodavanje korisnika"));
    }
  } catch (error) {
    console.error("Error adding user:", error);
    alert("Greška pri dodavanju korisnika");
  }
}

async function updateUser() {
  const userId = document.getElementById("editUserId").value;
  const userData = {
    username: document.getElementById("editUserUsername").value,
    email: document.getElementById("editUserEmail").value,
    fullName: document.getElementById("editUserFullName").value,
    companyName: document.getElementById("editUserCompanyName").value,
    phone: document.getElementById("editUserPhone").value,
    pib: document.getElementById("editUserPib").value,
    status: document.getElementById("editUserStatus").value,
    notes: document.getElementById("editUserNotes").value,
  };

  // Only include password if it's provided
  const password = document.getElementById("editUserPassword").value;
  if (password) {
    userData.password = password;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        ...AdminAuth.getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (response.ok) {
      alert("Korisnik je uspešno ažuriran!");

      // Close modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("editUserModal")
      );
      modal.hide();

      // Reload users table
      loadUsers();
    } else {
      const error = await response.json();
      alert("Greška: " + (error.error || "Neuspešno ažuriranje korisnika"));
    }
  } catch (error) {
    console.error("Error updating user:", error);
    alert("Greška pri ažuriranju korisnika");
  }
}

function editUser(userId) {
  // Find user data from current table
  const userRow = document.querySelector(`tr[data-user-id="${userId}"]`);
  if (!userRow) return;

  const cells = userRow.cells;

  // Populate edit form
  document.getElementById("editUserId").value = userId;
  document.getElementById("editUserUsername").value = cells[1].textContent;
  document.getElementById("editUserEmail").value = cells[2].textContent;
  document.getElementById("editUserPassword").value = "";
  document.getElementById("editUserCompany").value =
    cells[6]?.textContent || "";
  document.getElementById("editUserPhone").value = cells[7]?.textContent || "";
  document.getElementById("editUserStatus").value =
    cells[3].textContent.toLowerCase();
  document.getElementById("editUserNotes").value = "";

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("editUserModal"));
  modal.show();
}

async function deleteUser(userId, username) {
  if (
    !confirm(`Da li ste sigurni da želite da obrišete korisnika "${username}"?`)
  ) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: "DELETE",
      headers: AdminAuth.getAuthHeaders(),
    });

    if (response.ok) {
      alert("Korisnik je uspešno obrisan!");
      loadUsers();
    } else {
      const error = await response.json();
      alert("Greška: " + (error.error || "Neuspešno brisanje korisnika"));
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    alert("Greška pri brisanju korisnika");
  }
}

async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/admin/stats`, {
      headers: AdminAuth.getAuthHeaders(),
    });

    if (response.ok) {
      const stats = await response.json();
      document.getElementById("totalDocuments").textContent =
        stats.totalDocuments || 0;
      document.getElementById("todayDocuments").textContent =
        stats.todayDocuments || 0;
      document.getElementById("activeUsers").textContent =
        stats.activeUsers || 0;
      document.getElementById("totalSize").textContent = formatFileSize(
        stats.totalSize || 0
      );
    }
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

async function loadUsers() {
  try {
    const response = await fetch(`${API_BASE}/admin/users`, {
      headers: AdminAuth.getAuthHeaders(),
    });

    if (response.ok) {
      const users = await response.json();

      // Update filter dropdown
      const userSelect = document.getElementById("filterUser");
      userSelect.innerHTML = '<option value="">Svi korisnici</option>';

      users.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.username;
        option.textContent = user.username;
        userSelect.appendChild(option);
      });

      // Update users table
      const usersTable = document.getElementById("usersTable");
      if (usersTable) {
        if (users.length === 0) {
          usersTable.innerHTML = `
            <tr>
              <td colspan="7" class="text-center">Nema registrovanih korisnika</td>
            </tr>
          `;
        } else {
          usersTable.innerHTML = users
            .map(
              (user) => `
            <tr data-user-id="${user.id}">
              <td>${user.id}</td>
              <td>${user.username}</td>
              <td>${user.email || "-"}</td>
              <td>
                <span class="badge ${
                  user.status === "active" ? "bg-success" : "bg-secondary"
                }">
                  ${user.status === "active" ? "Aktivan" : "Neaktivan"}
                </span>
              </td>
              <td>${
                user.last_login
                  ? new Date(user.last_login).toLocaleDateString("sr-RS")
                  : "Nikad"
              }</td>
              <td>${user.document_count || 0}</td>
              <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editUser(${
                  user.id
                })">
                  ✏️ Uredi
                </button>
                <button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteUser(${
                  user.id
                }, '${user.username}')">
                  🗑️ Obriši
                </button>
              </td>
            </tr>
          `
            )
            .join("");
        }
      }
    }
  } catch (error) {
    console.error("Error loading users:", error);
    const usersTable = document.getElementById("usersTable");
    if (usersTable) {
      usersTable.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger">Greška pri učitavanju korisnika</td>
        </tr>
      `;
    }
  }
}

async function loadDocuments() {
  try {
    const filters = {
      type: document.getElementById("filterType").value,
      user: document.getElementById("filterUser").value,
      date: document.getElementById("filterDate").value,
    };

    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const response = await fetch(`${API_BASE}/admin/documents?${queryParams}`, {
      headers: AdminAuth.getAuthHeaders(),
    });

    if (response.ok) {
      const documents = await response.json();
      displayDocuments(documents);
    } else {
      showError("Greška prilikom učitavanja dokumenata");
    }
  } catch (error) {
    console.error("Error loading documents:", error);
    showError("Greška mreže prilikom učitavanja dokumenata");
  }
}

function displayDocuments(documents) {
  const tbody = document.getElementById("documentsTable");

  if (documents.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted">
                    Nema dokumenata za prikaz
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = documents
    .map(
      (doc) => `
        <tr>
            <td>
                <input type="checkbox" class="form-check-input document-checkbox" value="${
                  doc.id
                }" data-filename="${doc.filename}">
            </td>
            <td>
                <img src="${API_BASE}/files/${doc.filename || doc.file_name}" 
                     class="document-thumbnail" 
                     alt="Thumbnail"
                     onclick="showImagePreview('${
                       doc.filename || doc.file_name
                     }', '${
        doc.original_name || doc.originalName || doc.filename || doc.file_name
      }')">
            </td>
            <td>
                <strong>${
                  doc.original_name ||
                  doc.originalName ||
                  doc.filename ||
                  doc.file_name
                }</strong>
                ${
                  doc.comment
                    ? `<br><small class="text-muted">${doc.comment}</small>`
                    : ""
                }
            </td>
            <td>
                <span class="badge bg-primary">${getDocumentTypeLabel(
                  doc.document_type || doc.documentType || "undefined"
                )}</span>
            </td>
            <td>${doc.username}</td>
            <td>
                <small>${formatDate(doc.upload_date || doc.uploadDate)}</small>
            </td>
            <td>
                <small>${formatFileSize(
                  doc.compressed_size || doc.compressedSize || 0
                )}</small>
                ${
                  doc.original_size || doc.originalSize
                    ? `<br><small class="text-muted">Orig: ${formatFileSize(
                        doc.original_size || doc.originalSize
                      )}</small>`
                    : ""
                }
            </td>
            <td>
                ${
                  doc.compressionRatio
                    ? `<span class="badge bg-success">${doc.compressionRatio}%</span>`
                    : "-"
                }
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="downloadDocument('${
                  doc.filename
                }', '${doc.originalName || doc.filename}')">
                    📥
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteDocument('${
                  doc.id
                }', '${doc.filename}')">
                    🗑️
                </button>
            </td>
        </tr>
    `
    )
    .join("");
}

function showImagePreview(filename, originalName) {
  const modal = new bootstrap.Modal(document.getElementById("imageModal"));
  document.getElementById("imageModalTitle").textContent =
    originalName || filename;
  document.getElementById("modalImage").src = `${API_BASE}/files/${filename}`;
  document.getElementById("downloadBtn").onclick = () =>
    downloadDocument(filename, originalName);
  modal.show();
}

function downloadDocument(filename, originalName) {
  // Force download instead of opening in browser
  fetch(`${API_BASE}/files/${filename}`)
    .then((response) => response.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = originalName || filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    })
    .catch((error) => {
      console.error("Download error:", error);
      alert("Greška pri preuzimanju fajla");
    });
}

async function deleteDocument(id, filename) {
  if (!confirm("Da li ste sigurni da želite da obrišete ovaj dokument?")) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/documents/${id}`, {
      method: "DELETE",
      headers: AdminAuth.getAuthHeaders(),
    });

    if (response.ok) {
      alert("Dokument je uspešno obrisan");
      loadDocuments();
      loadStats();
    } else {
      alert("Greška prilikom brisanja dokumenta");
    }
  } catch (error) {
    console.error("Error deleting document:", error);
    alert("Greška mreže prilikom brisanja dokumenta");
  }
}

function clearFilters() {
  document.getElementById("filterType").value = "";
  document.getElementById("filterUser").value = "";
  document.getElementById("filterDate").value = "";
  loadDocuments();
}

function getDocumentTypeLabel(type) {
  const labels = {
    racun: "Račun",
    ugovor: "Ugovor",
    izvod: "Izvod",
    potvrda: "Potvrda",
    ostalo: "Ostalo",
  };
  return labels[type] || type;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0 || isNaN(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Bulk download functionality
document.addEventListener("DOMContentLoaded", function () {
  // Select all checkbox functionality
  document.getElementById("selectAll").addEventListener("change", function () {
    const checkboxes = document.querySelectorAll(".document-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.checked = this.checked;
    });
    updateDownloadButtons();
  });

  // Individual checkbox change
  document.addEventListener("change", function (e) {
    if (e.target.classList.contains("document-checkbox")) {
      updateDownloadButtons();

      // Update select all checkbox
      const checkboxes = document.querySelectorAll(".document-checkbox");
      const checkedBoxes = document.querySelectorAll(
        ".document-checkbox:checked"
      );
      const selectAll = document.getElementById("selectAll");

      if (checkedBoxes.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      } else if (checkedBoxes.length === checkboxes.length) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
      } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
      }
    }
  });

  // Download selected button
  document
    .getElementById("downloadSelectedBtn")
    .addEventListener("click", downloadSelected);

  // Download all button
  document
    .getElementById("downloadAllBtn")
    .addEventListener("click", downloadAll);
});

function updateDownloadButtons() {
  const checkedBoxes = document.querySelectorAll(".document-checkbox:checked");
  const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");

  downloadSelectedBtn.disabled = checkedBoxes.length === 0;
  downloadSelectedBtn.textContent = `📥 Download Selected (${checkedBoxes.length})`;
}

async function downloadSelected() {
  const checkedBoxes = document.querySelectorAll(".document-checkbox:checked");
  if (checkedBoxes.length === 0) return;

  for (let checkbox of checkedBoxes) {
    const filename = checkbox.dataset.filename;
    const row = checkbox.closest("tr");
    const originalName = row.querySelector(
      "td:nth-child(3) strong"
    ).textContent;

    await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay between downloads
    downloadDocument(filename, originalName);
  }
}

async function downloadAll() {
  try {
    const response = await fetch(`${API_BASE}/admin/documents`, {
      headers: AdminAuth.getAuthHeaders(),
    });

    if (response.ok) {
      const documents = await response.json();

      if (documents.length === 0) {
        alert("Nema dokumenata za preuzimanje");
        return;
      }

      if (
        !confirm(
          `Da li želite da preuzmete sve dokumente (${documents.length})?`
        )
      ) {
        return;
      }

      for (let doc of documents) {
        await new Promise((resolve) => setTimeout(resolve, 200)); // Small delay between downloads
        downloadDocument(doc.filename, doc.originalName || doc.filename);
      }
    }
  } catch (error) {
    console.error("Error downloading all documents:", error);
    alert("Greška pri preuzimanju dokumenata");
  }
}

function formatDate(dateString) {
  if (!dateString) return "N/A";

  try {
    const date = new Date(dateString);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }

    return (
      date.toLocaleDateString("sr-RS") +
      " " +
      date.toLocaleTimeString("sr-RS", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return "Invalid Date";
  }
}

function showError(message) {
  alert(message); // Simple error handling, can be improved with toast notifications
}
