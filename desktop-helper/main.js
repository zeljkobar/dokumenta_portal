const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs").promises;
const path = require("path");

function sanitizeSegment(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeRelativePath(relativePath) {
  return String(relativePath || "")
    .split(/[\\/]+/)
    .map((segment) => sanitizeSegment(segment))
    .filter(Boolean)
    .join(path.sep);
}

function sanitizeFileName(fileName) {
  const base = sanitizeSegment(fileName || "document.pdf");
  return base || "document.pdf";
}

async function createUniqueFilePath(basePath, fileName) {
  const ext = path.extname(fileName);
  const name = path.basename(fileName, ext);

  let candidate = path.join(basePath, fileName);
  let index = 1;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(basePath, `${name}_${index}${ext}`);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
}

ipcMain.handle("select-sync-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Izaberi lokalni OneDrive/Firme folder",
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("save-document", async (_event, payload) => {
  const { basePath, relativePath, fileName, bytes } = payload || {};

  if (!basePath) {
    throw new Error("Nije izabran root folder za sync");
  }

  const safeRelative = sanitizeRelativePath(relativePath);
  const safeName = sanitizeFileName(fileName);
  const destinationFolder = safeRelative
    ? path.join(basePath, safeRelative)
    : basePath;

  await fs.mkdir(destinationFolder, { recursive: true });

  const finalPath = await createUniqueFilePath(destinationFolder, safeName);
  const buffer = Buffer.from(bytes || []);

  await fs.writeFile(finalPath, buffer);

  return {
    finalPath,
    relativeSavedPath: path.relative(basePath, finalPath),
  };
});

ipcMain.handle("open-externally", async (_event, url) => {
  if (url) {
    await shell.openExternal(String(url));
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
