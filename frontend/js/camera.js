// Camera functionality
let videoStream = null;
let capturedImages = [];
let documentType = "";
let documentSubtype = "ostalo";
let captureMode = "document";
let liveOverlayInterval = null;
let liveOverlaySampleCanvas = null;

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
  documentSubtype =
    localStorage.getItem("selectedDocumentSubtype") || "ostalo";

  document.getElementById("documentTypeTitle").textContent =
    getDocumentTitle();

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
    await video.play().catch(() => {});

    toggleOverlayVisibility();
    startLiveOverlay();
  } catch (error) {
    console.error("Error accessing camera:", error);
    showError(
      "Greska pristupa kameri. Molimo dozvolite pristup kameri i pokusajte ponovo."
    );
  }
}

function toggleOverlayVisibility() {
  const overlay = document.getElementById("camera-overlay");
  if (!overlay) return;

  if (captureMode === "document") {
    overlay.classList.remove("d-none");
  } else {
    overlay.classList.add("d-none");
  }
}

function startLiveOverlay() {
  stopLiveOverlay();

  const video = document.getElementById("camera-view");
  const overlay = document.getElementById("camera-overlay");
  if (!video || !overlay) return;

  const paint = () => {
    if (
      captureMode !== "document" ||
      !videoStream ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      clearOverlay();
      return;
    }

    const sampleCanvas = getOverlaySampleCanvas(video.videoWidth, video.videoHeight);
    const sampleContext = sampleCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    sampleContext.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);

    const bounds = detectDocumentBounds(sampleCanvas);

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    drawOverlayBounds(overlay, bounds, sampleCanvas.width, sampleCanvas.height);
  };

  paint();
  liveOverlayInterval = setInterval(paint, 350);
}

function stopLiveOverlay() {
  if (liveOverlayInterval) {
    clearInterval(liveOverlayInterval);
    liveOverlayInterval = null;
  }
  clearOverlay();
}

function clearOverlay() {
  const overlay = document.getElementById("camera-overlay");
  if (!overlay) return;

  const context = overlay.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, overlay.width, overlay.height);
}

function getOverlaySampleCanvas(videoWidth, videoHeight) {
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / videoWidth);
  const width = Math.max(1, Math.round(videoWidth * scale));
  const height = Math.max(1, Math.round(videoHeight * scale));

  if (!liveOverlaySampleCanvas) {
    liveOverlaySampleCanvas = document.createElement("canvas");
  }

  if (
    liveOverlaySampleCanvas.width !== width ||
    liveOverlaySampleCanvas.height !== height
  ) {
    liveOverlaySampleCanvas.width = width;
    liveOverlaySampleCanvas.height = height;
  }

  return liveOverlaySampleCanvas;
}

function drawOverlayBounds(overlayCanvas, bounds, sampleWidth, sampleHeight) {
  const context = overlayCanvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (!bounds) {
    drawOverlayLabel(
      context,
      "Poravnajte papir unutar kadra",
      "rgba(255, 215, 0, 0.95)"
    );
    return;
  }

  const scaleX = overlayCanvas.width / sampleWidth;
  const scaleY = overlayCanvas.height / sampleHeight;
  const mapped = {
    x: bounds.x * scaleX,
    y: bounds.y * scaleY,
    width: bounds.width * scaleX,
    height: bounds.height * scaleY,
  };

  const quality = getOverlayQuality(mapped, overlayCanvas.width, overlayCanvas.height);
  const strokeColor = quality.ready ? "#29d884" : "#f5c542";
  const fillColor = quality.ready
    ? "rgba(41, 216, 132, 0.12)"
    : "rgba(245, 197, 66, 0.12)";

  context.lineWidth = 6;
  context.strokeStyle = strokeColor;
  context.fillStyle = fillColor;

  drawRoundedRect(context, mapped.x, mapped.y, mapped.width, mapped.height, 18);
  context.fill();
  context.stroke();

  drawCornerGuides(context, mapped, strokeColor);
  drawOverlayLabel(context, quality.label, strokeColor);
}

function getOverlayQuality(bounds, canvasWidth, canvasHeight) {
  const areaRatio = (bounds.width * bounds.height) / (canvasWidth * canvasHeight);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const normalizedCenterDistance =
    Math.hypot(centerX - canvasWidth / 2, centerY - canvasHeight / 2) /
    Math.hypot(canvasWidth / 2, canvasHeight / 2);

  const hasGoodArea = areaRatio > 0.22 && areaRatio < 0.9;
  const hasGoodCenter = normalizedCenterDistance < 0.3;
  const ready = hasGoodArea && hasGoodCenter;

  return {
    ready,
    label: ready ? "Dokument je spreman za slikanje" : "Priblizite i poravnajte dokument",
  };
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawCornerGuides(context, bounds, color) {
  const cornerLength = Math.max(22, Math.round(Math.min(bounds.width, bounds.height) * 0.11));
  const points = [
    [bounds.x, bounds.y, 1, 1],
    [bounds.x + bounds.width, bounds.y, -1, 1],
    [bounds.x, bounds.y + bounds.height, 1, -1],
    [bounds.x + bounds.width, bounds.y + bounds.height, -1, -1],
  ];

  context.save();
  context.strokeStyle = color;
  context.lineWidth = 8;
  context.lineCap = "round";

  points.forEach(([x, y, dx, dy]) => {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + cornerLength * dx, y);
    context.moveTo(x, y);
    context.lineTo(x, y + cornerLength * dy);
    context.stroke();
  });

  context.restore();
}

function drawOverlayLabel(context, text, color) {
  const paddingX = 14;
  const paddingY = 10;
  context.save();
  context.font = "600 26px Manrope, sans-serif";
  const textWidth = context.measureText(text).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 44;
  const boxX = Math.max(12, (context.canvas.width - boxWidth) / 2);
  const boxY = 18;

  context.fillStyle = "rgba(10, 18, 39, 0.62)";
  drawRoundedRect(context, boxX, boxY, boxWidth, boxHeight, 14);
  context.fill();

  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, boxX + paddingX, boxY + boxHeight / 2);
  context.restore();
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

    if (captureMode === "qr") {
      await captureQrCode(originalBlob, canvas);
      return;
    }

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
    perspectiveCorrected: false,
    isQr: false,
    qrValue: "",
    timestamp: Date.now(),
  };

  await reprocessImage(image);
  return image;
}

async function createQrImage(originalBlob, qrValue, qrBounds) {
  const image = {
    originalBlob,
    originalUrl: URL.createObjectURL(originalBlob),
    blob: originalBlob,
    url: "",
    settings: {
      filter: "contrast",
      autoCrop: true,
      rotation: 0,
      qrBounds: qrBounds || null,
    },
    cropDetected: false,
    perspectiveCorrected: false,
    isQr: true,
    qrValue: qrValue || "",
    qrBounds: qrBounds || null,
    timestamp: Date.now(),
  };

  await reprocessImage(image);
  return image;
}

async function captureQrCode(originalBlob, sourceCanvas) {
  const qrResult = await decodeQrFromCanvas(sourceCanvas);
  const qrValue = qrResult.value;
  const qrImage = await createQrImage(originalBlob, qrValue, qrResult.bounds);

  removeExistingQrImage();
  capturedImages.push(qrImage);

  if (qrValue) {
    document.getElementById("fiscalizationUrl").value = qrValue;
    showQrResult(
      "success",
      "QR kod je procitan",
      `Link je sacuvan i QR slika je dodata kao zadnja strana PDF-a. ${shortenQrValue(
        qrValue
      )}`
    );
  } else {
    showQrResult(
      "warning",
      "QR slika je dodata, ali link nije procitan",
      "Ponovo slikajte QR kod. Upload nije moguc dok link ne bude procitan."
    );
  }

  captureMode = "document";
  showPreview();
}

async function decodeQrFromCanvas(canvas) {
  if (!("BarcodeDetector" in window)) {
    return { value: "", bounds: null };
  }

  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const results = await detector.detect(canvas);
    const qrResult = results.find((result) => result.rawValue);
    return qrResult
      ? {
          value: qrResult.rawValue,
          bounds: getQrBounds(qrResult, canvas),
        }
      : { value: "", bounds: null };
  } catch (error) {
    console.warn("QR decode failed:", error);
    return { value: "", bounds: null };
  }
}

function getQrBounds(qrResult, canvas) {
  if (qrResult.boundingBox) {
    return expandBounds(
      {
        x: qrResult.boundingBox.x,
        y: qrResult.boundingBox.y,
        width: qrResult.boundingBox.width,
        height: qrResult.boundingBox.height,
      },
      canvas.width,
      canvas.height,
      0.24
    );
  }

  if (qrResult.cornerPoints && qrResult.cornerPoints.length) {
    const xs = qrResult.cornerPoints.map((point) => point.x);
    const ys = qrResult.cornerPoints.map((point) => point.y);
    return expandBounds(
      {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      canvas.width,
      canvas.height,
      0.24
    );
  }

  return null;
}

async function reprocessImage(image) {
  const result = await processDocumentImage(image.originalBlob, image.settings);

  if (image.url) {
    URL.revokeObjectURL(image.url);
  }

  image.blob = result.blob;
  image.url = URL.createObjectURL(result.blob);
  image.cropDetected = result.cropDetected;
  image.perspectiveCorrected = Boolean(result.perspectiveCorrected);
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

  let outputCanvas = sourceCanvas;
  let bounds = null;
  let perspectiveCorrected = false;

  if (settings.autoCrop) {
    bounds = settings.qrBounds || detectDocumentBounds(sourceCanvas);

    if (!settings.qrBounds) {
      const quad = detectDocumentQuadrilateral(sourceCanvas, bounds);
      if (quad) {
        outputCanvas = warpDocumentFromQuadrilateral(sourceCanvas, quad);
        perspectiveCorrected = true;
        bounds = {
          x: 0,
          y: 0,
          width: outputCanvas.width,
          height: outputCanvas.height,
        };
      }
    }

    if (!perspectiveCorrected) {
      const crop = bounds || {
        x: 0,
        y: 0,
        width: sourceCanvas.width,
        height: sourceCanvas.height,
      };
      outputCanvas = rotateAndCropCanvas(sourceCanvas, crop, 0);
    }
  }

  const rotated = rotateAndCropCanvas(
    outputCanvas,
    {
      x: 0,
      y: 0,
      width: outputCanvas.width,
      height: outputCanvas.height,
    },
    settings.rotation
  );

  applyScanFilter(rotated, settings.filter);

  return {
    blob: await canvasToBlob(rotated, "image/jpeg", 0.9),
    cropDetected: Boolean(bounds),
    perspectiveCorrected,
  };
}

function detectDocumentQuadrilateral(canvas, fallbackBounds) {
  const maxScanWidth = 520;
  const scale = Math.min(1, maxScanWidth / canvas.width);
  const scanWidth = Math.max(1, Math.round(canvas.width * scale));
  const scanHeight = Math.max(1, Math.round(canvas.height * scale));
  const scanCanvas = document.createElement("canvas");
  const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });

  scanCanvas.width = scanWidth;
  scanCanvas.height = scanHeight;
  scanContext.drawImage(canvas, 0, 0, scanWidth, scanHeight);

  const { data } = scanContext.getImageData(0, 0, scanWidth, scanHeight);
  const mask = new Uint8Array(scanWidth * scanHeight);
  const scene = analyzeSceneLuminance(data);
  const paperLuminanceThreshold = scene.lowLight
    ? Math.max(92, Math.min(112, scene.avg + 12))
    : Math.max(108, Math.min(130, scene.avg + 8));
  const paperSaturationThreshold = scene.lowLight ? 0.42 : 0.35;

  for (let y = 0; y < scanHeight; y++) {
    for (let x = 0; x < scanWidth; x++) {
      const offset = (y * scanWidth + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      if (luminance > paperLuminanceThreshold && saturation < paperSaturationThreshold) {
        mask[y * scanWidth + x] = 1;
      }
    }
  }

  const candidateBounds = fallbackBounds
    ? {
        x: Math.max(0, Math.round(fallbackBounds.x * scale)),
        y: Math.max(0, Math.round(fallbackBounds.y * scale)),
        width: Math.max(1, Math.round(fallbackBounds.width * scale)),
        height: Math.max(1, Math.round(fallbackBounds.height * scale)),
      }
    : { x: 0, y: 0, width: scanWidth, height: scanHeight };

  const xStart = candidateBounds.x;
  const yStart = candidateBounds.y;
  const xEnd = Math.min(scanWidth - 1, candidateBounds.x + candidateBounds.width);
  const yEnd = Math.min(scanHeight - 1, candidateBounds.y + candidateBounds.height);
  const edgePoints = [];

  for (let y = yStart + 1; y < yEnd - 1; y += 2) {
    for (let x = xStart + 1; x < xEnd - 1; x += 2) {
      const idx = y * scanWidth + x;
      if (!mask[idx]) continue;

      const hasOutsideNeighbor =
        !mask[idx - 1] ||
        !mask[idx + 1] ||
        !mask[idx - scanWidth] ||
        !mask[idx + scanWidth];

      if (hasOutsideNeighbor) {
        edgePoints.push({ x, y });
      }
    }
  }

  const minEdgePoints = scene.lowLight ? 90 : 120;
  if (edgePoints.length < minEdgePoints) {
    return null;
  }

  const tl = pickExtremeCluster(edgePoints, (p) => p.x + p.y, "min");
  const br = pickExtremeCluster(edgePoints, (p) => p.x + p.y, "max");
  const tr = pickExtremeCluster(edgePoints, (p) => p.x - p.y, "max");
  const bl = pickExtremeCluster(edgePoints, (p) => p.x - p.y, "min");

  if (!tl || !tr || !br || !bl) return null;

  const quadScaled = [tl, tr, br, bl];
  if (!isValidQuad(quadScaled, scanWidth, scanHeight)) {
    return null;
  }

  return quadScaled.map((point) => ({
    x: point.x / scale,
    y: point.y / scale,
  }));
}

function pickExtremeCluster(points, scoreFn, mode) {
  const sorted = [...points].sort((a, b) => {
    const scoreDiff = scoreFn(a) - scoreFn(b);
    return mode === "min" ? scoreDiff : -scoreDiff;
  });

  const sampleSize = Math.max(8, Math.round(points.length * 0.02));
  const selected = sorted.slice(0, sampleSize);
  if (!selected.length) return null;

  const average = selected.reduce(
    (acc, point) => {
      acc.x += point.x;
      acc.y += point.y;
      return acc;
    },
    { x: 0, y: 0 }
  );

  return {
    x: average.x / selected.length,
    y: average.y / selected.length,
  };
}

function isValidQuad(quad, width, height) {
  const area = polygonArea(quad);
  const imageArea = width * height;
  if (area < imageArea * 0.08) return false;

  const [tl, tr, br, bl] = quad;
  const top = distanceBetween(tl, tr);
  const right = distanceBetween(tr, br);
  const bottom = distanceBetween(br, bl);
  const left = distanceBetween(bl, tl);

  if (Math.min(top, right, bottom, left) < 20) return false;

  return true;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function warpDocumentFromQuadrilateral(sourceCanvas, quad) {
  const [tl, tr, br, bl] = quad;
  const targetWidth = Math.max(
    Math.round(distanceBetween(tl, tr)),
    Math.round(distanceBetween(bl, br)),
    1
  );
  const targetHeight = Math.max(
    Math.round(distanceBetween(tl, bl)),
    Math.round(distanceBetween(tr, br)),
    1
  );

  const destination = document.createElement("canvas");
  destination.width = targetWidth;
  destination.height = targetHeight;
  const context = destination.getContext("2d");

  drawWarpedTriangle(
    context,
    sourceCanvas,
    [tl, tr, bl],
    [
      { x: 0, y: 0 },
      { x: targetWidth, y: 0 },
      { x: 0, y: targetHeight },
    ]
  );

  drawWarpedTriangle(
    context,
    sourceCanvas,
    [tr, br, bl],
    [
      { x: targetWidth, y: 0 },
      { x: targetWidth, y: targetHeight },
      { x: 0, y: targetHeight },
    ]
  );

  return destination;
}

function drawWarpedTriangle(context, image, srcTri, dstTri) {
  const matrix = getAffineTransform(srcTri, dstTri);
  if (!matrix) return;

  context.save();
  context.beginPath();
  context.moveTo(dstTri[0].x, dstTri[0].y);
  context.lineTo(dstTri[1].x, dstTri[1].y);
  context.lineTo(dstTri[2].x, dstTri[2].y);
  context.closePath();
  context.clip();

  context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  context.drawImage(image, 0, 0);
  context.restore();
}

function getAffineTransform(srcTri, dstTri) {
  const [s0, s1, s2] = srcTri;
  const [d0, d1, d2] = dstTri;
  const denominator =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);

  if (Math.abs(denominator) < 1e-6) {
    return null;
  }

  const a =
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) /
    denominator;
  const b =
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) /
    denominator;
  const c =
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) /
    denominator;
  const d =
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) /
    denominator;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denominator;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denominator;

  return { a, b, c, d, e, f };
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
  const mask = new Uint8Array(scanWidth * scanHeight);
  const centerX = scanWidth / 2;
  const centerY = scanHeight / 2;
  const scene = analyzeSceneLuminance(data);
  const paperLuminanceThreshold = scene.lowLight
    ? Math.max(90, Math.min(110, scene.avg + 10))
    : Math.max(108, Math.min(128, scene.avg + 8));
  const paperSaturationThreshold = scene.lowLight ? 0.4 : 0.32;
  const minFillRatio = scene.lowLight ? 0.16 : 0.22;
  const minAreaRatio = scene.lowLight ? 0.06 : 0.08;

  for (let y = 0; y < scanHeight; y++) {
    for (let x = 0; x < scanWidth; x++) {
      const offset = (y * scanWidth + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

      if (luminance > paperLuminanceThreshold && saturation < paperSaturationThreshold) {
        mask[y * scanWidth + x] = 1;
      }
    }
  }

  const visited = new Uint8Array(mask.length);
  let best = null;
  const queue = [];

  for (let y = 0; y < scanHeight; y += 2) {
    for (let x = 0; x < scanWidth; x += 2) {
      const start = y * scanWidth + x;
      if (!mask[start] || visited[start]) continue;

      const component = floodFillMask(mask, visited, queue, scanWidth, scanHeight, x, y);
      const width = component.maxX - component.minX + 1;
      const height = component.maxY - component.minY + 1;
      const boxArea = width * height;
      const fillRatio = component.count / boxArea;
      const imageArea = scanWidth * scanHeight;
      const aspectRatio = width / height;
      const componentCenterX = component.minX + width / 2;
      const componentCenterY = component.minY + height / 2;
      const centerDistance =
        Math.hypot(componentCenterX - centerX, componentCenterY - centerY) /
        Math.hypot(centerX, centerY);

      if (
        boxArea < imageArea * minAreaRatio ||
        boxArea > imageArea * 0.9 ||
        fillRatio < minFillRatio ||
        aspectRatio < 0.35 ||
        aspectRatio > 3.2
      ) {
        continue;
      }

      const score = boxArea * (1 - Math.min(centerDistance, 0.9));
      if (!best || score > best.score) {
        best = { ...component, score };
      }
    }
  }

  if (!best) {
    return detectContentBounds(canvas);
  }

  const padding = Math.max(10, Math.round(Math.min(best.maxX - best.minX, best.maxY - best.minY) * 0.035));
  const x = Math.max(0, Math.round((best.minX - padding) / scale));
  const y = Math.max(0, Math.round((best.minY - padding) / scale));
  const right = Math.min(canvas.width, Math.round((best.maxX + padding) / scale));
  const bottom = Math.min(canvas.height, Math.round((best.maxY + padding) / scale));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function floodFillMask(mask, visited, queue, width, height, startX, startY) {
  let head = 0;
  let count = 0;
  let minX = startX;
  let minY = startY;
  let maxX = startX;
  let maxY = startY;

  queue.length = 0;
  queue.push([startX, startY]);
  visited[startY * width + startX] = 1;

  while (head < queue.length) {
    const [x, y] = queue[head++];
    count++;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

      const index = ny * width + nx;
      if (!mask[index] || visited[index]) continue;

      visited[index] = 1;
      queue.push([nx, ny]);
    }
  }

  return { count, minX, minY, maxX, maxY };
}

function detectContentBounds(canvas) {
  const scanCanvas = document.createElement("canvas");
  const maxScanWidth = 360;
  const scale = Math.min(1, maxScanWidth / canvas.width);
  const scanWidth = Math.max(1, Math.round(canvas.width * scale));
  const scanHeight = Math.max(1, Math.round(canvas.height * scale));
  const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });

  scanCanvas.width = scanWidth;
  scanCanvas.height = scanHeight;
  scanContext.drawImage(canvas, 0, 0, scanWidth, scanHeight);

  const { data } = scanContext.getImageData(0, 0, scanWidth, scanHeight);
  const scene = analyzeSceneLuminance(data);
  const darkContentThreshold = scene.lowLight
    ? Math.max(84, Math.min(112, scene.avg + 12))
    : Math.max(100, Math.min(128, scene.avg + 10));
  const contrastThreshold = scene.lowLight ? 34 : 42;
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
      const contrast = Math.max(r, g, b) - Math.min(r, g, b);

      if (luminance < darkContentThreshold || contrast > contrastThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        matches++;
      }
    }
  }

  if (!matches) return null;

  const padding = Math.round(28 * scale);
  return expandBounds(
    {
      x: Math.round((minX - padding) / scale),
      y: Math.round((minY - padding) / scale),
      width: Math.round((maxX - minX + padding * 2) / scale),
      height: Math.round((maxY - minY + padding * 2) / scale),
    },
    canvas.width,
    canvas.height,
    0
  );
}

function analyzeSceneLuminance(pixelData) {
  let luminanceSum = 0;
  let count = 0;

  for (let i = 0; i < pixelData.length; i += 16) {
    const r = pixelData[i];
    const g = pixelData[i + 1];
    const b = pixelData[i + 2];
    luminanceSum += 0.299 * r + 0.587 * g + 0.114 * b;
    count++;
  }

  const avg = count ? luminanceSum / count : 128;
  return {
    avg,
    lowLight: avg < 112,
  };
}

function expandBounds(bounds, maxWidth, maxHeight, ratio) {
  const padding = Math.round(Math.max(bounds.width, bounds.height) * ratio);
  const x = Math.max(0, Math.round(bounds.x - padding));
  const y = Math.max(0, Math.round(bounds.y - padding));
  const right = Math.min(maxWidth, Math.round(bounds.x + bounds.width + padding));
  const bottom = Math.min(maxHeight, Math.round(bounds.y + bounds.height + padding));

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
  captureMode = "document";
  document.getElementById("cameraSection").classList.add("d-none");
  document.getElementById("previewSection").classList.remove("d-none");
  document.getElementById("cancelQrScanBtn").classList.add("d-none");
  document.getElementById("documentTypeTitle").textContent =
    getDocumentTitle();

  stopCamera();
  updatePreviewContainer();
}

function updatePreviewContainer() {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";

  capturedImages.forEach((image, index) => {
    const pageLabel = image.isQr ? "QR kod" : `Strana ${getDocumentPageNumber(index)}`;
    const statusLabel = image.isQr
      ? image.qrValue
        ? "Link procitan"
        : "Link nije procitan"
      : image.perspectiveCorrected
        ? "Perspektiva ispravljena"
      : image.cropDetected
        ? "Papir pronadjen"
        : "Bez auto crop-a";
    const statusClass = image.isQr
      ? image.qrValue
        ? "text-success"
        : "text-warning"
      : image.cropDetected
        ? "text-success"
        : "text-muted";

    const div = document.createElement("div");
    const unreadQrClass = image.isQr && !image.qrValue ? " scan-page-qr-missing" : "";
    div.className = `scan-page${unreadQrClass}`;
    div.innerHTML = `
      <div class="scan-preview-frame">
        <img src="${image.url}" class="document-preview" alt="${pageLabel}">
        <button class="btn btn-danger btn-sm scan-remove-btn" onclick="removeImage(${index})" title="Obrisi stranu">
          x
        </button>
      </div>
      <div class="scan-page-meta">
        <strong>${pageLabel}</strong>
        <span class="${statusClass}">${statusLabel}</span>
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

function getDocumentPageNumber(index) {
  return capturedImages
    .slice(0, index + 1)
    .filter((image) => !image.isQr).length;
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

  if (image.isQr) {
    document.getElementById("fiscalizationUrl").value = "";
    clearQrResult();
    setQrStatus("QR kod je uklonjen. Mozete ga ponovo uslikati.", "muted");
  }

  if (capturedImages.length === 0) {
    addPage();
  } else {
    updatePreviewContainer();
  }
}

function addPage() {
  captureMode = "document";
  document.getElementById("cameraSection").classList.remove("d-none");
  document.getElementById("previewSection").classList.add("d-none");
  document.getElementById("cancelQrScanBtn").classList.add("d-none");
  document.getElementById("documentTypeTitle").textContent =
    getDocumentTitle();
  toggleOverlayVisibility();
  initCamera();
}

function startQrScan() {
  if (capturedImages.filter((image) => !image.isQr).length === 0) {
    showError("Prvo slikajte dokument, pa zatim posebno QR kod.");
    return;
  }

  captureMode = "qr";
  document.getElementById("previewSection").classList.add("d-none");
  document.getElementById("cameraSection").classList.remove("d-none");
  document.getElementById("cancelQrScanBtn").classList.remove("d-none");
  document.getElementById("documentTypeTitle").textContent =
    "Slikanje QR koda";
  clearQrResult();
  setQrStatus("Priblizite kameru QR kodu i uslikajte ga.", "muted");
  toggleOverlayVisibility();
  initCamera();
}

function cancelQrScan() {
  captureMode = "document";
  showPreview();
}

function removeExistingQrImage() {
  const existingIndex = capturedImages.findIndex((image) => image.isQr);

  if (existingIndex === -1) return;

  const existingImage = capturedImages[existingIndex];
  URL.revokeObjectURL(existingImage.originalUrl);
  if (existingImage.url) URL.revokeObjectURL(existingImage.url);
  capturedImages.splice(existingIndex, 1);
}

function getUploadImages() {
  const documentPages = capturedImages.filter((image) => !image.isQr);
  const qrPages = capturedImages.filter((image) => image.isQr);
  return [...documentPages, ...qrPages];
}

function setQrStatus(message, tone) {
  const status = document.getElementById("qrStatus");
  if (!status) return;

  status.textContent = message;
  status.className = "form-text";

  if (tone === "success") {
    status.classList.add("text-success");
  } else if (tone === "warning") {
    status.classList.add("text-warning");
  } else {
    status.classList.add("text-muted");
  }
}

function showQrResult(tone, title, message) {
  const alert = document.getElementById("qrResultAlert");
  if (!alert) return;

  alert.className = `qr-result-alert qr-result-${tone}`;
  alert.innerHTML = `
    <strong>${title}</strong>
    <span>${message}</span>
  `;
  setQrStatus(message, tone);
}

function clearQrResult() {
  const alert = document.getElementById("qrResultAlert");
  if (!alert) return;

  alert.className = "qr-result-alert d-none";
  alert.innerHTML = "";
}

function shortenQrValue(value) {
  if (!value) return "";
  return value.length > 78 ? `${value.slice(0, 75)}...` : value;
}

function getDocumentTitle() {
  const titles = {
    ulazni: "Slikanje ulaznog dokumenta",
    izlazni: "Slikanje izlaznog dokumenta",
    izvod: "Slikanje bankovnog izvoda",
    racun: "Slikanje racuna",
    ugovor: "Slikanje ugovora",
    potvrda: "Slikanje potvrde",
    ostalo: "Slikanje dokumenta",
  };

  return titles[documentType] || titles.ostalo;
}

async function uploadDocument() {
  const uploadImages = getUploadImages();

  if (uploadImages.filter((image) => !image.isQr).length === 0) {
    showError("Morate slikati najmanje jednu stranu dokumenta.");
    return;
  }

  const hasUnreadableQrCapture = uploadImages.some(
    (image) => image.isQr && !image.qrValue
  );

  if (hasUnreadableQrCapture) {
    showError("Nije procitan QR kod. Ponovo uslikajte QR kod prije upload-a.");
    return;
  }

  const uploadModal = new bootstrap.Modal(
    document.getElementById("uploadModal")
  );
  uploadModal.show();

  try {
    const comment = document.getElementById("comment").value;
    const formData = new FormData();

    for (let i = 0; i < uploadImages.length; i++) {
      const image = uploadImages[i];
      formData.append(
        "files",
        image.blob,
        image.isQr
          ? `${documentType}_qr_kod.jpg`
          : `${documentType}_strana_${i + 1}.jpg`
      );
    }

    const fiscalizationUrl = document
      .getElementById("fiscalizationUrl")
      .value.trim();

    formData.append("documentType", documentType);
    formData.append("documentSubtype", documentSubtype);
    formData.append("userComment", comment);
    formData.append("fiscalizationUrl", fiscalizationUrl);
    formData.append(
      "originalName",
      `${documentType}_${uploadImages.length}_strane.pdf`
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
  stopLiveOverlay();

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
