const { contextBridge, ipcRenderer } = require('electron');

const api = {
  setAlwaysOnTop: (pinned) => ipcRenderer.invoke('set-always-on-top', pinned),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  moveToDisplay: (displayId) => ipcRenderer.invoke('move-to-display', displayId),
  
  // Sequence Triggers
  selectM3Window: () => ipcRenderer.invoke('select-m3-window'),
  triggerShortcut: (shortcut) => ipcRenderer.invoke('trigger-shortcut', shortcut),
  reassertStageWindow: () => ipcRenderer.invoke('reassert-stage-window'),
  closeStageWindow: () => ipcRenderer.invoke('close-stage-window'),
  closeApp: () => ipcRenderer.invoke('close-app'),

  // Sync Pipelines
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  syncStateToStage: (stateData) => ipcRenderer.send('sync-state-to-stage', stateData),
  onUpdateStageState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-stage-state', handler);
    return () => ipcRenderer.removeListener('update-stage-state', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('electron', api);