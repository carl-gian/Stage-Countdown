const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel, callback) => {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

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

  // Start: creates the stage window on the saved display if it is not open.
  openStageWindow: () => ipcRenderer.invoke('open-stage-window'),

  // M3 hide/show. All return { ok, hidden, error? }; "hidden" is what we BELIEVE
  // M3's state is (its hotkey is a toggle and cannot be read back).
  triggerShortcut: () => ipcRenderer.invoke('trigger-shortcut'), // hide M3 (no-op if already hidden)
  selectAndSignalM3: () => ipcRenderer.invoke('select-and-signal-m3'), // restore M3 (no-op if shown)
  toggleM3: () => ipcRenderer.invoke('toggle-m3'),
  getM3State: () => ipcRenderer.invoke('get-m3-state'),
  setM3State: (hidden) => ipcRenderer.invoke('set-m3-state', hidden),

  // App info, auto-update, help, dock. (Events return their unsubscribe function.)
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  ackVersion: () => ipcRenderer.invoke('ack-version'),
  updateGetStatus: () => ipcRenderer.invoke('update-get-status'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  pushDockState: (state) => ipcRenderer.send('dock-state', state),
  onUpdateStatus: (cb) => subscribe('update-status', cb),
  onDockCommand: (cb) => subscribe('dock-command', cb),
  onOpenHelp: (cb) => subscribe('open-help', cb),
  onAppSettingsChanged: (cb) => subscribe('app-settings-changed', cb),

  // Optional OBS scene switching (all OBS access lives in electron/obs.cjs).
  obsGetStatus: () => ipcRenderer.invoke('obs-get-status'),
  obsSaveSettings: (settings) => ipcRenderer.invoke('obs-save-settings', settings),
  obsRefresh: () => ipcRenderer.invoke('obs-refresh'),
  obsSwitch: (kind, fadeMs) => ipcRenderer.invoke('obs-switch', kind, fadeMs),
  onObsStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('obs-status', handler);
    return () => ipcRenderer.removeListener('obs-status', handler);
  },

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
