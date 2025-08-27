// Dashboard functionality
document.addEventListener("DOMContentLoaded", function () {
  // Check if user is logged in
  if (!Auth.isLoggedIn()) {
    window.location.href = "index.html";
    return;
  }

  // Display user welcome message
  const user = Auth.getUser();
  const welcomeText = user.fullName
    ? `Pozdrav, ${user.fullName}!`
    : `Pozdrav, ${user.username}!`;
  document.getElementById("userWelcome").textContent = welcomeText;

  if (user.companyName) {
    document.getElementById(
      "userWelcome"
    ).textContent += ` (${user.companyName})`;
  }

  // Load initial data
  loadNotifications();
  loadDocuments();

  // Setup file input handler
  document
    .getElementById("fileInput")
    .addEventListener("change", handleFileSelect);

  // Setup auto-refresh for notifications
  setInterval(loadNotifications, 30000); // Check every 30 seconds
});

function startUpload(tipDokumenta) {
  // Store document type and redirect to camera page
  localStorage.setItem("selectedDocumentType", tipDokumenta);
  window.location.href = "camera.html";
}

let currentDocumentType = "";

function uploadFromFile(tipDokumenta) {
  currentDocumentType = tipDokumenta;
  document.getElementById("fileInput").click();
}

function handleFileSelect(event) {
  const files = event.target.files;
  if (files.length === 0) return;

  // Process each selected file
  for (let file of files) {
    uploadFile(file, currentDocumentType);
  }

  // Reset file input
  event.target.value = "";
}

async function uploadFile(file, documentType) {
  try {
    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      alert(
        `Neispravna ekstenzija fajla: ${file.name}. Dozvoljeni tipovi: JPG, PNG, GIF, PDF`
      );
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert(`Fajl ${file.name} je prevelik. Maksimalna veličina je 50MB.`);
      return;
    }

    // Create FormData
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);
    formData.append("documentSubtype", "ostalo"); // Default subtype
    formData.append("userComment", "");

    // Show upload progress
    const uploadStatus = document.createElement("div");
    uploadStatus.className = "alert alert-info mt-3";
    uploadStatus.innerHTML = `📤 Uploading: ${file.name}...`;
    document.querySelector(".container").appendChild(uploadStatus);

    // Upload file
    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: Auth.getAuthHeaders(false), // Don't include Content-Type for FormData
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      uploadStatus.className = "alert alert-success mt-3";
      uploadStatus.innerHTML = `✅ Uspešno uploadovan: ${file.name}`;

      // Refresh documents and notifications
      loadDocuments();
      loadNotifications();

      // Remove status after 3 seconds
      setTimeout(() => {
        uploadStatus.remove();
      }, 3000);

      console.log("Upload successful:", result);
    } else {
      throw new Error("Upload failed");
    }
  } catch (error) {
    console.error("Upload error:", error);

    const errorStatus = document.createElement("div");
    errorStatus.className = "alert alert-danger mt-3";
    errorStatus.innerHTML = `❌ Greška pri uploadu: ${file.name}`;
    document.querySelector(".container").appendChild(errorStatus);

    setTimeout(() => {
      errorStatus.remove();
    }, 5000);
  }
}

// Load user notifications
async function loadNotifications() {
  try {
    const response = await fetch(`${API_BASE}/notifications`, {
      headers: Auth.getAuthHeaders(),
    });

    if (response.ok) {
      const notifications = await response.json();
      displayNotifications(notifications);
    }
  } catch (error) {
    console.error("Error loading notifications:", error);
  }
}

// Display notifications
function displayNotifications(notifications) {
  const container = document.getElementById("notificationsContainer");
  if (!container) return;

  const unread = notifications.filter((n) => !n.is_read);

  if (unread.length === 0) {
    container.innerHTML =
      '<div class="alert alert-info">Nemate novih notifikacija</div>';
    return;
  }

  let html = `<h5>Nove notifikacije (${unread.length})</h5>`;

  unread.slice(0, 5).forEach((notification) => {
    const typeIcon = getNotificationIcon(notification.type);
    html += `
      <div class="alert alert-${getNotificationClass(
        notification.type
      )} alert-dismissible">
        <strong>${typeIcon} ${notification.title}</strong><br>
        <small>${notification.message}</small>
        <small class="d-block text-muted mt-1">${formatDate(
          notification.created_at
        )}</small>
        <button type="button" class="btn-close" onclick="markAsRead(${
          notification.id
        })"></button>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Get notification icon
function getNotificationIcon(type) {
  switch (type) {
    case "document_approved":
      return "✅";
    case "document_rejected":
      return "❌";
    case "reshoot_requested":
      return "📷";
    case "document_synced":
      return "☁️";
    default:
      return "ℹ️";
  }
}

// Get Bootstrap alert class for notification type
function getNotificationClass(type) {
  switch (type) {
    case "document_approved":
      return "success";
    case "document_rejected":
      return "danger";
    case "reshoot_requested":
      return "warning";
    case "document_synced":
      return "info";
    default:
      return "secondary";
  }
}

// Mark notification as read
async function markAsRead(notificationId) {
  try {
    const response = await fetch(
      `${API_BASE}/notifications/${notificationId}/read`,
      {
        method: "PUT",
        headers: Auth.getAuthHeaders(),
      }
    );

    if (response.ok) {
      loadNotifications(); // Refresh notifications
    }
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

// Load user documents
async function loadDocuments() {
  try {
    const response = await fetch(`${API_BASE}/documents`, {
      headers: Auth.getAuthHeaders(),
    });

    if (response.ok) {
      const documents = await response.json();
      displayDocuments(documents);
    }
  } catch (error) {
    console.error("Error loading documents:", error);
  }
}

// Display documents
function displayDocuments(documents) {
  const container = document.getElementById("documentsContainer");
  if (!container) return;

  if (documents.length === 0) {
    container.innerHTML =
      '<div class="alert alert-info">Još uvek nemate upload-ovanih dokumenata</div>';
    return;
  }

  let html = '<h5>Vaši dokumenti</h5><div class="table-responsive">';
  html += `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Dokument</th>
          <th>Tip</th>
          <th>Status</th>
          <th>Upload</th>
          <th>Akcije</th>
        </tr>
      </thead>
      <tbody>
  `;

  documents.forEach((doc) => {
    const statusBadge = getStatusBadge(doc.status);
    const actionButtons = getDocumentActions(doc);

    html += `
      <tr>
        <td>
          <strong>${doc.original_name}</strong><br>
          <small class="text-muted">${formatFileSize(doc.original_size)}</small>
        </td>
        <td>
          <span class="badge bg-secondary">${doc.document_type}</span><br>
          <small>${doc.document_subtype}</small>
        </td>
        <td>${statusBadge}</td>
        <td><small>${formatDate(doc.upload_date)}</small></td>
        <td>${actionButtons}</td>
      </tr>
    `;
  });

  html += "</tbody></table></div>";
  container.innerHTML = html;
}

// Get status badge for document
function getStatusBadge(status) {
  switch (status) {
    case "uploaded":
      return '<span class="badge bg-primary">Upload-ovan</span>';
    case "reviewed":
      return '<span class="badge bg-info">Pregledano</span>';
    case "approved":
      return '<span class="badge bg-success">Odobren</span>';
    case "rejected":
      return '<span class="badge bg-danger">Odbačen</span>';
    case "reshoot_requested":
      return '<span class="badge bg-warning">Ponoviti</span>';
    default:
      return '<span class="badge bg-secondary">' + status + "</span>";
  }
}

// Get action buttons for document
function getDocumentActions(doc) {
  let buttons = `<a href="${API_BASE}/files/${doc.filename}" target="_blank" class="btn btn-sm btn-outline-primary">Pregled</a>`;

  if (doc.status === "reshoot_requested") {
    buttons += ` <button class="btn btn-sm btn-warning" onclick="reshootDocument('${doc.document_type}')">Ponovo slika</button>`;
  }

  return buttons;
}

// Handle reshoot request
function reshootDocument(documentType) {
  startUpload(documentType);
}

// Utility functions
function formatDate(dateString) {
  return new Date(dateString).toLocaleString("sr-RS");
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
