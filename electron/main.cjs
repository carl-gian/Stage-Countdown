const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const { DEFAULT_CONFIG, deepMerge, shortcutToKeys, scheduleDueKey } = require('./logic.cjs');

let controllerWindow = null;
let stageWindow = null;
let lastStageState = null; // replayed to a freshly created stage window

// --- PERFORMANCE / BACKGROUND SWITCHES ---
// The controller owns the countdown clock, so it must keep running when it is
// minimized or covered (scheduled starts with "Start minimized").
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

// --- WINDOWS HELPER: one resident PowerShell ---------------------------------
// Spawning powershell + compiling the Win32 helper per call cost 1-2s and varied.
// A single resident process compiles it once and answers "id|command" lines.
const PS_SCRIPT = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class W {
  delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);

  static IntPtr Find(string part) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(256);
      GetWindowText(h, sb, 256);
      if (sb.ToString().IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  // Brings the window to the front and CONFIRMS it got there (Windows often refuses SetForegroundWindow).
  public static string Focus(string part) {
    IntPtr h = Find(part);
    if (h == IntPtr.Zero) return "FAIL nowindow";
    if (IsIconic(h)) ShowWindow(h, 9);
    for (int i = 0; i < 3; i++) {
      uint pid;
      uint t1 = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
      uint t2 = GetCurrentThreadId();
      bool att = (t1 != t2) && AttachThreadInput(t2, t1, true);
      SetForegroundWindow(h);
      if (att) AttachThreadInput(t2, t1, false);
      System.Threading.Thread.Sleep(100);
      if (GetForegroundWindow() == h) return "OK";
    }
    return "FAIL focus";
  }
}
"@

function Send-Key($vk, $alt, $shift, $ctrl) {
  if ($shift) { [W]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero) }
  if ($alt)   { [W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero) }
  if ($ctrl)  { [W]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) }
  [W]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  [W]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero)
  if ($ctrl)  { [W]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) }
  if ($alt)   { [W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero) }
  if ($shift) { [W]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero) }
}

[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Split('|')
  try {
    switch ($p[1]) {
      'focus' { $r = [W]::Focus($p[2]) }
      'key'   { Send-Key ([int]$p[2]) ($p[3] -eq '1') ($p[4] -eq '1') ($p[5] -eq '1'); $r = 'OK' }
      default { $r = 'FAIL unknown' }
    }
  } catch { $r = 'FAIL ' + $_.Exception.Message }
  [Console]::Out.WriteLine($p[0] + '|' + $r)
  [Console]::Out.Flush()
}
`;

let psChild = null;
let psReady = null;
let psBuffer = '';
let psSeq = 0;
const psPending = new Map();

function ensurePs() {
  if (psChild) return psReady;
  let resolveReady;
  psReady = new Promise((resolve) => {
    resolveReady = resolve;
    setTimeout(resolve, 10000); // never wait forever; commands have their own timeout
  });
  try {
    const scriptPath = path.join(app.getPath('userData'), 'stage-countdown-worker.ps1');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, PS_SCRIPT);
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
    });
    psChild = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      psBuffer += chunk;
      let nl;
      while ((nl = psBuffer.indexOf('\n')) >= 0) {
        const line = psBuffer.slice(0, nl).trim();
        psBuffer = psBuffer.slice(nl + 1);
        if (line === 'READY') resolveReady();
        else {
          const sep = line.indexOf('|');
          const cb = psPending.get(Number(line.slice(0, sep)));
          if (cb) cb(line.slice(sep + 1));
        }
      }
    });
    child.stderr.on('data', (d) => console.error('[ps]', String(d)));
    const gone = () => {
      if (psChild === child) psChild = null;
      resolveReady();
      for (const cb of psPending.values()) cb('FAIL worker-exited');
      psPending.clear();
    };
    child.on('exit', gone);
    child.on('error', gone);
  } catch (err) {
    console.error('Could not start PowerShell worker', err);
    psChild = null;
    resolveReady();
  }
  return psReady;
}

async function psSend(command, timeoutMs = 4000) {
  if (process.platform !== 'win32') return 'FAIL unsupported-platform';
  await ensurePs();
  if (!psChild) return 'FAIL worker-unavailable';
  return new Promise((resolve) => {
    const id = ++psSeq;
    const timer = setTimeout(() => {
      psPending.delete(id);
      resolve('FAIL timeout');
      try {
        psChild?.kill(); // a hung worker is replaced on the next call
      } catch {
        // already gone
      }
    }, timeoutMs);
    psPending.set(id, (result) => {
      clearTimeout(timer);
      psPending.delete(id);
      resolve(result);
    });
    psChild.stdin.write(`${id}|${command}\n`);
  });
}

// --- M3 HIDE/SHOW -----------------------------------------------------------
// M3's hotkey is a toggle and there is no way to read its state, so we track
// what we last did. Start only hides if we believe it is shown; end/stop only
// restores if we believe it is hidden, so a failed or doubled call can't invert it.
let m3Hidden = false;

const m3Result = (ok, error) => ({ ok, hidden: m3Hidden, ...(error ? { error } : {}) });

async function sendM3Hotkey() {
  const cfg = loadConfig();
  const focus = await psSend(`focus|${cfg.m3WindowTitle}`);
  if (focus !== 'OK') {
    console.error('[m3] focus failed:', focus);
    return focus === 'FAIL nowindow' ? 'Meeting Media Manager window not found - is it open?' : `Could not focus M3 (${focus})`;
  }
  await delay(200);
  const k = shortcutToKeys(cfg.hideShortcut);
  const key = await psSend(`key|${k.vkCode}|${+k.hasAlt}|${+k.hasShift}|${+k.hasCtrl}`);
  // Returns as soon as the key is sent: every wait after it lives in src/lib/sequence.ts.
  if (key !== 'OK') {
    console.error('[m3] hotkey failed:', key);
    return `Could not send the shortcut (${key})`;
  }
  return null;
}

async function setM3Hidden(target) {
  if (m3Hidden === target) return m3Result(true);
  const error = await sendM3Hotkey();
  if (error) return m3Result(false, error);
  m3Hidden = target;
  return m3Result(true);
}

// --- WINDOWS ----------------------------------------------------------------
function getWindowUrl(route = '') {
  const isDev = !app.isPackaged;
  if (isDev) {
    return `http://localhost:5173${route ? `?view=${route}` : ''}`;
  }
  return `file://${path.join(__dirname, '..', 'dist', 'index.html')}${route ? `?view=${route}` : ''}`;
}

const webPreferences = () => ({
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false,
});

let closingRestore = false;

function createWindow() {
  controllerWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 380,
    minHeight: 480,
    resizable: true,
    alwaysOnTop: true,
    frame: true,
    show: false,
    title: 'StageCountdown - Controller',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: webPreferences(),
  });

  controllerWindow.once('ready-to-show', () => controllerWindow.show());
  controllerWindow.loadURL(getWindowUrl());

  // Never leave M3's media hidden: if we hid it, bring it back before closing.
  controllerWindow.on('close', (event) => {
    if (m3Hidden && !closingRestore) {
      event.preventDefault();
      closingRestore = true;
      setM3Hidden(false).finally(() => {
        if (controllerWindow && !controllerWindow.isDestroyed()) controllerWindow.close();
      });
    }
  });

  controllerWindow.on('closed', () => {
    controllerWindow = null;
    if (stageWindow && !stageWindow.isDestroyed()) stageWindow.close();
  });
}

function pickStageDisplay() {
  const displays = screen.getAllDisplays();
  const savedId = loadConfig().lastDisplayId;
  const saved = savedId != null ? displays.find((d) => String(d.id) === String(savedId)) : null;
  if (saved) return saved;
  const controllerDisplay =
    controllerWindow && !controllerWindow.isDestroyed()
      ? screen.getDisplayMatching(controllerWindow.getBounds())
      : screen.getPrimaryDisplay();
  return displays.find((d) => d.id !== controllerDisplay.id) || controllerDisplay;
}

// Resolves once the stage page has loaded, so the first state sent to it is not lost.
let stageLoaded = null;

function launchStageWindow(target) {
  if (!target) return Promise.resolve();
  const { x, y, width, height } = target.bounds;

  if (!stageWindow || stageWindow.isDestroyed()) {
    stageWindow = new BrowserWindow({
      x, y, width, height,
      frame: false,
      fullscreen: true,
      transparent: true,
      hasShadow: false,
      // Never steals focus (M3 must keep it for the shortcut) and never appears in the taskbar.
      show: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'StageCountdown - Display',
      backgroundColor: undefined,
      icon: path.join(__dirname, '..', 'build', 'icon.ico'),
      webPreferences: webPreferences(),
    });
    // Default "floating" level: M3's media window uses the higher "screen-saver" level, so when M3
    // is shown again it appears on top of our (black) window and we close ours behind it.
    stageWindow.setAlwaysOnTop(true, 'floating');
    // Purely a display: clicks go through to whatever is underneath.
    stageWindow.setIgnoreMouseEvents(true);

    const win = stageWindow;
    stageLoaded = new Promise((resolve) => {
      win.webContents.once('did-finish-load', () => {
        if (lastStageState && !win.isDestroyed()) win.webContents.send('update-stage-state', lastStageState);
        if (!win.isDestroyed()) win.showInactive();
        resolve();
      });
      setTimeout(resolve, 5000); // never block Start on a slow load
    });
    win.loadURL(getWindowUrl('stage'));
    win.on('closed', () => {
      if (stageWindow === win) stageWindow = null;
    });
  } else {
    stageWindow.setBounds({ x, y, width, height });
    stageWindow.setFullscreen(true);
  }
  return stageLoaded || Promise.resolve();
}

app.whenReady().then(() => {
  applyLoginItem();
  createWindow();
  if (loadConfig().startMinimized || process.argv.includes('--hidden')) {
    controllerWindow.once('ready-to-show', () => controllerWindow.minimize());
  }
  startScheduler();
  if (process.platform === 'win32') ensurePs(); // compile the helper now, not on the first Start

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  try {
    psChild?.kill();
  } catch {
    // already gone
  }
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

// Saves the choice (null = automatic); moves the stage window only if one is open.
ipcMain.handle('move-to-display', (_event, displayId) => {
  saveConfig({ lastDisplayId: displayId || null });
  if (stageWindow && !stageWindow.isDestroyed()) launchStageWindow(pickStageDisplay());
  return true;
});

// Start: make sure the stage window exists on the saved display and has loaded.
ipcMain.handle('open-stage-window', async () => {
  await launchStageWindow(pickStageDisplay());
  return true;
});

// trigger-shortcut = hide M3 (start); select-and-signal-m3 = restore M3 (end/stop).
ipcMain.handle('trigger-shortcut', () => setM3Hidden(true));
ipcMain.handle('select-and-signal-m3', () => setM3Hidden(false));
ipcMain.handle('toggle-m3', () => setM3Hidden(!m3Hidden));
ipcMain.handle('get-m3-state', () => m3Result(true));
// Correct the assumed state without sending anything (M3 was changed by hand).
ipcMain.handle('set-m3-state', (_event, hidden) => {
  m3Hidden = !!hidden;
  return m3Result(true);
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
  lastStageState = data;
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.webContents.send('update-stage-state', data);
  }
});
