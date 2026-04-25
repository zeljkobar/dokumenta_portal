// Admin dashboard functionality
let adminUsersCache = [];
let oneDriveConnected = false;

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
  loadOneDriveStatus();
  loadDocuments();

  // Setup tab change handlers
  document.getElementById("users-tab").addEventListener("click", function () {
    loadUsers();
  });

  // Apply document filters as soon as they change.
  ["filterType", "filterUser", "filterDateFrom", "filterDateTo"].forEach((filterId) => {
    document.getElementById(filterId).addEventListener("change", loadDocuments);
  });

  // Setup form handlers
  setupUserManagement();
  setupOneDriveControls();
});

function setupOneDriveControls() {
  const connectBtn = document.getElementById("connectOneDriveBtn");
  if (!connectBtn) return;

  connectBtn.addEventListener("click", connectOneDrive);

  const params = new URLSearchParams(window.location.search);
  if (params.get("onedrive") === "connected") {
    alert("OneDrive je povezan.");
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get("onedrive") === "error") {
    alert(`OneDrive povezivanje nije uspjelo: ${params.get("message") || ""}`);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function loadOneDriveStatus() {
  try {
    const response = await fetch(`${API_BASE}/admin/onedrive/status`, {
      headers: AdminAuth.getAuthHeaders(),
    });
    const status = await response.json();

    oneDriveConnected = Boolean(status.connected);
    renderOneDriveStatus(status);
    loadDocuments();
  } catch (error) {
    console.error("Error loading OneDrive status:", error);
    renderOneDriveStatus({ configured: false, connected: false });
  }
}

function renderOneDriveStatus(status) {
  const badge = document.getElementById("oneDriveStatusBadge");
  const button = document.getElementById("connectOneDriveBtn");
  if (!badge || !button) return;

  if (!status.configured) {
    badge.textContent = "OneDrive nije konfigurisan";
    badge.className = "badge bg-warning text-dark align-self-center";
    button.disabled = true;
    return;
  }

  if (status.connected) {
    badge.textContent = "OneDrive povezan";
    badge.className = "badge bg-success align-self-center";
    button.textContent = "🔄 Reconnect OneDrive";
  } else {
    badge.textContent = "OneDrive nije povezan";
    badge.className = "badge bg-secondary align-self-center";
    button.textContent = "🔗 Connect OneDrive";
  }

  button.disabled = false;
}

async function connectOneDrive() {
  try {
    const response = await fetch(`${API_BASE}/admin/onedrive/connect`, {
      headers: AdminAuth.getAuthHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "OneDrive povezivanje nije pokrenuto");
    }

    window.location.href = data.authUrl;
  } catch (error) {
    console.error("OneDrive connect error:", error);
    alert(error.message || "Greška pri povezivanju OneDrive-a");
  }
}

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
  const user = adminUsersCache.find((item) => Number(item.id) === Number(userId));
  if (!user) return;

  // Populate edit form
  document.getElementById("editUserId").value = userId;
  document.getElementById("editUserUsername").value = user.username || "";
  document.getElementById("editUserEmail").value = user.email || "";
  document.getElementById("editUserPassword").value = "";
  document.getElementById("editUserFullName").value = user.full_name || "";
  document.getElementById("editUserCompanyName").value = user.company_name || "";
  document.getElementById("editUserPhone").value = user.phone || "";
  document.getElementById("editUserPib").value = user.pib || "";
  document.getElementById("editUserStatus").value = user.status || "active";
  document.getElementById("editUserNotes").value = user.notes || "";

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
      adminUsersCache = users;

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
      dateFrom: document.getElementById("filterDateFrom").value,
      dateTo: document.getElementById("filterDateTo").value,
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
                }" data-filename="${doc.filename}" data-fiscalization-url="${escapeHtml(
                  doc.fiscalization_url || ""
                )}">
            </td>
            <td>${getDocumentPreview(doc)}</td>
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
                ${getFiscalizationLink(doc.fiscalization_url)}
            </td>
            <td>
                <span class="badge bg-primary">${getDocumentTypeLabel(
                  doc.document_type || doc.documentType || "undefined"
                )}</span><br>
                <small>${getDocumentSubtypeLabel(doc.document_subtype)}</small>
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
                ${getOneDriveSyncBadge(doc)}
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="downloadDocument('${
                  doc.filename
                }', '${doc.originalName || doc.filename}')">
                    📥
                </button>
                <button class="btn btn-sm btn-outline-success" onclick="syncDocumentToOneDrive(${
                  doc.id
                })" ${oneDriveConnected ? "" : "disabled"}>
                    ☁️
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

function getOneDriveSyncBadge(doc) {
  const status = doc.sync_status || "pending";
  const labels = {
    pending: '<span class="badge bg-secondary mt-1 d-block">OneDrive: ceka</span>',
    synced: '<span class="badge bg-success mt-1 d-block">OneDrive: synced</span>',
    failed: '<span class="badge bg-danger mt-1 d-block">OneDrive: greska</span>',
    skipped: '<span class="badge bg-warning text-dark mt-1 d-block">OneDrive: skipped</span>',
  };
  return labels[status] || labels.pending;
}

function getFiscalizationLink(url) {
  if (!url) return "";

  const safeUrl = escapeHtml(url);
  return `
    <div class="fiscal-link-actions mt-2">
      <a href="${safeUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary">
        Otvori QR link
      </a>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        data-copy-value="${safeUrl}"
        onclick="copyFiscalizationLink(this)"
      >
        Copy link
      </button>
    </div>
  `;
}

async function copyFiscalizationLink(button) {
  const link = button.dataset.copyValue;
  if (!link) return;

  try {
    await copyText(link);
    const originalText = button.textContent;
    button.textContent = "Kopirano";
    button.classList.remove("btn-outline-secondary");
    button.classList.add("btn-success");

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("btn-success");
      button.classList.add("btn-outline-secondary");
    }, 1600);
  } catch (error) {
    console.error("Copy fiscalization link error:", error);
    alert("Link nije kopiran. Kopirajte ga ručno iz otvorenog linka.");
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Fallback copy failed");
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getDocumentPreview(doc) {
  const filename = doc.filename || doc.file_name;
  const originalName = doc.original_name || doc.originalName || filename;

  if (filename && filename.toLowerCase().endsWith(".pdf")) {
    return `
      <button class="btn btn-sm btn-outline-danger" onclick="previewDocument('${filename}')">
        📄 PDF
      </button>
    `;
  }

  return `
    <img src="${API_BASE}/files/${filename}"
         class="document-thumbnail"
         alt="Thumbnail"
         onclick="showImagePreview('${filename}', '${originalName}')">
  `;
}

function previewDocument(filename) {
  window.open(`${API_BASE}/files/${filename}`, "_blank", "noopener");
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

async function syncDocumentToOneDrive(documentId) {
  if (!oneDriveConnected) {
    alert("Prvo povežite OneDrive.");
    return;
  }

  if (!confirm("Sinhronizovati ovaj dokument na OneDrive?")) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/admin/documents/${documentId}/sync-onedrive`,
      {
        method: "POST",
        headers: AdminAuth.getAuthHeaders(),
      }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "OneDrive sync nije uspio");
    }

    alert("Dokument je poslat na OneDrive.");
    await loadDocuments();
    await loadStats();
  } catch (error) {
    console.error("OneDrive sync error:", error);
    alert(error.message || "Greška pri OneDrive sync-u");
    await loadDocuments();
  }
}

function clearFilters() {
  document.getElementById("filterType").value = "";
  document.getElementById("filterUser").value = "";
  document.getElementById("filterDateFrom").value = "";
  document.getElementById("filterDateTo").value = "";
  loadDocuments();
}

function getDocumentTypeLabel(type) {
  const labels = {
    ulazni: "Ulazni dokumenti",
    izlazni: "Izlazni dokumenti",
    izvod: "Izvod",
  };
  return labels[type] || type;
}

function getDocumentSubtypeLabel(subtype) {
  const labels = {
    virman: "Virman",
    gotovina: "Gotovina",
    kartica: "Kartica",
    ostalo: "Ostalo",
  };
  return labels[subtype] || subtype || "-";
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

  document
    .getElementById("downloadSelectedLinksBtn")
    .addEventListener("click", downloadSelectedLinks);

  // Delete selected button
  document
    .getElementById("deleteSelectedBtn")
    .addEventListener("click", deleteSelected);

  // Download all button
  document
    .getElementById("downloadAllBtn")
    .addEventListener("click", downloadAll);
});

function updateDownloadButtons() {
  const checkedBoxes = document.querySelectorAll(".document-checkbox:checked");
  const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");
  const downloadSelectedLinksBtn = document.getElementById(
    "downloadSelectedLinksBtn"
  );
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  const selectedLinksCount = getSelectedFiscalizationLinks().length;

  downloadSelectedBtn.disabled = checkedBoxes.length === 0;
  downloadSelectedLinksBtn.disabled = selectedLinksCount === 0;
  deleteSelectedBtn.disabled = checkedBoxes.length === 0;
  downloadSelectedBtn.textContent = `📥 Download Selected (${checkedBoxes.length})`;
  downloadSelectedLinksBtn.textContent = `🔗 Download linkove (${selectedLinksCount})`;
  deleteSelectedBtn.textContent = `🗑️ Delete Selected (${checkedBoxes.length})`;
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

function downloadSelectedLinks() {
  const links = getSelectedFiscalizationLinks();

  if (links.length === 0) {
    alert("Izabrani dokumenti nemaju fiskalizacione linkove.");
    return;
  }

  const rows = links
    .map((link) => `<tr><td>${escapeHtml(link)}</td></tr>`)
    .join("");
  const excelContent = `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table>
          ${rows}
        </table>
      </body>
    </html>
  `;
  const blob = new Blob([excelContent], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `fiskalizacioni_linkovi_${formatDateForFilename(
    new Date()
  )}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function getSelectedFiscalizationLinks() {
  return Array.from(document.querySelectorAll(".document-checkbox:checked"))
    .map((checkbox) => checkbox.dataset.fiscalizationUrl || "")
    .map((link) => link.trim())
    .filter(Boolean);
}

function formatDateForFilename(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

async function deleteSelected() {
  const checkedBoxes = Array.from(
    document.querySelectorAll(".document-checkbox:checked")
  );

  if (checkedBoxes.length === 0) return;

  if (
    !confirm(
      `Da li ste sigurni da želite da obrišete ${checkedBoxes.length} izabranih dokumenata?`
    )
  ) {
    return;
  }

  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  deleteSelectedBtn.disabled = true;
  deleteSelectedBtn.textContent = "🗑️ Brisanje...";

  let deletedCount = 0;
  let failedCount = 0;

  for (const checkbox of checkedBoxes) {
    try {
      const response = await fetch(
        `${API_BASE}/admin/documents/${checkbox.value}`,
        {
          method: "DELETE",
          headers: AdminAuth.getAuthHeaders(),
        }
      );

      if (response.ok) {
        deletedCount++;
      } else {
        failedCount++;
      }
    } catch (error) {
      console.error("Error deleting selected document:", error);
      failedCount++;
    }
  }

  await loadDocuments();
  await loadStats();
  updateDownloadButtons();

  if (failedCount > 0) {
    alert(
      `Obrisano: ${deletedCount}. Nije obrisano: ${failedCount}. Provjerite listu dokumenata.`
    );
  } else {
    alert(`Obrisano ${deletedCount} dokumenata.`);
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
