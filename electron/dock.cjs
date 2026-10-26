// Local web server for the OBS custom browser dock (View > Docks > Custom Browser Docks > http://127.0.0.1:4578/dock).
// Only listens on 127.0.0.1, runs inside the app (never inside OBS) and only relays commands to the main window.
// Only started while "OBS scene switching" is on.
const { createServer } = require('node:http');
const { DOCK_HTML } = require('./dock-page.cjs');

const DOCK_PORT = 4578;

const ACTIONS = new Set(['start', 'startAt', 'setTime', 'pause', 'resume', 'stop', 'restart', 'skip']);

/** Validates a dock command body. Returns the clean command or null. */
function parseCommand(body) {
  if (!body || typeof body !== 'object' || !ACTIONS.has(body.action)) return null;
  const cmd = { action: body.action };
  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  if (body.action === 'setTime' || body.action === 'start') {
    if ('minutes' in body || 'seconds' in body) {
      const minutes = int(body.minutes, 0, 99);
      const seconds = int(body.seconds, 0, 59);
      if (minutes === null || seconds === null) return null;
      cmd.minutes = minutes;
      cmd.seconds = seconds;
    } else if (body.action === 'setTime') {
      return null;
    }
  }
  if (body.action === 'startAt') {
    if (typeof body.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) return null;
    cmd.time = body.time;
  }
  return cmd;
}

function readJson(req, done) {
  let raw = '';
  let tooBig = false;
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 2048) tooBig = true;
  });
  req.on('end', () => {
    if (tooBig) return done(null);
    try {
      done(JSON.parse(raw || '{}'));
    } catch {
      done(null);
    }
  });
}

const json = (res, code, body) =>
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));

/**
 * @param {object} d
 * @param {(m: string) => void} [d.log]
 * @param {() => object} d.getState state for the page (the app adds `now`)
 * @param {(cmd: object) => boolean} d.sendCommand forwards to the main window; false if there is none
 * @param {() => void} d.openWindow
 * @param {number} [d.port] 0 picks a free port (tests)
 */
function createDock(d) {
  const log = d.log || (() => {});
  let server = null;
  let error = '';
  let boundPort = d.port ?? DOCK_PORT;

  const hostOk = (req) => {
    const host = String(req.headers.host ?? '').toLowerCase();
    return host === `127.0.0.1:${boundPort}` || host === `localhost:${boundPort}`;
  };

  function handle(req, res) {
    // Block DNS rebinding: only answer requests addressed to our own loopback name.
    if (!hostOk(req)) return void res.writeHead(403).end();
    const url = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && (url === '/dock' || url === '/')) {
      return void res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(DOCK_HTML);
    }
    if (req.method === 'GET' && url === '/api/state') {
      return void json(res, 200, { ...d.getState(), now: Date.now() });
    }
    if (req.method === 'POST' && (url === '/api/command' || url === '/api/open')) {
      // A custom header can't be sent by another website without our permission, so random pages can't press these.
      if (req.headers['x-stage-dock'] !== '1') return void res.writeHead(403).end();
      if (url === '/api/open') {
        d.openWindow();
        return void json(res, 200, { ok: true });
      }
      return void readJson(req, (body) => {
        const cmd = parseCommand(body);
        if (!cmd) return json(res, 400, { ok: false, error: 'Bad command.' });
        const ok = d.sendCommand(cmd);
        log(`[dock] ${cmd.action}${cmd.time ? ` ${cmd.time}` : ''}${'minutes' in cmd ? ` ${cmd.minutes}:${cmd.seconds}` : ''}`);
        json(res, 200, { ok, ...(ok ? {} : { error: 'The app window is not available.' }) });
      });
    }
    res.writeHead(404).end();
  }

  function start() {
    if (server) return Promise.resolve(status());
    return new Promise((resolve) => {
      const s = createServer((req, res) => {
        try {
          handle(req, res);
        } catch (e) {
          log(`[dock] request failed: ${e.message}`);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        }
      });
      s.once('error', (e) => {
        error = e.code === 'EADDRINUSE' ? `Port ${boundPort} is already in use by another program` : String(e.message);
        log(`[dock] could not start: ${error}`);
        server = null;
        resolve(status());
      });
      s.listen(boundPort, '127.0.0.1', () => {
        server = s;
        boundPort = s.address().port;
        error = '';
        log(`[dock] ready: http://127.0.0.1:${boundPort}/dock`);
        resolve(status());
      });
    });
  }

  function stop() {
    if (server) {
      server.closeAllConnections?.();
      server.close();
      log('[dock] stopped');
    }
    server = null;
    error = '';
  }

  const status = () => ({ running: !!server, port: boundPort, url: `http://127.0.0.1:${boundPort}/dock`, error });

  return { start, stop, status };
}

module.exports = { createDock, parseCommand, DOCK_PORT };
