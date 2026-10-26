// Auto-update from GitHub Releases (electron-updater), modelled on the EMEET-OBS Bridge.
// Safety rule for live meetings: an update is DOWNLOADED in the background but never installed on its own.
// The operator installs it from the blue "Update ready" badge / tray menu, or it installs when the app quits.
// Disabled in dev runs and in the portable build (portable cannot update itself).
const { app, dialog } = require('electron');

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 8 * 1000;

function createUpdater({ log, onChange = () => {}, onReady = () => {} }) {
  const reason = !app.isPackaged ? 'dev' : process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : '';
  let status = reason ? 'disabled' : 'idle';
  let version = '';
  let percent = 0;
  let manual = false;
  let timer = null;
  let autoUpdater = null;

  const set = (s) => {
    status = s;
    onChange();
  };
  const info = () => ({ status, version, percent, reason });

  function start() {
    if (reason) {
      log.info(`Auto-update disabled (${reason === 'portable' ? 'portable build' : 'development run'}).`);
      // STAGE_DEMO_UPDATE=1 (screenshots/dev only): pretend an update is ready so the badge can be seen.
      if (process.env.STAGE_DEMO_UPDATE) {
        version = '9.9.9';
        percent = 100;
        status = 'ready';
      }
      return;
    }
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (m) => log.info(`UPDATE ${m}`),
      warn: (m) => log.info(`UPDATE ${m}`),
      error: (m) => log.error(`UPDATE ${m}`),
      debug: () => {},
    };
    autoUpdater.on('checking-for-update', () => set('checking'));
    autoUpdater.on('update-available', (i) => {
      version = i.version;
      percent = 0;
      set('downloading');
      if (manual) {
        manual = false;
        void dialog.showMessageBox({ type: 'info', message: `Version ${i.version} is available.`, detail: 'It is downloading in the background. You will be told when it is ready to install.', buttons: ['OK'] });
      }
    });
    autoUpdater.on('download-progress', (p) => {
      const pct = Math.round(p.percent);
      if (pct !== percent) {
        percent = pct;
        onChange();
      }
    });
    autoUpdater.on('update-not-available', () => {
      set('up-to-date');
      if (manual) void dialog.showMessageBox({ type: 'info', message: `You are on the latest version (${app.getVersion()}).`, buttons: ['OK'] });
      manual = false;
    });
    autoUpdater.on('update-downloaded', (i) => {
      version = i.version;
      percent = 100;
      log.info(`Update ${i.version} downloaded; waiting for the operator (badge / tray) or the next quit.`);
      set('ready');
      onReady(i.version);
    });
    autoUpdater.on('error', (e) => {
      log.error(`Update check failed: ${e?.message ?? e}`);
      set('error');
      if (manual) void dialog.showMessageBox({ type: 'error', message: 'Could not check for updates.', detail: String(e?.message ?? e), buttons: ['OK'] });
      manual = false;
    });
    setTimeout(() => check(), FIRST_CHECK_DELAY_MS); // checked at every start...
    timer = setInterval(() => check(), CHECK_EVERY_MS); // ...and every 6 hours while it stays open in the tray
  }

  function check(isManual = false) {
    if (reason) {
      if (isManual) {
        void dialog.showMessageBox({
          type: 'info',
          message: reason === 'portable' ? 'The portable version cannot update itself.' : 'Updates are only checked in the installed app.',
          detail: reason === 'portable' ? 'Download the newest version from the GitHub Releases page, or use the installer version for automatic updates.' : '',
          buttons: ['OK'],
        });
      }
      return;
    }
    if (status === 'downloading' || status === 'ready') {
      if (isManual && status === 'ready') void promptInstall();
      return;
    }
    manual = isManual;
    autoUpdater.checkForUpdates().catch(() => {
      /* reported through the 'error' event */
    });
  }

  /** Ask first: installing closes the app, which pauses scheduled timers and the OBS dock while it restarts. */
  async function promptInstall() {
    if (status !== 'ready' || !autoUpdater) return;
    const r = await dialog.showMessageBox({
      type: 'question',
      title: 'Update ready',
      message: `Version ${version} is ready to install.`,
      detail: 'Stage Countdown will close and restart. Do not do this during a live countdown or meeting.',
      buttons: ['Later', 'Restart and update'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (r.response === 1) {
      log.info('Operator chose to install the update now.');
      autoUpdater.quitAndInstall(false, true);
    }
  }

  const stop = () => timer && clearInterval(timer);

  return { start, check, promptInstall, info, stop };
}

module.exports = { createUpdater };
