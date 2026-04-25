// Camera functionality
let videoStream = null;
let capturedImages = [];
let documentType = "";

const DEFAULT_SCAN_SETTINGS = {
  filter: "clean",
  autoCrop: true,
  rotation: 0,
};

document.addEventListener("DOMContentLoaded", function () {
  if (!Auth.isLoggedIn()) {
    window.location.href = "index.html";
    return;
  }

  documentType = localStorage.getItem("selectedDocumentType") || "ostalo";

  const titles = {
    ulazni: "Slikanje ulaznog dokumenta",
    izlazni: "Slikanje izlaznog dokumenta",
    izvod: "Slikanje bankovnog izvoda",
    racun: "Slikanje racuna",
    ugovor: "Slikanje ugovora",
    potvrda: "Slikanje potvrde",
    ostalo: "Slikanje dokumenta",
  };

  document.getElementById("documentTypeTitle").textContent =
    titles[documentType] || titles.ostalo;

  initCamera();

  document
    .getElementById("capture-btn")
    .addEventListener("click", captureImage);
});

async function initCamera() {
  try {
    const constraints = {
      video: {
        facingMode: "environment",
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
      "Greska pristupa kameri. Molimo dozvolite pristup kameri i pokusajte ponovo."
    );
  }
}

async function captureImage() {
  const video = document.getElementById("camera-view");

  if (!video.videoWidth || !video.videoHeight) {
    showError("Kamera jos nije spremna. Pokusajte ponovo za par sekundi.");
    return;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0);

  try {
    const originalBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const image = await createCapturedImage(originalBlob);
    capturedImages.push(image);
    showPreview();
  } catch (error) {
    console.error("Capture processing error:", error);
    showError("Slika nije obradjena. Pokusajte ponovo.");
  }
}

async function createCapturedImage(originalBlob) {
  const image = {
    originalBlob,
    originalUrl: URL.createObjectURL(originalBlob),
    blob: originalBlob,
    url: "",
    settings: { ...DEFAULT_SCAN_SETTINGS },
    cropDetected: false,
    timestamp: Date.now(),
  };

  await reprocessImage(image);
  return image;
}

async function reprocessImage(image) {
  const result = await processDocumentImage(image.originalBlob, image.settings);

  if (image.url) {
    URL.revokeObjectURL(image.url);
  }

  image.blob = result.blob;
  image.url = URL.createObjectURL(result.blob);
  image.cropDetected = result.cropDetected;
}

async function processDocumentImage(blob, settings) {
  const sourceImage = await loadImageFromBlob(blob);
  const sourceCanvas = document.createElement("canvas");
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  sourceCanvas.width = sourceImage.naturalWidth;
  sourceCanvas.height = sourceImage.naturalHeight;
  sourceContext.drawImage(sourceImage, 0, 0);

  const bounds = settings.autoCrop
    ? detectDocumentBounds(sourceCanvas)
    : null;

  const crop = bounds || {
    x: 0,
    y: 0,
    width: sourceCanvas.width,
    height: sourceCanvas.height,
  };

  const rotated = rotateAndCropCanvas(sourceCanvas, crop, settings.rotation);
  applyScanFilter(rotated, settings.filter);

  return {
    blob: await canvasToBlob(rotated, "image/jpeg", 0.9),
    cropDetected: Boolean(bounds),
  };
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };

    image.src = url;
  });
}

function detectDocumentBounds(canvas) {
  const maxScanWidth = 360;
  const scale = Math.min(1, maxScanWidth / canvas.width);
  const scanWidth = Math.max(1, Math.round(canvas.width * scale));
  const scanHeight = Math.max(1, Math.round(canvas.height * scale));
  const scanCanvas = document.createElement("canvas");
  const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });

  scanCanvas.width = scanWidth;
  scanCanvas.height = scanHeight;
  scanContext.drawImage(canvas, 0, 0, scanWidth, scanHeight);

  const { data } = scanContext.getImageData(0, 0, scanWidth, scanHeight);
  let minX = scanWidth;
  let minY = scanHeight;
  let maxX = 0;
  let maxY = 0;
  let matches = 0;

  for (let y = 0; y < scanHeight; y += 2) {
    for (let x = 0; x < scanWidth; x += 2) {
      const offset = (y * scanWidth + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

      if (luminance > 135 && saturation < 0.42) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        matches++;
      }
    }
  }

  const area = (maxX - minX) * (maxY - minY);
  const minArea = scanWidth * scanHeight * 0.18;
  const maxArea = scanWidth * scanHeight * 0.96;

  if (!matches || area < minArea || area > maxArea) {
    return null;
  }

  const padding = Math.round(10 * scale);
  const x = Math.max(0, Math.round((minX - padding) / scale));
  const y = Math.max(0, Math.round((minY - padding) / scale));
  const right = Math.min(canvas.width, Math.round((maxX + padding) / scale));
  const bottom = Math.min(canvas.height, Math.round((maxY + padding) / scale));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function rotateAndCropCanvas(sourceCanvas, crop, rotation) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const croppedCanvas = document.createElement("canvas");
  const croppedContext = croppedCanvas.getContext("2d");

  croppedCanvas.width = crop.width;
  croppedCanvas.height = crop.height;
  croppedContext.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  if (normalizedRotation === 0) {
    return croppedCanvas;
  }

  const rotatedCanvas = document.createElement("canvas");
  const rotatedContext = rotatedCanvas.getContext("2d");
  const sideways = normalizedRotation === 90 || normalizedRotation === 270;

  rotatedCanvas.width = sideways ? croppedCanvas.height : croppedCanvas.width;
  rotatedCanvas.height = sideways ? croppedCanvas.width : croppedCanvas.height;

  rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  rotatedContext.rotate((normalizedRotation * Math.PI) / 180);
  rotatedContext.drawImage(
    croppedCanvas,
    -croppedCanvas.width / 2,
    -croppedCanvas.height / 2
  );

  return rotatedCanvas;
}

function applyScanFilter(canvas, filter) {
  if (filter === "original") return;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    if (filter === "bw") {
      const threshold = 172;
      gray = gray > threshold ? 255 : 0;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      continue;
    }

    if (filter === "contrast") {
      const contrast = 1.45;
      data[i] = clamp((r - 128) * contrast + 140);
      data[i + 1] = clamp((g - 128) * contrast + 140);
      data[i + 2] = clamp((b - 128) * contrast + 140);
      continue;
    }

    const contrast = 1.65;
    gray = clamp((gray - 128) * contrast + 155);
    gray = gray > 235 ? 255 : gray;
    gray = gray < 55 ? 0 : gray;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  context.putImageData(imageData, 0, 0);
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas export failed"));
        }
      },
      type,
      quality
    );
  });
}

function showPreview() {
  document.getElementById("cameraSection").classList.add("d-none");
  document.getElementById("previewSection").classList.remove("d-none");

  stopCamera();
  updatePreviewContainer();
}

function updatePreviewContainer() {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";

  capturedImages.forEach((image, index) => {
    const div = document.createElement("div");
    div.className = "scan-page";
    div.innerHTML = `
      <div class="scan-preview-frame">
        <img src="${image.url}" class="document-preview" alt="Strana ${
      index + 1
    }">
        <button class="btn btn-danger btn-sm scan-remove-btn" onclick="removeImage(${index})" title="Obrisi stranu">
          x
        </button>
      </div>
      <div class="scan-page-meta">
        <strong>Strana ${index + 1}</strong>
        <span class="${image.cropDetected ? "text-success" : "text-muted"}">
          ${image.cropDetected ? "Papir pronadjen" : "Bez auto crop-a"}
        </span>
      </div>
      <div class="scan-controls">
        <div class="btn-group btn-group-sm w-100" role="group" aria-label="Filteri">
          ${filterButton(index, "clean", "Clean", image.settings.filter)}
          ${filterButton(index, "bw", "B/W", image.settings.filter)}
          ${filterButton(index, "contrast", "Kontrast", image.settings.filter)}
          ${filterButton(index, "original", "Original", image.settings.filter)}
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-outline-secondary flex-fill" onclick="rotateImage(${index}, -90)">
            Rotiraj L
          </button>
          <button class="btn btn-sm btn-outline-secondary flex-fill" onclick="rotateImage(${index}, 90)">
            Rotiraj D
          </button>
        </div>
        <button class="btn btn-sm ${
          image.settings.autoCrop ? "btn-outline-primary" : "btn-outline-secondary"
        } w-100 mt-2" onclick="toggleAutoCrop(${index})">
          ${image.settings.autoCrop ? "Auto crop ukljucen" : "Auto crop iskljucen"}
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

function filterButton(index, filter, label, activeFilter) {
  const activeClass =
    filter === activeFilter ? "btn-primary" : "btn-outline-primary";
  return `<button class="btn ${activeClass}" onclick="setImageFilter(${index}, '${filter}')">${label}</button>`;
}

async function setImageFilter(index, filter) {
  const image = capturedImages[index];
  if (!image) return;

  image.settings.filter = filter;
  await updateImageProcessing(index);
}

async function rotateImage(index, degrees) {
  const image = capturedImages[index];
  if (!image) return;

  image.settings.rotation = (image.settings.rotation + degrees + 360) % 360;
  await updateImageProcessing(index);
}

async function toggleAutoCrop(index) {
  const image = capturedImages[index];
  if (!image) return;

  image.settings.autoCrop = !image.settings.autoCrop;
  await updateImageProcessing(index);
}

async function updateImageProcessing(index) {
  const container = document.getElementById("previewContainer");
  container.classList.add("scan-processing");

  try {
    await reprocessImage(capturedImages[index]);
    updatePreviewContainer();
  } catch (error) {
    console.error("Image processing error:", error);
    showError("Obrada slike nije uspjela. Probajte drugi filter.");
  } finally {
    container.classList.remove("scan-processing");
  }
}

function removeImage(index) {
  const image = capturedImages[index];
  if (!image) return;

  URL.revokeObjectURL(image.originalUrl);
  if (image.url) URL.revokeObjectURL(image.url);

  capturedImages.splice(index, 1);

  if (capturedImages.length === 0) {
    addPage();
  } else {
    updatePreviewContainer();
  }
}

function addPage() {
  document.getElementById("cameraSection").classList.remove("d-none");
  document.getElementById("previewSection").classList.add("d-none");
  initCamera();
}

async function uploadDocument() {
  if (capturedImages.length === 0) {
    showError("Morate slikati najmanje jednu stranu dokumenta.");
    return;
  }

  const uploadModal = new bootstrap.Modal(
    document.getElementById("uploadModal")
  );
  uploadModal.show();

  try {
    const comment = document.getElementById("comment").value;
    const formData = new FormData();

    for (let i = 0; i < capturedImages.length; i++) {
      formData.append(
        "files",
        capturedImages[i].blob,
        `${documentType}_strana_${i + 1}.jpg`
      );
    }

    formData.append("documentType", documentType);
    formData.append("documentSubtype", "ostalo");
    formData.append("userComment", comment);
    formData.append(
      "originalName",
      `${documentType}_${capturedImages.length}_strane.pdf`
    );

    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: Auth.getAuthHeaders(false),
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Upload failed");
    }

    uploadModal.hide();
    alert("Dokument je uspesno uploadovan!");
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Upload error:", error);
    uploadModal.hide();
    showError("Greska prilikom uploada. Pokusajte ponovo.");
  }
}

function showError(message) {
  const errorAlert = document.getElementById("errorAlert");
  errorAlert.textContent = message;
  errorAlert.classList.remove("d-none");

  setTimeout(() => {
    errorAlert.classList.add("d-none");
  }, 5000);
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }
}

window.addEventListener("beforeunload", function () {
  stopCamera();

  capturedImages.forEach((image) => {
    URL.revokeObjectURL(image.originalUrl);
    if (image.url) URL.revokeObjectURL(image.url);
  });
});
