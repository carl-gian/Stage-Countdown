// The page served at http://127.0.0.1:4578/dock: a compact control panel for OBS
// (View > Docks > Custom Browser Docks). It is a remote control for the app's own window: every
// button sends the same command the main window's button would, so it behaves identically.
// All dynamic text is set with textContent (never innerHTML).
const DOCK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stage Countdown</title>
<style>
  :root{color-scheme:dark;--bg:#12121a;--card:#1b1b27;--line:#2c2c3d;--text:#e8e8f0;--dim:#8d8da3;--ok:#00d4aa;--warn:#f59e0b;--bad:#ef4444;--accent:#3b82f6}
  *{box-sizing:border-box}
  body{margin:0;padding:10px;background:var(--bg);color:var(--text);font:13px/1.35 "Segoe UI",system-ui,sans-serif}
  .badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
  .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:600;background:#262636;color:var(--dim)}
  .badge i{width:8px;height:8px;border-radius:50%;background:currentColor}
  .badge.ok{background:rgba(0,212,170,.14);color:var(--ok)}
  .badge.warn{background:rgba(245,158,11,.15);color:var(--warn)}
  .badge.bad{background:rgba(239,68,68,.15);color:var(--bad)}
  .badge.accent{background:rgba(59,130,246,.2);color:#9cc0ff}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px}
  .cap{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--dim)}
  .clock{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
  .clock b{font:600 13px ui-monospace,Consolas,monospace}
  .time{font:700 44px/1.1 ui-monospace,Consolas,monospace;text-align:center;font-variant-numeric:tabular-nums;margin:2px 0}
  .time.run{color:var(--ok)}.time.paused{color:var(--warn)}.time.done{color:#7aa7ff}
  .phase{text-align:center;color:var(--warn);font-size:12px;min-height:1.3em}
  .row{display:flex;gap:6px;align-items:center}
  .row>*{flex:1}
  .set{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:6px}
  .set label{display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  input[type=number],input[type=time]{width:72px;padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:600 16px ui-monospace,Consolas,monospace;text-align:center}
  input[type=time]{width:auto;flex:1;font-size:14px}
  input:disabled{opacity:.45}
  button{padding:8px 6px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--text);font:600 13px inherit;cursor:pointer}
  button:hover{filter:brightness(1.2)}button:disabled{opacity:.4;cursor:default;filter:none}
  button.go{background:var(--ok);border-color:var(--ok);color:#06231d}
  button.stop{background:var(--bad);border-color:var(--bad);color:#fff}
  .sep{color:var(--dim);font-size:20px;margin-top:14px}
  #msg{color:var(--dim);text-align:center;font-size:12px;min-height:1.3em}
  [hidden]{display:none!important}
</style></head><body>
  <div class="badges">
    <span class="badge" id="tB"><i></i><span id="t">Idle</span></span>
    <span class="badge" id="mB" hidden><i></i><span id="m"></span></span>
    <span class="badge" id="oB"><i></i><span id="o">OBS</span></span>
    <span class="badge accent" id="uB" hidden><i></i><span id="u"></span></span>
  </div>

  <div class="card">
    <div class="clock"><span class="cap">Clock</span><b id="now">--:--:--</b></div>
    <div class="time" id="big">00:00</div>
    <div class="phase" id="phase"></div>
  </div>

  <div class="card" id="setCard">
    <div class="cap">Set time</div>
    <div class="set">
      <label>Minutes<input type="number" id="min" min="0" max="99" value="5"></label>
      <span class="sep">:</span>
      <label>Seconds<input type="number" id="sec" min="0" max="59" value="0"></label>
    </div>
    <div class="row" style="margin-top:10px">
      <input type="time" id="at" title="Count down to this clock time">
      <button id="startAt" title="Count down so that it ends exactly at this clock time">Start at time</button>
    </div>
  </div>

  <div class="row" id="btns" style="margin-bottom:6px">
    <button class="go" id="start">Start</button>
    <button id="pause" hidden>Pause</button>
    <button id="resume" class="go" hidden>Resume</button>
    <button id="restart" hidden>Restart</button>
    <button class="stop" id="stop" hidden>Stop</button>
  </div>
  <div class="row" style="margin-bottom:6px"><button id="skip" hidden>Back to M³ now</button><button id="open">Open app</button></div>
  <div id="msg"></div>
<script>
  const $ = (id) => document.getElementById(id)
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'X-Stage-Dock': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
  let msgTimer
  const say = (t) => { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => ($('msg').textContent = ''), 3500) }
  const badge = (id, cls, text) => { $(id + 'B').className = 'badge ' + cls; $(id).textContent = text }
  const pad = (n) => String(n).padStart(2, '0')
  const mmss = (ms) => { const s = Math.ceil(Math.max(0, ms) / 1000); return pad(Math.floor(s / 60)) + ':' + pad(s % 60) }
  let S = null, skew = 0, editing = 0

  const cmd = (action, extra) => post('/api/command', Object.assign({ action }, extra || {})).then((r) => { if (!r.ok) say(r.error || 'Not possible right now.'); poll() }).catch(() => say('Could not reach the app.'))

  function clockText(d) {
    const h24 = !S || S.clock24h !== false
    if (h24) return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    return pad(d.getHours() % 12 || 12) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + (d.getHours() >= 12 ? ' PM' : ' AM')
  }

  function paint() {
    $('now').textContent = clockText(new Date())
    if (!S) return
    const left = S.timerState === 'running' && S.endsAt ? S.endsAt - (Date.now() + skew) : S.timerState === 'idle' ? (S.minutes * 60 + S.seconds) * 1000 : S.remainingMs
    $('big').textContent = mmss(left)
    $('big').className = 'time' + (S.timerState === 'running' ? ' run' : S.timerState === 'paused' ? ' paused' : S.timerState === 'complete' ? ' done' : '')
    const p = S.phase
    let text = ''
    if (p) {
      const secs = p.until ? Math.max(0, Math.ceil((p.until - (Date.now() + skew)) / 1000)) : null
      text = p.kind === 'starting' ? (secs !== null ? 'Starting · counting begins in ' + secs + 's' : 'Starting…')
        : p.kind === 'ending' ? (secs !== null ? 'Holding 00:00 · back to M³ in ' + secs + 's' : 'Holding 00:00…')
        : p.kind === 'stopping' ? 'Stopping…' : 'Bringing M³ back…'
    } else if (S.quitAt) text = 'Closing the app in ' + Math.max(0, Math.ceil((S.quitAt - (Date.now() + skew)) / 1000)) + 's'
    $('phase').textContent = text
  }

  function render() {
    const st = S.timerState
    badge('t', st === 'running' ? 'ok' : st === 'paused' ? 'warn' : st === 'complete' ? 'accent' : '', S.phase ? 'Working…' : st === 'running' ? 'Running' : st === 'paused' ? 'Paused' : st === 'complete' ? 'Complete' : 'Idle')
    $('mB').hidden = !(S.m3 && S.m3.enabled)
    if (S.m3 && S.m3.enabled) badge('m', !S.m3.ok ? 'bad' : S.m3.hidden ? 'warn' : 'ok', !S.m3.ok ? 'M³ problem' : S.m3.hidden ? 'M³ hidden' : 'M³ shown')
    const o = S.obs || {}
    badge('o', o.state === 'connected' ? 'ok' : o.state === 'auth-failed' || o.state === 'error' ? 'bad' : 'warn',
      o.state === 'connected' ? 'OBS connected' : o.state === 'auth-failed' ? 'OBS: wrong password' : 'OBS not detected')
    const u = S.update || {}
    $('uB').hidden = !(u.status === 'ready' || u.status === 'downloading')
    $('u').textContent = u.status === 'ready' ? 'Update ' + u.version + ' ready (open the app)' : 'Downloading update ' + u.percent + '%'

    const busy = !!S.phase
    const canEdit = (st === 'idle' || st === 'complete') && !busy && !S.locked
    $('setCard').hidden = false
    $('min').disabled = $('sec').disabled = $('at').disabled = $('startAt').disabled = !canEdit
    if (!editing) { $('min').value = S.minutes; $('sec').value = S.seconds }
    $('start').hidden = !(st === 'idle' || (st === 'complete' && !busy)) || busy
    $('start').disabled = busy
    $('start').textContent = st === 'complete' ? 'Start again' : 'Start'
    $('pause').hidden = !(st === 'running' && !busy)
    $('resume').hidden = !(st === 'paused' && !busy)
    $('restart').hidden = !(st === 'paused' && !busy)
    $('stop').hidden = !((st === 'running' || st === 'paused') && !busy)
    $('skip').hidden = !(S.phase && S.phase.kind === 'ending')
  }

  async function poll() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' })
      S = await r.json()
      skew = (S.now || Date.now()) - Date.now()
      render(); paint()
    } catch { badge('t', 'bad', 'App not responding') }
  }

  const sendTime = () => {
    const m = Math.max(0, Math.min(99, parseInt($('min').value, 10) || 0)), s = Math.max(0, Math.min(59, parseInt($('sec').value, 10) || 0))
    cmd('setTime', { minutes: m, seconds: s })
  }
  for (const id of ['min', 'sec']) {
    $(id).onfocus = () => (editing = 1)
    $(id).onblur = () => { editing = 0 }
    $(id).onchange = sendTime
  }
  $('start').onclick = () => cmd('start', { minutes: Math.max(0, Math.min(99, parseInt($('min').value, 10) || 0)), seconds: Math.max(0, Math.min(59, parseInt($('sec').value, 10) || 0)) })
  $('startAt').onclick = () => { if (!$('at').value) return say('Pick a clock time first.'); cmd('startAt', { time: $('at').value }) }
  $('pause').onclick = () => cmd('pause')
  $('resume').onclick = () => cmd('resume')
  $('restart').onclick = () => cmd('restart')
  $('stop').onclick = () => cmd('stop')
  $('skip').onclick = () => cmd('skip')
  $('open').onclick = () => post('/api/open').then(() => say('Opened the app window.')).catch(() => say('Could not reach the app.'))
  poll(); setInterval(poll, 700); setInterval(paint, 200)
</script></body></html>`;

module.exports = { DOCK_HTML };
