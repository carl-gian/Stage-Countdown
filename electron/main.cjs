const { app, BrowserWindow, ipcMain, screen, safeStorage, Tray, Menu, nativeImage, Notification, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const { DEFAULT_CONFIG, deepMerge, shortcutToKeys, scheduleDueKey, sealSecret, openSecret, launchKind } = require('./logic.cjs');
const { createObs } = require('./obs.cjs');
const { createDock } = require('./dock.cjs');
const { createUpdater } = require('./updater.cjs');
const { createM3 } = require('./m3.cjs');

app.setAppUserModelId('com.stagecountdown.app'); // Windows notifications + taskbar identity

// One copy only: starting it again just shows the running window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// --- LOG FILE (userData/logs/stagecountdown.log, rotated at 1 MB) ---
const logDir = () => path.join(app.getPath('userData'), 'logs');
function writeLog(level, args) {
  const line = `${new Date().toISOString()} ${level} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try {
    const file = path.join(logDir(), 'stagecountdown.log');
    fs.mkdirSync(logDir(), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, `${file}.old`);
    fs.appendFileSync(file, line);
  } catch {
    // logging must never break the app
  }
}
const log = { info: (...a) => writeLog('INFO', a), error: (...a) => writeLog('ERROR', a) };


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
    log.error('Could not save config', err);
  }
  return configCache;
}

function applyLoginItem() {
  const { autoLaunch } = loadConfig();
  app.setLoginItemSettings({ openAtLogin: !!autoLaunch, args: autoLaunch ? ['--hidden'] : [] });
}

// --- OBS (optional scene switching; see electron/obs.cjs) ---------------------
const secretBox = () => (safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null);

const obs = createObs({
  log: (...a) => log.info(...a),
  onStatus: () => pushObsStatus(),
});

function applyObsConfig(force = false) {
  const cfg = loadConfig();
  obs.configure({ ...cfg.obs, password: openSecret(cfg.obsPasswordEnc, secretBox()) }, { force });
}

const sendToController = (channel, payload) => {
  if (controllerWindow && !controllerWindow.isDestroyed()) controllerWindow.webContents.send(channel, payload);
};

// --- OBS DOCK (only while OBS scene switching is on) ---
let lastDockState = null; // pushed by the controller window whenever something changes

const dock = createDock({
  log: (m) => log.info(m),
  getState: () => ({
    ...(lastDockState || { timerState: 'idle', minutes: 5, seconds: 0, remainingMs: 0, endsAt: 0, phase: null, m3: { enabled: false } }),
    obs: obs.status(),
    update: updater.info(),
  }),
  sendCommand: (cmd) => {
    if (!controllerWindow || controllerWindow.isDestroyed()) return false;
    controllerWindow.webContents.send('dock-command', cmd);
    return true;
  },
  openWindow: () => showWindow(),
});

const obsStatusFull = () => ({ ...obs.status(), dock: dock.status() });
function pushObsStatus() {
  sendToController('obs-status', obsStatusFull());
}

/** Starts or stops the dock server to match the OBS setting. */
async function syncDock() {
  if (loadConfig().obs.enabled) await dock.start();
  else dock.stop();
  pushObsStatus();
}

// --- AUTO-UPDATE ---
const updater = createUpdater({
  log,
  onChange: () => {
    updateTray();
    sendToController('update-status', updater.info());
  },
  // A Windows notification when an update is ready; clicking it opens the "restart and update" question.
  onReady: (v) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: 'Update ready',
      body: `Stage Countdown ${v} is ready to install. Click here to restart and update.`,
      icon: iconPath(),
    });
    n.on('click', () => {
      showWindow();
      void updater.promptInstall();
    });
    n.show();
  },
});

// --- WINDOW VISIBILITY / TRAY ---
let tray = null;
let quitting = false;

const iconPath = () => (app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '..', 'build', 'icon.ico'));

function showWindow() {
  if (!controllerWindow || controllerWindow.isDestroyed()) return;
  if (controllerWindow.isMinimized()) controllerWindow.restore();
  controllerWindow.show();
  controllerWindow.focus();
}

async function confirmQuit() {
  const r = await dialog.showMessageBox({
    type: 'warning',
    title: 'Quit Stage Countdown?',
    message: 'Quit Stage Countdown?',
    detail: 'Scheduled countdowns, OBS scene switching and the OBS dock stop until you start the app again. Closing the window (X) keeps it running in the tray.',
    buttons: ['Keep running', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (r.response === 1) app.quit();
}

function createTray() {
  let img = nativeImage.createFromPath(iconPath());
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.on('click', () => (controllerWindow?.isVisible() ? controllerWindow.hide() : showWindow()));
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const u = updater.info();
  const obsState = obs.status();
  const obsLine = !obsState.enabled ? null : obsState.state === 'connected' ? 'OBS: connected' : 'OBS: not detected';
  tray.setToolTip(`Stage Countdown ${app.getVersion()}${u.status === 'ready' ? ` - update ${u.version} ready` : ''}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Stage Countdown ${app.getVersion()}`, enabled: false },
      ...(obsLine ? [{ label: obsLine, enabled: false }] : []),
      { type: 'separator' },
      { label: 'Show window', click: showWindow },
      {
        label: 'Help',
        click: () => {
          showWindow();
          sendToController('open-help', 'start');
        },
      },
      { type: 'separator' },
      u.status === 'ready'
        ? { label: `Restart to update to ${u.version} ...`, click: () => void updater.promptInstall() }
        : {
            label: u.status === 'downloading' ? `Downloading update ${u.version} (${u.percent}%) ...` : 'Check for updates',
            enabled: u.status !== 'downloading',
            click: () => updater.check(true),
          },
      { type: 'separator' },
      { label: 'Open logs folder', click: () => void shell.openPath(logDir()) },
      { type: 'separator' },
      { label: 'Quit ...', click: () => void confirmQuit() },
    ])
  );
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
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);

  // The hardware scan code for a virtual key, so injected keys look like a real keyboard.
  public static byte Scan(uint vk) { return (byte)MapVirtualKey(vk, 0); }

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

# Window STATE lives in its own block: if it ever failed to compile, focus and keystrokes would still work and
# the app would fall back to its remembered-toggle behaviour instead of losing M3 control completely.
$hasState = $true
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class W2 {
  delegate bool EP2(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP2 cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h, out uint key, out byte alpha, out uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);

  // Every window whose title contains "part", described, for diagnostics.
  public static string List(string part) {
    StringBuilder all = new StringBuilder();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      StringBuilder sb = new StringBuilder(256);
      GetWindowText(h, sb, 256);
      if (sb.ToString().IndexOf(part, StringComparison.OrdinalIgnoreCase) < 0) return true;
      all.Append("[" + sb.ToString() + " visible=" + IsWindowVisible(h) + " minimized=" + IsIconic(h) + "] ");
      return true;
    }, IntPtr.Zero);
    return all.Length == 0 ? "(none)" : all.ToString();
  }

  // Hides (show=false) or shows (show=true) every window whose title contains "part". Returns how many it changed.
  // Used only when M3 ignores its own shortcut.
  public static int SetVisible(string part, bool show) {
    int changed = 0;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      StringBuilder sb = new StringBuilder(256);
      GetWindowText(h, sb, 256);
      if (sb.ToString().IndexOf(part, StringComparison.OrdinalIgnoreCase) < 0) return true;
      if (show) {
        if (!IsWindowVisible(h)) { ShowWindow(h, 8); changed++; }
        else if (IsIconic(h)) { ShowWindow(h, 9); changed++; }
      } else if (IsWindowVisible(h)) { ShowWindow(h, 0); changed++; }
      return true;
    }, IntPtr.Zero);
    return changed;
  }

  // The REAL state of a window whose title contains "part": shown | hidden | none (no such window).
  // Hidden windows are included in the search (Electron hide() keeps the window). A window that is
  // visible but faded to almost no opacity (M3 fades out before hiding) counts as hidden.
  public static string State(string part) {
    bool any = false;
    bool shown = false;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      StringBuilder sb = new StringBuilder(256);
      GetWindowText(h, sb, 256);
      if (sb.ToString().IndexOf(part, StringComparison.OrdinalIgnoreCase) < 0) return true;
      any = true;
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      if ((GetWindowLong(h, -20) & 0x80000) != 0) {
        uint key; byte alpha; uint flags;
        if (GetLayeredWindowAttributes(h, out key, out alpha, out flags) && (flags & 2) != 0 && alpha < 8) return true;
      }
      shown = true;
      return false;
    }, IntPtr.Zero);
    return !any ? "none" : shown ? "shown" : "hidden";
  }
}
"@
} catch { $hasState = $false }

function Send-Key($vk, $alt, $shift, $ctrl) {
  $mods = @()
  if ($shift) { $mods += 0x10 }
  if ($alt)   { $mods += 0x12 }
  if ($ctrl)  { $mods += 0x11 }
  foreach ($m in $mods) { [W]::keybd_event([byte]$m, [W]::Scan($m), 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
  [W]::keybd_event([byte]$vk, [W]::Scan($vk), 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [W]::keybd_event([byte]$vk, [W]::Scan($vk), 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
  [array]::Reverse($mods)
  foreach ($m in $mods) { [W]::keybd_event([byte]$m, [W]::Scan($m), 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 20 }
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
      'state' { if ($hasState) { $r = [W2]::State($p[2]) } else { $r = 'FAIL nostate' } }
      'windows' { if ($hasState) { $r = [W2]::List($p[2]) } else { $r = 'FAIL nostate' } }
      'hide' { if ($hasState) { $r = 'OK ' + [W2]::SetVisible($p[2], $false) } else { $r = 'FAIL nostate' } }
      'show' { if ($hasState) { $r = 'OK ' + [W2]::SetVisible($p[2], $true) } else { $r = 'FAIL nostate' } }
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
    child.stderr.on('data', (d) => log.error('[ps]', String(d)));
    const gone = () => {
      if (psChild === child) psChild = null;
      resolveReady();
      for (const cb of psPending.values()) cb('FAIL worker-exited');
      psPending.clear();
    };
    child.on('exit', gone);
    child.on('error', gone);
  } catch (err) {
    log.error('Could not start PowerShell worker', err);
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

// --- M3 HIDE/SHOW (see electron/m3.cjs) -------------------------------------
// Reads the REAL state of M3's media window ("Media Player - M3") instead of trusting a remembered toggle, verifies
// every shortcut, and while a countdown runs a guard hides it again if it comes back on top of the timer.
const m3 = createM3({
  ps: (command, timeoutMs) => psSend(command, timeoutMs),
  getConfig: loadConfig,
  log: (...a) => log.info(...a),
  onStatus: (status) => sendToController('m3-status', status),
});

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

function createWindow(startHidden = false) {
  controllerWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 380,
    minHeight: 600, // the controller stacks several status rows; below this the ring and inputs get cramped
    resizable: true,
    alwaysOnTop: true,
    frame: true,
    show: false,
    title: 'StageCountdown - Controller',
    backgroundColor: '#0a0a0f',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  controllerWindow.setMenu(null);

  controllerWindow.once('ready-to-show', () => {
    if (!startHidden) controllerWindow.show();
  });
  controllerWindow.loadURL(getWindowUrl());

  // Never leave M3's media hidden: if we hid it, bring it back before closing.
  controllerWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      controllerWindow.hide();
      return;
    }
    if (closingRestore) return;
    // Also put OBS back on the camera scene if we left it on the media scene.
    const obsBack = obs.restoreIfNeeded();
    m3.stopGuard();
    if (m3.needsRestore() || obs.status().state === 'connected') {
      event.preventDefault();
      closingRestore = true;
      Promise.all([m3.needsRestore() ? m3.show() : null, obsBack]).finally(() => {
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
      icon: iconPath(),
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

app.on('second-instance', () => showWindow());

app.whenReady().then(() => {
  if (!gotLock) return;
  const version = app.getVersion();
  log.info(`BUILD ${version} (electron ${process.versions.electron}, ${process.platform} ${process.arch}, ${app.isPackaged ? 'installed' : 'dev'})`);
  applyLoginItem();

  // First run / first run after an update: show the window (even if "start hidden" is on) so Help / What's new can open.
  const cfg = loadConfig();
  const launch = launchKind(cfg.lastSeenVersion, version);
  const wantsHidden = cfg.startMinimized || process.argv.includes('--hidden');
  log.info(`Launch: ${launch}${wantsHidden ? ' (start hidden in tray)' : ''}`);
  createWindow(wantsHidden && launch === 'normal');
  createTray();
  if (launch === 'normal' && cfg.lastSeenVersion !== version) saveConfig({ lastSeenVersion: version });

  startScheduler();
  applyObsConfig();
  syncDock();
  updater.start();
  if (process.platform === 'win32') {
    ensurePs(); // compile the helper now, not on the first Start
    m3.startPolling(); // keeps the "M3 media" row truthful, even if M3 is changed by hand
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => {
  m3.dispose();
  obs.dispose();
  dock.stop();
  updater.stop();
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

// trigger-shortcut = hide M3's media display (start); select-and-signal-m3 = bring it back (end/stop).
ipcMain.handle('trigger-shortcut', () => m3.hide());
ipcMain.handle('select-and-signal-m3', () => m3.show());
ipcMain.handle('toggle-m3', () => m3.toggle());
// Settings > M3 > Test: sends the shortcut once and reports whether M3's media display really reacted.
ipcMain.handle('m3-test', () => m3.test());
ipcMain.handle('get-m3-state', () => m3.refresh());
// While a countdown runs: keep M3's media display hidden (re-sends the shortcut if it comes back on top).
ipcMain.handle('m3-guard', (_event, on) => {
  if (on) m3.startGuard();
  else m3.stopGuard();
  return true;
});

ipcMain.handle('get-config', () => publicConfig());

ipcMain.handle('set-config', (_event, patch) => {
  const { obsPasswordEnc: _ignored, obs: _obs, ...safe } = patch || {};
  const next = saveConfig(safe);
  if (patch && 'autoLaunch' in patch) applyLoginItem();
  if (patch && 'm3' in patch) m3.refresh().catch(() => {});
  return publicConfig();
});

// --- APP INFO / UPDATES / DOCK ---
ipcMain.handle('get-app-info', () => {
  const cfg = loadConfig();
  return {
    version: app.getVersion(),
    launch: launchKind(cfg.lastSeenVersion, app.getVersion()),
    lastSeenVersion: cfg.lastSeenVersion,
    isPackaged: app.isPackaged,
    platform: process.platform,
    update: updater.info(),
  };
});
ipcMain.handle('ack-version', () => {
  saveConfig({ lastSeenVersion: app.getVersion() });
  return true;
});
ipcMain.handle('update-get-status', () => updater.info());
ipcMain.handle('update-check', () => {
  updater.check(true);
  return updater.info();
});
ipcMain.handle('update-install', () => updater.promptInstall());
ipcMain.handle('open-logs', () => shell.openPath(logDir()));
ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url);
});
ipcMain.on('dock-state', (_event, state) => {
  lastDockState = state;
});

// --- OBS IPC ---
ipcMain.handle('obs-get-status', () => obsStatusFull());

// settings: { enabled, port, password? (omit to keep the saved one, '' to clear), mediaScene, cameraScene }
ipcMain.handle('obs-save-settings', async (_event, settings) => {
  const port = Number(settings?.port);
  const wasEnabled = !!loadConfig().obs.enabled;
  const patch = {
    obs: {
      enabled: !!settings?.enabled,
      port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 4455,
      mediaScene: String(settings?.mediaScene ?? ''),
      cameraScene: String(settings?.cameraScene ?? ''),
      returnMode: settings?.returnMode === 'previous' ? 'previous' : 'camera',
    },
  };
  if (typeof settings?.password === 'string') patch.obsPasswordEnc = sealSecret(settings.password, secretBox());
  // Turning OBS switching ON also makes the app start with Windows, hidden in the tray, so the dock and
  // scene switching are ready without anyone opening it. (Can be turned off again in Settings afterwards.)
  const turnedOn = !wasEnabled && patch.obs.enabled;
  if (turnedOn) {
    patch.autoLaunch = true;
    patch.startMinimized = true;
  }
  saveConfig(patch);
  if (turnedOn) {
    applyLoginItem();
    sendToController('app-settings-changed', { autoLaunch: true, startMinimized: true });
  }
  applyObsConfig();
  await syncDock();
  return obsStatusFull();
});

ipcMain.handle('obs-refresh', () => {
  applyObsConfig(true);
  return obsStatusFull();
});

ipcMain.handle('obs-switch', (_event, kind, fadeMs) =>
  obs.switchTo(kind === 'media' ? 'media' : 'return', Math.max(0, Math.min(10_000, Number(fadeMs) || 0)))
);

ipcMain.handle('close-stage-window', () => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.close();
    stageWindow = null;
  }
  return true;
});

ipcMain.handle('close-app', () => {
  // Never quit by this route while connected to OBS (scene switching and the dock need the app running; the UI blocks
  // the option too, this is the safety net).
  const o = obs.status();
  if (o.enabled && o.state === 'connected') {
    log.info('close-app ignored: connected to OBS');
    return false;
  }
  quitting = true;
  app.quit();
  return true;
});

ipcMain.on('sync-state-to-stage', (_event, data) => {
  lastStageState = data;
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.webContents.send('update-stage-state', data);
  }
});
