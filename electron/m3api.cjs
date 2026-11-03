// M³ (TLC Edition) media display API. No Electron imports, so it is testable with a fake server.
//
// M³ (TLC Edition) answers on http://127.0.0.1:4579/api/media-display:
//   GET  -> {state: 'shown' | 'hidden' | 'none', visible}   the media window's real state on screen
//   POST {visible: true | false} (header X-M3-Dock: 1) -> {ok}   M³ shows/hides it with its own toggle
// Unlike the keyboard shortcut this needs no window focus, sets an absolute state (not a toggle) and works while an M³
// dialog is open. The official M³ has no such API: every call then answers null/false quickly and m3.cjs uses the
// shortcut as before.
const http = require('node:http');

const API_PORT = 4579;

/**
 * @param {object} [d]
 * @param {number} [d.port]
 * @param {number} [d.timeoutMs] per request; kept short so a missing API costs almost nothing
 */
function createM3Api({ port = API_PORT, timeoutMs = 800 } = {}) {
  function call(method, body) {
    return new Promise((resolve) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path: '/api/media-display',
          timeout: timeoutMs,
          headers: {
            Host: `127.0.0.1:${port}`,
            ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-M3-Dock': '1' } : {}),
          },
        },
        (res) => {
          let raw = '';
          res.setEncoding('utf8');
          res.on('data', (c) => {
            raw += c;
          });
          res.on('end', () => {
            if (res.statusCode !== 200) return resolve(null);
            try {
              resolve(JSON.parse(raw));
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(null));
      req.end(data);
    });
  }

  /** The media display's state, or null when M³ (TLC Edition) is not answering. */
  async function state() {
    const r = await call('GET');
    return r && ['shown', 'hidden', 'none'].includes(r.state) ? r.state : null;
  }

  /** Asks M³ to show or hide its media display. True if M³ accepted (check the result with state()). */
  async function set(visible) {
    const r = await call('POST', { visible: !!visible });
    return !!(r && r.ok);
  }

  return { state, set };
}

module.exports = { createM3Api, API_PORT };
