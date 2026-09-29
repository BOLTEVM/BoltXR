const { contextBridge } = require('electron');

// Runs in a sandboxed preload: expose only minimal, read-only information.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
});
