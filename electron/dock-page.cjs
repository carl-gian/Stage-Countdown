// The page served at http://127.0.0.1:4578/dock: a compact control panel for OBS
// (View > Docks > Custom Browser Docks). It is a remote control for the app's own window: every
// button sends the same command the main window's button would, so it behaves identically.
// All dynamic text is set with textContent (never innerHTML).
const DOCK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stage Countdown</title>
<style>
  /* Steward dark (kingdom-project-design tokens), as in the approved mockup. The dock sits inside OBS, so it is always dark. */
  :root{color-scheme:dark;--brand:#8fa9d6;--brand-strong:#b3c6e6;--brand-soft:#22304d;--on-brand:#121a2b;--page:#121a2b;--surface:#1a2338;--line:#2a3550;
    --text:#e8edf6;--dim:#9aa6be;--ok:#5fc08a;--warn:#f2b544;--danger:#ff6b5e;--on-danger:#121a2b;--r-md:14px;--pill:999px}
  *{box-sizing:border-box}
  body{margin:0;padding:12px;background:var(--page);color:var(--text);font:14px/1.4 "Noto Sans","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
  .badge{--tone:var(--dim);display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--pill);font-size:12px;font-weight:700;
    background:color-mix(in srgb,var(--tone) 14%,var(--page));color:var(--tone);white-space:nowrap}
  .badge i{width:7px;height:7px;border-radius:50%;background:var(--tone)}
  .badge.ok{--tone:var(--ok)}.badge.warn{--tone:var(--warn)}.badge.bad{--tone:var(--danger)}.badge.accent{--tone:var(--brand)}
  .card{background:var(--surface);border-radius:var(--r-md);padding:12px 16px;margin-bottom:12px}
  .cap{font-size:12px;font-weight:700;color:var(--dim)}
  .clock{display:flex;justify-content:space-between;align-items:baseline}
  .clock b{font-size:12px;font-weight:700;color:var(--dim);font-variant-numeric:tabular-nums}
  .time{font-size:56px;font-weight:800;line-height:1.05;text-align:center;font-variant-numeric:tabular-nums;letter-spacing:-.02em;margin:4px 0 2px}
  .time.paused{color:var(--warn)}.time.done{color:var(--brand)}
  .phase{text-align:center;color:var(--brand-strong);font-size:12px;font-weight:700;min-height:1.4em}
  .row{display:flex;gap:8px;align-items:center}
  .row>*{flex:1}
  .set{display:flex;gap:8px;align-items:flex-end;justify-content:center;margin-top:8px}
  .set label{display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--dim);font-size:12px;font-weight:700}
  input[type=number],input[type=time]{width:72px;min-height:40px;padding:0 8px;border:1.5px solid var(--line);border-radius:8px;background:var(--page);color:var(--text);
    font:800 20px "Noto Sans","Segoe UI",system-ui,sans-serif;text-align:center;font-variant-numeric:tabular-nums}
  input[type=time]{width:auto;flex:1;font-size:15px;font-weight:500}
  input:focus-visible,button:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
  input:disabled{opacity:.45}
  button{min-height:44px;padding:0 12px;border:1.5px solid var(--line);border-radius:var(--pill);background:var(--page);color:var(--text);
    font:700 14px "Noto Sans","Segoe UI",system-ui,sans-serif;cursor:pointer;transition:transform .12s ease-out,background-color .15s ease-out}
  button:active{transform:scale(.97)}
  button:hover{border-color:var(--brand)}button:disabled{opacity:.45;cursor:default;transform:none}
  button.go{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
  button.stop{background:var(--danger);border-color:var(--danger);color:var(--on-danger)}
  button.quiet{border-color:transparent;background:transparent;color:var(--brand)}
  .sep{color:var(--dim);font-size:22px;font-weight:800;padding-bottom:6px}
  #msg{color:var(--dim);text-align:center;font-size:12px;min-height:1.4em}
  [hidden]{display:none!important}
  @media (prefers-reduced-motion:reduce){button{transition:none}button:active{transform:none}}
</style></head><body>
  <div class="badges">
    <span class="badge" id="tB"><i></i><span id="t">Ready</span></span>
    <span class="badge" id="mB" hidden><i></i><span id="m"></span></span>
    <span class="badge" id="oB"><i></i><span id="o">OBS</span></span>
    <span class="badge accent" id="uB" hidden><i></i><span id="u"></span></span>
  </div>

  <div class="card">
    <div class="clock"><span class="cap">Time left</span><b id="now">--:--:--</b></div>
    <div class="time" id="big">00:00</div>
    <div class="phase" id="phase"></div>
  </div>

  <div class="card" id="setCard">
    <div class="cap">Set the time</div>
    <div class="set">
      <label>Minutes<input type="number" id="min" min="0" max="99" value="5"></label>
      <span class="sep">:</span>
      <label>Seconds<input type="number" id="sec" min="0" max="59" value="0"></label>
    </div>
    <div class="row" style="margin-top:12px">
      <input type="time" id="at" title="Count down to this clock time" aria-label="Count down to a time">
      <button id="startAt" title="Count down so that it ends exactly at this clock time">Count down to it</button>
    </div>
  </div>

  <div class="row" id="btns" style="margin-bottom:8px">
    <button class="go" id="start">Start</button>
    <button id="pause" hidden>Pause</button>
    <button id="resume" class="go" hidden>Resume</button>
    <button id="restart" hidden>Restart</button>
    <button class="stop" id="stop" hidden>Stop</button>
  </div>
  <div class="row" style="margin-bottom:6px"><button id="skip" hidden>Back to M³ now</button><button id="open" class="quiet">Open the app</button></div>
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
    badge('t', st === 'running' ? 'ok' : st === 'paused' ? 'warn' : st === 'complete' ? 'accent' : '', S.phase ? 'Working…' : st === 'running' ? 'Counting down' : st === 'paused' ? 'Paused' : st === 'complete' ? 'Finished' : 'Ready')
    $('mB').hidden = !(S.m3 && S.m3.enabled)
    if (S.m3 && S.m3.enabled) badge('m', !S.m3.ok ? 'bad' : S.m3.media === 'shown' ? 'warn' : 'accent',
      !S.m3.ok ? 'M³ problem' : S.m3.media === 'shown' ? 'M³ Media Display Shown' : 'M³ Media Display Hidden')
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
