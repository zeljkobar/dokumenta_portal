// Camera functionality
let videoStream = null;
let capturedImages = [];
let documentType = "";

document.addEventListener("DOMContentLoaded", function () {
  // Check if user is logged in
  if (!Auth.isLoggedIn()) {
    window.location.href = "index.html";
    return;
  }

  // Get document type from localStorage
  documentType = localStorage.getItem("selectedDocumentType") || "ostalo";

  // Set title based on document type
  const titles = {
    racun: "Slikanje računa",
    ugovor: "Slikanje ugovora",
    izvod: "Slikanje bankovnog izvoda",
    potvrda: "Slikanje potvrde",
    ostalo: "Slikanje dokumenta",
  };

  document.getElementById("documentTypeTitle").textContent =
    titles[documentType];

  // Initialize camera
  initCamera();

  // Set up capture button
  document
    .getElementById("capture-btn")
    .addEventListener("click", captureImage);
});

async function initCamera() {
  try {
    const constraints = {
      video: {
        facingMode: "environment", // Back camera on mobile
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById("camera-view");
    video.srcObject = videoStream;
  } catch (error) {
    console.error("Error accessing camera:", error);
    showError(
      "Greška pristupa kameri. Molimo dozvolite pristup kameri i pokušajte ponovo."
    );
  }
}

function captureImage() {
  const video = document.getElementById("camera-view");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // Set canvas dimensions to video dimensions
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw video frame to canvas
  context.drawImage(video, 0, 0);

  // Convert to blob
  canvas.toBlob(
    function (blob) {
      const imageUrl = URL.createObjectURL(blob);
      capturedImages.push({
        blob: blob,
        url: imageUrl,
        timestamp: Date.now(),
      });

      // Show preview section
      showPreview();
    },
    "image/jpeg",
    0.8
  ); // 80% quality
}

function showPreview() {
  // Hide camera section
  document.getElementById("cameraSection").classList.add("d-none");

  // Show preview section
  document.getElementById("previewSection").classList.remove("d-none");

  // Stop video stream
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
  }

  // Update preview container
  updatePreviewContainer();
}

function updatePreviewContainer() {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";

  capturedImages.forEach((image, index) => {
    const div = document.createElement("div");
    div.className = "position-relative";
    div.innerHTML = `
            <img src="${image.url}" class="document-preview" alt="Strana ${
      index + 1
    }">
            <button class="btn btn-danger btn-sm position-absolute top-0 end-0 m-1" onclick="removeImage(${index})">
                ×
            </button>
            <div class="text-center mt-1">
                <small class="text-muted">Strana ${index + 1}</small>
            </div>
        `;
    container.appendChild(div);
  });
}

function removeImage(index) {
  // Release object URL
  URL.revokeObjectURL(capturedImages[index].url);

  // Remove from array
  capturedImages.splice(index, 1);

  // Update preview
  if (capturedImages.length === 0) {
    // Go back to camera if no images
    addPage();
  } else {
    updatePreviewContainer();
  }
}

function addPage() {
  // Show camera section again
  document.getElementById("cameraSection").classList.remove("d-none");
  document.getElementById("previewSection").classList.add("d-none");

  // Restart camera
  initCamera();
}

async function uploadDocument() {
  if (capturedImages.length === 0) {
    showError("Morate slikati najmanje jednu stranu dokumenta.");
    return;
  }

  // Show upload modal
  const uploadModal = new bootstrap.Modal(
    document.getElementById("uploadModal")
  );
  uploadModal.show();

  try {
    const comment = document.getElementById("comment").value;

    // For now, upload each image separately
    // In production, you might want to combine them into a single document
    for (let i = 0; i < capturedImages.length; i++) {
      const formData = new FormData();
      formData.append(
        "file",
        capturedImages[i].blob,
        `${documentType}_strana_${i + 1}.jpg`
      );
      formData.append("documentType", documentType);
      formData.append("comment", comment);
      formData.append("pageNumber", i + 1);
      formData.append("totalPages", capturedImages.length);

      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: Auth.getAuthHeaders(false), // Don't include Content-Type for FormData
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }
    }

    // Success - redirect to dashboard
    uploadModal.hide();
    alert("Dokument je uspešno uploadovan!");
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Upload error:", error);
    uploadModal.hide();
    showError("Greška prilikom uploada. Pokušajte ponovo.");
  }
}

function showError(message) {
  const errorAlert = document.getElementById("errorAlert");
  errorAlert.textContent = message;
  errorAlert.classList.remove("d-none");

  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorAlert.classList.add("d-none");
  }, 5000);
}

// Cleanup on page unload
window.addEventListener("beforeunload", function () {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
  }

  // Release object URLs
  capturedImages.forEach((image) => {
    URL.revokeObjectURL(image.url);
  });
});
