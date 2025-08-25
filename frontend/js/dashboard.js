// Dashboard functionality
document.addEventListener("DOMContentLoaded", function () {
  // Check if user is logged in
  if (!Auth.isLoggedIn()) {
    window.location.href = "index.html";
    return;
  }

  // Display user welcome message
  const user = Auth.getUser();
  document.getElementById(
    "userWelcome"
  ).textContent = `Pozdrav, ${user.username}!`;

  // Setup file input handler
  document
    .getElementById("fileInput")
    .addEventListener("change", handleFileSelect);
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

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert(`Fajl ${file.name} je prevelik. Maksimalna veličina je 10MB.`);
      return;
    }

    // Create FormData
    const formData = new FormData();
    formData.append("document", file);
    formData.append("documentType", documentType);
    formData.append("comment", "");
    formData.append("pageNumber", "1");
    formData.append("totalPages", "1");

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
