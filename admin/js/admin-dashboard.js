// Admin dashboard functionality
let adminUsersCache = [];
let helperDocumentsCache = [];
let adminAccountsCache = [];
let isSuperAdmin = false;

document.addEventListener("DOMContentLoaded", function () {
  // Check if admin is logged in
  if (!AdminAuth.isLoggedIn()) {
    window.location.href = "index.html";
    return;
  }

  // Display admin welcome message
  const admin = AdminAuth.getAdmin();
  isSuperAdmin = Boolean(admin && admin.isSuperAdmin);
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
    if (isSuperAdmin) {
      loadAdmins();
    }
  });
  const helperTab = document.getElementById("helper-tab");
  if (helperTab) {
    helperTab.addEventListener("click", loadHelperDocuments);
  }

  // Apply document filters as soon as they change.
  ["filterType", "filterUser", "filterDateFrom", "filterDateTo"].forEach((filterId) => {
    document.getElementById(filterId).addEventListener("change", loadDocuments);
  });

  // Setup form handlers
  setupUserManagement();
  setupHelperSyncControls();

  if (isSuperAdmin) {
    const superAdminSection = document.getElementById("superAdminSection");
    if (superAdminSection) {
      superAdminSection.classList.remove("d-none");
    }
    loadAdmins();
  }
});

function setupHelperSyncControls() {
  const refreshBtn = document.getElementById("refreshHelperBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadHelperDocuments);
  }

  ["helperFilterStatus", "helperFilterType", "helperFilterCompany"].forEach(
    (filterId) => {
      const element = document.getElementById(filterId);
      if (!element) return;

      element.addEventListener("input", renderHelperDocumentsFromFilters);
      element.addEventListener("change", renderHelperDocumentsFromFilters);
    }
  );

  const clearBtn = document.getElementById("helperClearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      clearHelperFilters();
      renderHelperDocumentsFromFilters();
    });
  }

  const helperTable = document.getElementById("helperDocumentsTable");
  if (!helperTable) return;

  helperTable.addEventListener("click", async function (event) {
    const downloadBtn = event.target.closest(".helper-download-btn");
    if (downloadBtn) {
      const documentId = downloadBtn.dataset.id;
      const originalName = downloadBtn.dataset.name || "document.pdf";
      await downloadHelperDocument(documentId, originalName);
      return;
    }

    const markBtn = event.target.closest(".helper-mark-synced-btn");
    if (markBtn) {
      const documentId = markBtn.dataset.id;
      await markHelperDocumentSynced(documentId);
    }
  });
}

function clearHelperFilters() {
  const status = document.getElementById("helperFilterStatus");
  const type = document.getElementById("helperFilterType");
  const company = document.getElementById("helperFilterCompany");

  if (status) status.value = "";
  if (type) type.value = "";
  if (company) company.value = "";
}

async function loadHelperDocuments() {
  const table = document.getElementById("helperDocumentsTable");
  if (!table) return;

  table.innerHTML = `
    <tr>
      <td colspan="8" class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Učitava...</span>
        </div>
      </td>
    </tr>
  `;

  try {
    const response = await fetch(`${API_BASE}/admin/helper/documents?limit=500`, {
      headers: AdminAuth.getAuthHeaders(),
    });
    const data = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(data.error || "Greška pri učitavanju helper dokumenata");
    }

    helperDocumentsCache = Array.isArray(data) ? data : [];
    updateHelperStats(helperDocumentsCache);
    renderHelperDocumentsFromFilters();
  } catch (error) {
    console.error("Helper documents error:", error);
    table.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-danger">
          ${escapeHtml(error.message || "Greška pri učitavanju helper dokumenata")}
        </td>
      </tr>
    `;
    updateHelperStats([]);
  }
}

function updateHelperStats(documents) {
  const counts = documents.reduce(
    (acc, doc) => {
      const status = String(doc.syncStatus || "pending").toLowerCase();
      acc.total += 1;
      if (status === "pending") acc.pending += 1;
      if (status === "synced") acc.synced += 1;
      if (status === "failed") acc.failed += 1;
      return acc;
    },
    { total: 0, pending: 0, synced: 0, failed: 0 }
  );

  const total = document.getElementById("helperTotalCount");
  const pending = document.getElementById("helperPendingCount");
  const synced = document.getElementById("helperSyncedCount");
  const failed = document.getElementById("helperFailedCount");

  if (total) total.textContent = counts.total;
  if (pending) pending.textContent = counts.pending;
  if (synced) synced.textContent = counts.synced;
  if (failed) failed.textContent = counts.failed;
}

function renderHelperDocumentsFromFilters() {
  const table = document.getElementById("helperDocumentsTable");
  if (!table) return;

  const statusFilter = (
    document.getElementById("helperFilterStatus")?.value || ""
  ).toLowerCase();
  const typeFilter = (
    document.getElementById("helperFilterType")?.value || ""
  ).toLowerCase();
  const companyFilter = (
    document.getElementById("helperFilterCompany")?.value || ""
  )
    .trim()
    .toLowerCase();

  const filtered = helperDocumentsCache.filter((doc) => {
    const status = String(doc.syncStatus || "pending").toLowerCase();
    const type = String(doc.documentType || "").toLowerCase();
    const company = String(doc.companyName || "").toLowerCase();

    if (statusFilter && status !== statusFilter) return false;
    if (typeFilter && type !== typeFilter) return false;
    if (companyFilter && !company.includes(companyFilter)) return false;

    return true;
  });

  if (filtered.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted">
          Nema dokumenata za zadate filtere.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = filtered
    .map((doc) => {
      const fileName = escapeHtml(doc.originalName || doc.filename || "-");
      const companyName = escapeHtml(doc.companyName || "-");
      const type = escapeHtml(getDocumentTypeLabel(doc.documentType || "-"));
      const subtype = escapeHtml(getDocumentSubtypeLabel(doc.documentSubtype));
      const path = escapeHtml(doc.relativePath || "-");
      const yearMonth = `${doc.year || "-"}/${String(doc.month || "-")}`;
      const canMarkSynced = String(doc.syncStatus || "pending") !== "synced";

      return `
        <tr>
          <td>${doc.id}</td>
          <td>
            <strong>${fileName}</strong>
            <br />
            <small class="text-muted">${formatDate(doc.uploadDate)}</small>
          </td>
          <td>${companyName}</td>
          <td>
            <span class="badge bg-primary">${type}</span>
            <br />
            <small>${subtype}</small>
          </td>
          <td>${yearMonth}</td>
          <td><small>${path}</small></td>
          <td>${getHelperStatusBadge(doc.syncStatus)}</td>
          <td>
            <div class="d-flex flex-wrap gap-1">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary helper-download-btn"
                data-id="${doc.id}"
                data-name="${fileName}"
              >
                📥 Download
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-success helper-mark-synced-btn"
                data-id="${doc.id}"
                ${canMarkSynced ? "" : "disabled"}
              >
                ✅ Mark synced
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function getHelperStatusBadge(statusValue) {
  const status = String(statusValue || "pending").toLowerCase();
  const labels = {
    pending: '<span class="badge bg-secondary helper-badge">Pending</span>',
    synced: '<span class="badge bg-success helper-badge">Synced</span>',
    failed: '<span class="badge bg-danger helper-badge">Failed</span>',
    skipped:
      '<span class="badge bg-warning text-dark helper-badge">Skipped</span>',
  };
  return labels[status] || labels.pending;
}

async function downloadHelperDocument(documentId, originalName) {
  try {
    const response = await fetch(`${API_BASE}/admin/documents/${documentId}/download`, {
      headers: AdminAuth.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Neuspjelo preuzimanje dokumenta");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = originalName || `document_${documentId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Helper download error:", error);
    alert(error.message || "Greška pri preuzimanju dokumenta");
  }
}

async function markHelperDocumentSynced(documentId) {
  if (!confirm("Označiti dokument kao synced?")) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/admin/helper/documents/${documentId}/mark-synced`,
      {
        method: "POST",
        headers: {
          ...AdminAuth.getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ localPath: "manual-admin" }),
      }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Neuspješno označavanje sync statusa");
    }

    await loadHelperDocuments();
    await loadDocuments();
    await loadStats();
  } catch (error) {
    console.error("Helper mark synced error:", error);
    alert(error.message || "Greška pri mark synced akciji");
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

  const addAdminForm = document.getElementById("addAdminForm");
  if (addAdminForm) {
    addAdminForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      await addAdminAccount();
    });
  }
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

async function loadAdmins() {
  if (!isSuperAdmin) return;

  const adminsTable = document.getElementById("adminsTable");
  if (!adminsTable) return;

  try {
    const response = await fetch(`${API_BASE}/admin/admins`, {
      headers: AdminAuth.getAuthHeaders(),
    });
    const data = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(data.error || "Neuspješno učitavanje admin naloga");
    }

    adminAccountsCache = Array.isArray(data) ? data : [];

    if (!adminAccountsCache.length) {
      adminsTable.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted">Nema admin naloga</td>
        </tr>
      `;
      return;
    }

    adminsTable.innerHTML = adminAccountsCache
      .map((admin) => {
        const isCurrentAdmin = Number(admin.id) === Number(AdminAuth.getAdmin()?.id);
        const canDelete = !admin.is_superadmin && !isCurrentAdmin;

        return `
          <tr>
            <td>${admin.id}</td>
            <td>
              ${escapeHtml(admin.username)}
              ${
                admin.is_superadmin
                  ? '<span class="badge bg-warning text-dark ms-1">Superadmin</span>'
                  : ""
              }
            </td>
            <td>${escapeHtml(admin.email || "-")}</td>
            <td>${escapeHtml(admin.company_name || "-")}</td>
            <td>${escapeHtml(admin.subscription_plan || "basic")}</td>
            <td>
              <span class="badge ${admin.is_active ? "bg-success" : "bg-secondary"}">
                ${admin.is_active ? "Aktivan" : "Neaktivan"}
              </span>
            </td>
            <td>
              ${
                admin.last_login
                  ? new Date(admin.last_login).toLocaleDateString("sr-RS")
                  : "Nikad"
              }
            </td>
            <td>
              <button
                class="btn btn-sm btn-outline-danger"
                onclick="deleteAdminAccount(${admin.id}, '${escapeHtml(admin.username)}')"
                ${canDelete ? "" : "disabled"}
              >
                🗑️ Obriši
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading admins:", error);
    adminsTable.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-danger">${escapeHtml(
          error.message || "Greška pri učitavanju admin naloga"
        )}</td>
      </tr>
    `;
  }
}

async function addAdminAccount() {
  if (!isSuperAdmin) return;

  const payload = {
    username: document.getElementById("adminUsername").value.trim(),
    email: document.getElementById("adminEmail").value.trim(),
    password: document.getElementById("adminPassword").value,
    companyName: document.getElementById("adminCompanyName").value.trim(),
    fullName: document.getElementById("adminFullName").value.trim(),
    phone: document.getElementById("adminPhone").value.trim(),
  };

  try {
    const response = await fetch(`${API_BASE}/admin/admins`, {
      method: "POST",
      headers: {
        ...AdminAuth.getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Neuspješno kreiranje admin naloga");
    }

    alert("Admin nalog je uspješno kreiran.");

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("addAdminModal")
    );
    if (modal) modal.hide();
    document.getElementById("addAdminForm").reset();

    await loadAdmins();
  } catch (error) {
    console.error("Error creating admin:", error);
    alert(error.message || "Greška pri kreiranju admin naloga");
  }
}

async function deleteAdminAccount(adminId, username) {
  if (!isSuperAdmin) return;

  if (!confirm(`Obrisati admin nalog "${username}"?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/admins/${adminId}`, {
      method: "DELETE",
      headers: AdminAuth.getAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Neuspješno brisanje admin naloga");
    }

    alert("Admin nalog je obrisan.");
    await loadAdmins();
  } catch (error) {
    console.error("Error deleting admin:", error);
    alert(error.message || "Greška pri brisanju admin naloga");
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
                ${getSyncPathEditor(doc)}
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

function getSyncPathEditor(doc) {
  const docId = doc.id;
  const year = doc.actual_year || doc.suggested_year || new Date().getFullYear();
  const month = String(doc.actual_month || doc.suggested_month || 1).padStart(
    2,
    "0"
  );
  const type = doc.document_type || "ulazni";
  const subtype = doc.document_subtype || "ostalo";

  return `
    <div class="sync-path-editor mt-2" data-doc-id="${docId}">
      <input class="form-control form-control-sm sync-year" type="number" value="${year}" min="2020" max="2100" title="Godina" />
      <select class="form-select form-select-sm sync-month" title="Mjesec">
        ${getMonthOptions(month)}
      </select>
      <select class="form-select form-select-sm sync-type" title="Tip">
        ${getTypeOptions(type)}
      </select>
      <select class="form-select form-select-sm sync-subtype" title="Podtip">
        ${getSubtypeOptions(subtype)}
      </select>
      <button class="btn btn-sm btn-outline-secondary" onclick="saveDocumentSyncPath(${docId})">
        Save path
      </button>
    </div>
  `;
}

function getMonthOptions(selectedMonth) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `<option value="${month}" ${
      month === selectedMonth ? "selected" : ""
    }>${month}</option>`;
  }).join("");
}

function getTypeOptions(selectedType) {
  const options = [
    ["ulazni", "Ulazni"],
    ["izlazni", "Izlazni"],
    ["izvod", "Izvod"],
  ];
  return options
    .map(
      ([value, label]) =>
        `<option value="${value}" ${
          value === selectedType ? "selected" : ""
        }>${label}</option>`
    )
    .join("");
}

function getSubtypeOptions(selectedSubtype) {
  const options = [
    ["virman", "Virman"],
    ["gotovina", "Gotovina"],
    ["kartica", "Kartica"],
    ["ostalo", "Ostalo"],
  ];
  return options
    .map(
      ([value, label]) =>
        `<option value="${value}" ${
          value === selectedSubtype ? "selected" : ""
        }>${label}</option>`
    )
    .join("");
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

async function saveDocumentSyncPath(documentId) {
  const editor = document.querySelector(
    `.sync-path-editor[data-doc-id="${documentId}"]`
  );
  if (!editor) return;

  const payload = {
    year: editor.querySelector(".sync-year").value,
    month: editor.querySelector(".sync-month").value,
    documentType: editor.querySelector(".sync-type").value,
    documentSubtype: editor.querySelector(".sync-subtype").value,
  };

  try {
    const response = await fetch(
      `${API_BASE}/admin/documents/${documentId}/onedrive-path`,
      {
        method: "PUT",
        headers: {
          ...AdminAuth.getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Putanja nije sacuvana");
    }

    alert("Putanja je sacuvana.");
    await loadDocuments();
  } catch (error) {
    console.error("Save sync path error:", error);
    alert(error.message || "Greška pri čuvanju putanje");
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
