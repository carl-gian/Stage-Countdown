const { contextBridge, ipcRenderer } = require('electron');

const api = {
  setAlwaysOnTop: (pinned) => ipcRenderer.invoke('set-always-on-top', pinned),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  moveToDisplay: (displayId) => ipcRenderer.invoke('move-to-display', displayId),
  syncStateToStage: (stateData) => ipcRenderer.send('sync-state-to-stage', stateData),

  onUpdateStageState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-stage-state', handler);
    return () => ipcRenderer.removeListener('update-stage-state', handler);
  },

  triggerShortcut: () => ipcRenderer.invoke('trigger-shortcut'),

  // Steps 1+2 only, without touching the stage window — used by the
  // end/stop sequences after the stage window has already been closed.
  selectAndSignalM3: () => ipcRenderer.invoke('select-and-signal-m3'),

  // Closes the stage window on the secondary display outright (step 5).
  closeStageWindow: () => ipcRenderer.invoke('close-stage-window'),

  // NEW: Tell Electron to close the app entirely
  closeApp: () => ipcRenderer.invoke('close-app'),

  // Everything from the Settings modal — display choice, start-minimized/
  // autolaunch, the schedule, the M3 hide/show shortcut, and the timer's
  // visual theme — now lives in one consolidated config file (Documents/
  // Stage Countdown Settings/config.txt) read and written through these.
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),

  // Kept as separate names for ScheduleSettings.tsx, which already owns its
  // own get/set round-trip under these — same config file underneath, this
  // is just the same calls under the names it was already written against.
  getAppSettings: () => ipcRenderer.invoke('get-config'),
  setAppSettings: (settings) => ipcRenderer.invoke('set-config', settings),

  // App.tsx already listens for this (it routes the scheduled auto-timer
  // through the same start sequence as the manual Start button) but it was
  // never actually exposed here, so the schedule feature had no way to ever
  // fire — this is what wires main.cjs's 'scheduled-start' send through to
  // it.
  onScheduledStart: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('scheduled-start', handler);
    return () => ipcRenderer.removeListener('scheduled-start', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('electron', api);
