const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const { DEFAULT_CONFIG, deepMerge, shortcutToKeys, scheduleDueKey } = require('./logic.cjs');

// --- CONFIG (Documents/Stage Countdown Settings/config.txt, JSON) ---
let configCache = null;

function configPath() {
  return path.join(app.getPath('documents'), 'Stage Countdown Settings', 'config.txt');
}

function loadConfig() {
  if (configCache) return configCache;
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    // Missing or unreadable: fall back to defaults.
  }
  configCache = deepMerge(DEFAULT_CONFIG, saved);
  return configCache;
}

function saveConfig(patch) {
  configCache = deepMerge(loadConfig(), patch);
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(configCache, null, 2));
  } catch (err) {
    console.error('Could not save config', err);
  }
  return configCache;
}

function applyLoginItem() {
  const { autoLaunch } = loadConfig();
  app.setLoginItemSettings({ openAtLogin: !!autoLaunch, args: autoLaunch ? ['--hidden'] : [] });
}

// --- SCHEDULER: fires 'scheduled-start' at time1 / time2 ---
let lastFiredKey = null;
function startScheduler() {
  setInterval(() => {
    const { schedule } = loadConfig();
    if (!controllerWindow || controllerWindow.isDestroyed()) return;
    const key = scheduleDueKey(schedule, new Date());
    if (!key || key === lastFiredKey) return;
    lastFiredKey = key;
    controllerWindow.webContents.send('scheduled-start', { durationMinutes: schedule.durationMinutes ?? 5 });
  }, 5000);
}

let controllerWindow = null;
let stageWindow = null;
let lastDisplayId = null; // Remembers the selected screen for Reassert

// --- PERFORMANCE & HIGH FPS SWITCHES ---
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

function getWindowUrl(route = '') {
  const isDev = !app.isPackaged;
  if (isDev) {
    return `http://localhost:5173${route ? `?view=${route}` : ''}`;
  }
  return `file://${path.join(__dirname, '..', 'dist', 'index.html')}${route ? `?view=${route}` : ''}`;
}

// Helper to run PowerShell cleanly via stdin
function runPowerShell(script) {
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-']);
    child.stdin.write(script);
    child.stdin.end();
    child.on('close', () => resolve());
  });
}

// 1. SELECT M3 WINDOW (Instant)
function selectM3Window() {
  const psCommand = `
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
      [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
      [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
      public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
      [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
      [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    }
"@;
    [Win32]::EnumWindows({
      param($hwnd, $lparam)
      if ([Win32]::IsWindowVisible($hwnd)) {
        $sb = New-Object System.Text.StringBuilder 256
        $null = [Win32]::GetWindowText($hwnd, $sb, $sb.Capacity)
        $title = $sb.ToString()
        if ($title -like "*Meeting media - M*") {
          [Win32]::ShowWindow($hwnd, 9) # 9 = SW_RESTORE (forces window open if minimized)
          [Win32]::SetForegroundWindow($hwnd)
        }
      }
      return $true
    }, [IntPtr]::Zero)
  `;
  return runPowerShell(psCommand);
}

// 2. TRIGGER SHORTCUT (Instant)
function triggerShortcut(shortcut) {
  const { vkCode, hasAlt, hasShift, hasCtrl } = shortcutToKeys(shortcut || loadConfig().hideShortcut);

  const psCommand = `
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
      [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    }
"@;
    ${hasShift ? '[Win32]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero)' : ''}
    ${hasAlt ? '[Win32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)' : ''}
    ${hasCtrl ? '[Win32]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)' : ''}
    [Win32]::keybd_event(${vkCode}, 0, 0, [UIntPtr]::Zero)
    
    Start-Sleep -Milliseconds 50
    
    [Win32]::keybd_event(${vkCode}, 0, 2, [UIntPtr]::Zero)
    ${hasCtrl ? '[Win32]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)' : ''}
    ${hasAlt ? '[Win32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)' : ''}
    ${hasShift ? '[Win32]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero)' : ''}
  `;
  return runPowerShell(psCommand);
}

function createWindow() {
  controllerWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 380,
    minHeight: 480,
    resizable: true,
    alwaysOnTop: true,
    frame: true,
    title: 'StageCountdown - Controller',
    backgroundColor: '#0a0a0f',
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controllerWindow.once('ready-to-show', () => controllerWindow.show());
  controllerWindow.loadURL(getWindowUrl());

  controllerWindow.on('closed', () => {
    controllerWindow = null;
    if (stageWindow) stageWindow.close();
  });
}

function launchStageWindow(displayId) {
  const displays = screen.getAllDisplays();
  const target = displays.find((d) => String(d.id) === String(displayId));
  if (!target) return;

  lastDisplayId = displayId; // Store for reassert sequence
  const { x, y, width, height } = target.bounds;

  if (!stageWindow) {
    stageWindow = new BrowserWindow({
      x, y, width, height,
      frame: false,
      fullscreen: true,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      title: 'StageCountdown - Display',
      backgroundColor: undefined,
      icon: path.join(__dirname, '..', 'build', 'icon.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    stageWindow.loadURL(getWindowUrl('stage'));

    stageWindow.on('closed', () => {
      stageWindow = null;
    });
  } else {
    stageWindow.setBounds({ x, y, width, height });
    stageWindow.setFullscreen(true);
  }
}

app.whenReady().then(() => {
  applyLoginItem();
  createWindow();
  if (loadConfig().startMinimized || process.argv.includes('--hidden')) {
    controllerWindow.once('ready-to-show', () => controllerWindow.minimize());
  }
  startScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS ---
ipcMain.handle('set-always-on-top', (_event, pinned) => {
  if (controllerWindow) {
    controllerWindow.setAlwaysOnTop(pinned);
    return pinned;
  }
  return false;
});

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    index: i,
    label: `Display ${i + 1}`,
    bounds: d.bounds,
    primary: d.id === screen.getPrimaryDisplay().id,
  }));
});

ipcMain.handle('move-to-display', (_event, displayId) => {
  saveConfig({ lastDisplayId: displayId });
  launchStageWindow(displayId);
  return true;
});

ipcMain.handle('reassert-stage-window', () => {
  if (lastDisplayId) launchStageWindow(lastDisplayId);
  return true;
});

ipcMain.handle('select-m3-window', async () => {
  await selectM3Window();
  return true;
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Steps 1 + 2: focus M3, then send the hide/show shortcut. Resolves only
// once both are done (500ms hold after each).
async function selectAndSignalM3(shortcut) {
  await selectM3Window();
  await delay(500);
  await triggerShortcut(shortcut);
  await delay(500);
}

ipcMain.handle('trigger-shortcut', async (_event, shortcut) => {
  await selectAndSignalM3(shortcut);
  return true;
});

ipcMain.handle('select-and-signal-m3', async () => {
  await selectAndSignalM3();
  return true;
});

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('set-config', (_event, patch) => {
  const next = saveConfig(patch);
  if (patch && 'autoLaunch' in patch) applyLoginItem();
  return next;
});

ipcMain.handle('close-stage-window', () => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.close();
    stageWindow = null;
  }
  return true;
});

ipcMain.handle('close-app', () => {
  app.quit();
});

ipcMain.on('sync-state-to-stage', (_event, data) => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.webContents.send('update-stage-state', data);
  }
});