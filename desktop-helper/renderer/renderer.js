const state = {
  portalUrl: localStorage.getItem("helper.portalUrl") || "https://dokumenta.summasummarum.me",
  token: localStorage.getItem("helper.token") || "",
  syncRoot: localStorage.getItem("helper.syncRoot") || "",
  docs: [],
  selected: new Set(),
};

const portalUrlInput = document.getElementById("portalUrl");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginStatus = document.getElementById("loginStatus");
const folderPathEl = document.getElementById("folderPath");
const docsBody = document.getElementById("documentsBody");
const docCount = document.getElementById("docCount");
const logOutput = document.getElementById("logOutput");

function log(message) {
  const line = `[${new Date().toLocaleTimeString("sr-RS")}] ${message}`;
  logOutput.value = `${logOutput.value}${line}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function normalizeUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  return trimmed.replace(/\/$/, "");
}

function statusClass(type) {
  if (type === "ok") return "ok";
  if (type === "err") return "err";
  return "muted";
}

function setLoginStatus(text, type = "muted") {
  loginStatus.textContent = text;
  loginStatus.className = `status ${statusClass(type)}`;
}

function updateFolderLabel() {
  if (state.syncRoot) {
    folderPathEl.textContent = state.syncRoot;
    folderPathEl.className = "status ok";
  } else {
    folderPathEl.textContent = "Folder nije izabran.";
    folderPathEl.className = "status muted";
  }
}

function getStatusBadge(status) {
  const value = String(status || "pending").toLowerCase();
  const label = value === "synced" ? "synced" : value === "failed" ? "failed" : "pending";
  return `<span class="badge ${label}">${label}</span>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDocs() {
  if (!state.docs.length) {
    docsBody.innerHTML = `
      <tr>
        <td colspan="7" class="muted">Nema dokumenata za sync.</td>
      </tr>
    `;
    docCount.textContent = "0 dokumenata";
    return;
  }

  docsBody.innerHTML = state.docs
    .map((doc) => {
      const checked = state.selected.has(doc.id) ? "checked" : "";
      return `
        <tr>
          <td><input type="checkbox" data-id="${doc.id}" ${checked} /></td>
          <td>${doc.id}</td>
          <td>${escapeHtml(doc.syncFileName || doc.originalName || doc.filename)}</td>
          <td>${escapeHtml(doc.companyName || "-")}</td>
          <td>${escapeHtml(doc.documentType || "-")}</td>
          <td><small>${escapeHtml(doc.relativePath || "-")}</small></td>
          <td>${getStatusBadge(doc.syncStatus)}</td>
        </tr>
      `;
    })
    .join("");

  docCount.textContent = `${state.docs.length} dokumenata`;
}

async function apiFetch(path, options = {}, asBlob = false) {
  const baseUrl = normalizeUrl(state.portalUrl || portalUrlInput.value);
  if (!baseUrl) {
    throw new Error("Portal URL je obavezan");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${response.status})`);
  }

  if (asBlob) {
    return response.blob();
  }

  return response.json();
}

function buildFallbackRelativePath(doc) {
  const month = String(doc.month || "").padStart(2, "0");
  const parts = [doc.companyName, doc.year, doc.documentType, month];

  if (doc.documentSubtype && doc.documentType === "ulazni") {
    parts.push(doc.documentSubtype);
  }

  return parts.filter(Boolean).join("/");
}

async function login() {
  try {
    state.portalUrl = normalizeUrl(portalUrlInput.value);
    localStorage.setItem("helper.portalUrl", state.portalUrl);

    const payload = {
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    };

    const response = await fetch(`${state.portalUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Login nije uspio");
    }

    state.token = data.token;
    localStorage.setItem("helper.token", state.token);

    setLoginStatus(`Prijavljeni ste kao ${data.user?.username || "admin"}.`, "ok");
    log("Admin login uspešan.");

    await loadDocuments();
  } catch (error) {
    setLoginStatus(error.message || "Login error", "err");
    log(`LOGIN ERROR: ${error.message}`);
  }
}

function logout() {
  state.token = "";
  state.docs = [];
  state.selected.clear();
  localStorage.removeItem("helper.token");
  setLoginStatus("Odjavljeni ste.", "muted");
  renderDocs();
  log("Odjava završena.");
}

async function selectFolder() {
  const folder = await window.desktopApi.selectSyncFolder();
  if (!folder) return;

  state.syncRoot = folder;
  localStorage.setItem("helper.syncRoot", folder);
  updateFolderLabel();
  log(`Sync root postavljen: ${folder}`);
}

async function loadDocuments() {
  if (!state.token) {
    setLoginStatus("Prvo se prijavite.", "err");
    return;
  }

  try {
    const docs = await apiFetch("/api/admin/helper/documents?limit=500");
    state.docs = Array.isArray(docs) ? docs : [];
    state.selected = new Set();
    renderDocs();
    log(`Učitano dokumenata: ${state.docs.length}`);
  } catch (error) {
    log(`LOAD ERROR: ${error.message}`);
    setLoginStatus(error.message, "err");
  }
}

async function syncSelected() {
  if (!state.token) {
    setLoginStatus("Prvo se prijavite.", "err");
    return;
  }

  if (!state.syncRoot) {
    log("Nije izabran lokalni folder.");
    return;
  }

  const selectedDocs = state.docs.filter((doc) => state.selected.has(doc.id));
  if (!selectedDocs.length) {
    log("Nema izabranih dokumenata.");
    return;
  }

  let success = 0;
  let failed = 0;

  for (const doc of selectedDocs) {
    const displayName =
      doc.syncFileName || doc.originalName || doc.filename || `doc_${doc.id}.pdf`;

    try {
      log(`Sync start: #${doc.id} ${displayName}`);

      const blob = await apiFetch(`/api/admin/documents/${doc.id}/download`, {}, true);
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const relativePath = doc.relativePath || buildFallbackRelativePath(doc);
      const saved = await window.desktopApi.saveDocument({
        basePath: state.syncRoot,
        relativePath,
        fileName: displayName,
        bytes,
      });

      await apiFetch(`/api/admin/helper/documents/${doc.id}/mark-synced`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPath: saved.relativeSavedPath }),
      });

      log(`Synced: #${doc.id} -> ${saved.relativeSavedPath}`);
      success += 1;
    } catch (error) {
      log(`SYNC ERROR #${doc.id}: ${error.message}`);
      failed += 1;
    }
  }

  log(`Sync završen. Uspešno: ${success}, greške: ${failed}`);
  await loadDocuments();
}

function toggleSelectAll() {
  if (!state.docs.length) return;

  const allSelected = state.docs.every((doc) => state.selected.has(doc.id));
  if (allSelected) {
    state.selected.clear();
  } else {
    state.docs.forEach((doc) => state.selected.add(doc.id));
  }

  renderDocs();
}

portalUrlInput.value = state.portalUrl;
updateFolderLabel();
renderDocs();
setLoginStatus(state.token ? "Token je učitan. Klikni Refresh." : "Niste prijavljeni.");

if (state.token) {
  loadDocuments().catch(() => {});
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("selectFolderBtn").addEventListener("click", selectFolder);
document.getElementById("refreshBtn").addEventListener("click", loadDocuments);
document.getElementById("syncSelectedBtn").addEventListener("click", syncSelected);
document.getElementById("selectAllBtn").addEventListener("click", toggleSelectAll);
document.getElementById("openDownloadsBtn").addEventListener("click", () => {
  const baseUrl = normalizeUrl(state.portalUrl || portalUrlInput.value);
  window.desktopApi.openExternally(`${baseUrl}/downloads/`);
});

docsBody.addEventListener("change", (event) => {
  const target = event.target;
  if (!target || target.tagName !== "INPUT" || target.type !== "checkbox") return;

  const id = Number(target.getAttribute("data-id"));
  if (!id) return;

  if (target.checked) {
    state.selected.add(id);
  } else {
    state.selected.delete(id);
  }
});
