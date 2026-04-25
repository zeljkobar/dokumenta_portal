const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  selectSyncFolder: () => ipcRenderer.invoke("select-sync-folder"),
  saveDocument: (payload) => ipcRenderer.invoke("save-document", payload),
  openExternally: (url) => ipcRenderer.invoke("open-externally", url),
});
