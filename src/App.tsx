import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Controller, { type Phase } from '@/components/Controller';
import { stateLabel } from '@/lib/stateLabel';
import TimerDisplay from '@/components/TimerDisplay';
import SettingsModal from '@/components/SettingsModal';
import HelpModal from '@/components/HelpModal';
import WhatsNewModal from '@/components/WhatsNewModal';
import { useCountdownTimer, saveVisualSettings } from '@/hooks/useCountdownTimer';
import { DEFAULT_VISUAL_SETTINGS, mergeVisual, type StageState, type VisualSettings } from '@/types';
import { nextOccurrence } from '@/lib/time';
import { m3Label, M3_BADGE_PREFIX } from '@/lib/m3label';
import { autoCloseBlockedByObs, AUTO_CLOSE_BLOCKED_HINT, AUTO_CLOSE_BLOCKED_TEXT } from '@/lib/autoClose';
import { SEQUENCE, START_LEAD_MS } from '@/lib/sequence';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function safeLoadVisualSettings(): VisualSettings {
  try {
    const raw = window.localStorage.getItem('stagecountdown:visual');
    return raw ? mergeVisual(JSON.parse(raw)) : DEFAULT_VISUAL_SETTINGS;
  } catch {
    return DEFAULT_VISUAL_SETTINGS;
  }
}

/** What we last did to M3 ("hidden" is our belief: its hotkey is a toggle we can't read back). */
interface M3Status {
  ok: boolean;
  enabled?: boolean;
  media?: 'shown' | 'hidden' | 'none' | 'unknown';
  note?: string;
  hidden: boolean;
  error?: string;
}

/** Black curtain over the stage window, and how long its fade takes. */
interface Curtain {
  on: boolean;
  ms: number;
}

function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const view = queryParams.get('view');

  if (view === 'stage') {
    return <StageView />;
  }

  return <ControllerView />;
}

// --- CONTROLLER WINDOW ---
function ControllerView() {
  const timer = useCountdownTimer();
  const [visual, setVisual] = useState<VisualSettings>(() => safeLoadVisualSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 520, height: 720 });

  const [autoClose, setAutoClose] = useState(false);
  // Set whenever a countdown is stopped early while autoClose was on. Consumed on the next
  // interactive Start to ask "still want to close after this one?".
  const [pendingCloseReconfirm, setPendingCloseReconfirm] = useState(false);
  /** Epoch ms the app will quit at (auto-close countdown), or null. */
  const [quitAt, setQuitAt] = useState<number | null>(null);

  const [targetTimeMode, setTargetTimeMode] = useState(false);
  const [targetTimeValue, setTargetTimeValue] = useState('');

  // One lock for every sequence (start, complete, stop) so two M3 toggles can never overlap.
  const busyRef = useRef(false);
  const [phase, setPhase] = useState<Phase>(null);
  const skipHoldRef = useRef<(() => void) | null>(null);

  const [m3, setM3] = useState<M3Status>({ ok: true, hidden: false });
  const [confirmRequest, setConfirmRequest] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // What the stage window shows, set step by step by the sequences.
  const [stageShowsTimer, setStageShowsTimer] = useState(false);
  const [preroll, setPreroll] = useState<number | null>(null); // full time shown before counting starts
  const [curtain, setCurtain] = useState<Curtain>({ on: false, ms: 0 });

  const busy = phase !== null;

  // Optional OBS scene switching (Settings > OBS Scene Switching). Never blocks or fails a sequence.
  const [obsStatus, setObsStatus] = useState<ObsStatus | null>(null);
  const [obsNote, setObsNote] = useState('');
  const obsMediaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.electronAPI?.obsGetStatus?.().then(setObsStatus).catch(() => {});
    return window.electronAPI?.onObsStatus?.(setObsStatus);
  }, []);

  /** Fire-and-forget: OBS problems are shown in the OBS row, never stop the countdown. */
  const obsSwitch = useCallback((kind: 'media' | 'return', fadeMs: number) => {
    window.electronAPI
      ?.obsSwitch?.(kind, fadeMs)
      .then((r) => setObsNote(r.ok || r.skipped ? '' : (r.error ?? 'OBS scene switch failed')))
      .catch(() => {});
  }, []);

  // "Close after timer ends" is unavailable (and forced off) while connected to OBS: see src/lib/autoClose.ts.
  const autoCloseBlocked = autoCloseBlockedByObs(obsStatus);
  const autoCloseBlockedRef = useRef(autoCloseBlocked);
  autoCloseBlockedRef.current = autoCloseBlocked;
  useEffect(() => {
    if (autoCloseBlocked) {
      setAutoClose(false);
      setQuitAt(null);
      setPendingCloseReconfirm(false);
    }
  }, [autoCloseBlocked]);

  const cancelPendingObsMedia = useCallback(() => {
    if (obsMediaTimerRef.current) clearTimeout(obsMediaTimerRef.current);
    obsMediaTimerRef.current = null;
  }, []);

  // Help guide, What's new, auto-update badge.
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState('start');
  const [whatsNew, setWhatsNew] = useState<{ open: boolean; from?: string }>({ open: false });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  const openHelp = useCallback((topic = 'start') => {
    setHelpTopic(topic);
    setHelpOpen(true);
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    api?.getAppInfo?.().then((info) => {
      setAppInfo(info);
      setUpdate(info.update);
      // First ever start: the quick-start guide. First start after an update: what's new.
      if (info.launch === 'first-run') openHelp('start');
      else if (info.launch === 'updated') setWhatsNew({ open: true, from: info.lastSeenVersion });
    });
    const offUpdate = api?.onUpdateStatus?.(setUpdate);
    const offHelp = api?.onOpenHelp?.((t) => openHelp(t));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        openHelp('start');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offUpdate?.();
      offHelp?.();
      window.removeEventListener('keydown', onKey);
    };
  }, [openHelp]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    window.electronAPI?.ackVersion?.();
  }, []);

  const closeWhatsNew = useCallback(() => {
    setWhatsNew({ open: false });
    window.electronAPI?.ackVersion?.();
  }, []);

  const askConfirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setConfirmRequest({ message, resolve })),
    []
  );

  const m3Ref = useRef(m3);
  m3Ref.current = m3;

  const applyM3 = useCallback((status?: M3Status) => {
    if (status) setM3(status);
  }, []);

  useEffect(() => {
    window.electronAPI?.getM3State?.().then(applyM3).catch(() => {});
    // The real state of M³'s media window, read by the app every couple of seconds (also catches changes made by hand).
    return window.electronAPI?.onM3Status?.(applyM3);
  }, [applyM3]);

  useEffect(() => {
    const update = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const config = await window.electronAPI?.getConfig?.();
        if (config?.visual) setVisual(mergeVisual(config.visual));
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, []);

  // The stage gets every change instantly (below); the config file is written once dragging settles.
  useEffect(() => {
    saveVisualSettings(visual);
    if (!configLoaded) return;
    const id = setTimeout(() => window.electronAPI?.setConfig?.({ visual }), 400);
    return () => clearTimeout(id);
  }, [visual, configLoaded]);

  // Sent only when something changes (not every frame). The stage runs its own clock from endsAt.
  const frozenRemaining = preroll ?? (timer.state === 'running' ? 0 : timer.remainingMs);
  useEffect(() => {
    const payload: StageState = {
      show: stageShowsTimer,
      state: preroll !== null ? 'idle' : timer.state,
      totalMs: preroll ?? timer.totalMs,
      remainingMs: frozenRemaining,
      endsAt: preroll !== null ? 0 : timer.endsAt,
      visual,
      blackout: curtain.on,
      curtainMs: curtain.ms,
    };
    window.electronAPI?.syncStateToStage?.(payload);
  }, [stageShowsTimer, preroll, timer.state, timer.totalMs, timer.endsAt, frozenRemaining, visual, curtain]);

  const togglePin = useCallback(async () => {
    const newPinned = !pinned;
    setPinned(newPinned);
    if (window.electronAPI?.setAlwaysOnTop) {
      await window.electronAPI.setAlwaysOnTop(newPinned);
    }
  }, [pinned]);

  /** A wait the operator can cut short (used for the 00:00 hold). */
  const skippableDelay = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(id);
          skipHoldRef.current = null;
          resolve();
        };
        const id = setTimeout(finish, ms);
        skipHoldRef.current = finish;
      }),
    []
  );

  // --- START SEQUENCE (timings: src/lib/sequence.ts) ----------------------
  // `durationAt(startAt)` gives the countdown length if it starts at that moment, so "Countdown to
  // Time" is sized when counting really begins and still ends exactly on the target.
  const runStartSequence = useCallback(
    async (durationAt: (startAt: number) => number, opts?: { interactive?: boolean }) => {
      if (busyRef.current || timer.state === 'running' || timer.state === 'paused') return;
      busyRef.current = true;
      setQuitAt(null);
      try {
        if (opts?.interactive !== false && pendingCloseReconfirm && !autoCloseBlockedRef.current) {
          const keep = await askConfirm(
            'The last countdown was stopped early while "Close StageCountdown after Timer ends" was on.\n\nKeep it enabled for this countdown?'
          );
          setAutoClose(keep);
          setPendingCloseReconfirm(false);
        }
        const s = SEQUENCE.start;
        setPhase({ kind: 'starting', until: Date.now() + START_LEAD_MS + 700 });

        // Invisible until the curtain comes on; never takes focus from M3.
        await window.electronAPI?.openStageWindow?.();
        applyM3(await window.electronAPI?.triggerShortcut?.());
        // From here until the hand-back, keep M³'s media display hidden: if it comes back on top, hide it again.
        window.electronAPI?.setM3Guard?.(true);

        await delay(s.blackAfterShortcutMs);
        setPhase({ kind: 'starting', until: Date.now() + START_LEAD_MS - s.blackAfterShortcutMs });
        setCurtain({ on: true, ms: s.blackFadeInMs });
        await delay(s.blackHoldMs);

        setPreroll(durationAt(Date.now() + s.revealMs + s.holdBeforeCountingMs));
        setStageShowsTimer(true);
        setCurtain({ on: false, ms: s.revealMs });
        await delay(s.revealMs + s.holdBeforeCountingMs);

        timer.start(Math.max(1000, durationAt(Date.now())));
        setPreroll(null);

        // OBS (optional): shortly after counting starts, fade Zoom's view to the Media Display scene.
        cancelPendingObsMedia();
        obsMediaTimerRef.current = setTimeout(() => {
          obsMediaTimerRef.current = null;
          obsSwitch('media', SEQUENCE.obs.mediaFadeMs);
        }, SEQUENCE.obs.mediaDelayAfterStartMs);
      } finally {
        busyRef.current = false;
        setPhase(null);
      }
    },
    [timer, pendingCloseReconfirm, askConfirm, applyM3, obsSwitch, cancelPendingObsMedia]
  );

  const settingsMs = timer.settings.minutes * 60_000 + timer.settings.seconds * 1000;

  // The countdown must END at the target: the target is fixed now, the length when counting begins.
  const handleStartTargetCountdown = useCallback(() => {
    if (!targetTimeMode || !targetTimeValue) return;
    const targetAt = nextOccurrence(targetTimeValue, new Date()).getTime();
    runStartSequence((startAt) => targetAt - startAt);
  }, [targetTimeMode, targetTimeValue, runStartSequence]);

  const handleStart = useCallback(() => {
    if (targetTimeMode) return handleStartTargetCountdown();
    if (settingsMs <= 0) return;
    runStartSequence(() => settingsMs);
  }, [targetTimeMode, handleStartTargetCountdown, settingsMs, runStartSequence]);

  const handleRestart = useCallback(() => {
    setTargetTimeMode(false);
    setTargetTimeValue('');
    // Paused: the stage is already up and M3 already hidden, so just start over in place.
    if (timer.state === 'paused') return timer.restart();
    runStartSequence(() => settingsMs);
  }, [runStartSequence, timer, settingsMs]);

  // Scheduled auto-timer fires unattended — never a blocking dialog for it.
  useEffect(() => {
    if (!window.electronAPI?.onScheduledStart) return;
    return window.electronAPI.onScheduledStart(({ durationMinutes }: { durationMinutes: number }) => {
      if (timer.state === 'running') return;
      setTargetTimeMode(false);
      setTargetTimeValue('');
      const minutes = durationMinutes ?? 5;
      timer.setSettings({ minutes, seconds: 0 });
      runStartSequence(() => minutes * 60_000, { interactive: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.state, runStartSequence]);

  /**
   * Shared tail of END and STOP (timings: SEQUENCE.handBack). The way back is built to be smooth, with OBS's return to
   * the camera as the very last step:
   *   timer window fades to black -> black for 3 s -> shortcut brings M³'s media display back (it fades in OVER our
   *   black window) -> our window closes underneath it -> 1 s after the shortcut OBS fades back.
   * Returns when the shortcut was sent.
   */
  const handBackToM3 = useCallback(async () => {
    const h = SEQUENCE.handBack;
    window.electronAPI?.setM3Guard?.(false); // from now on M³ is SUPPOSED to come back
    setCurtain({ on: true, ms: h.fadeToBlackMs });
    await delay(h.fadeToBlackMs);
    if (m3Ref.current.enabled !== false) await delay(h.blackHoldMs); // plain black: M³ is about to fade in over it

    const shortcutAt = Date.now();
    applyM3(await window.electronAPI?.selectAndSignalM3?.());

    // Our black window stays until M³ has fully faded in on top of it, then goes away underneath.
    await delay(Math.max(0, shortcutAt + h.closeAfterShortcutMs - Date.now()));
    await window.electronAPI?.closeStageWindow?.();
    setStageShowsTimer(false);
    setCurtain({ on: false, ms: 0 });

    // The very last step: OBS fades back to the Camera scene (or the scene it was on before the countdown).
    await delay(Math.max(0, shortcutAt + h.obsAfterShortcutMs - Date.now()));
    obsSwitch('return', SEQUENCE.obs.returnFadeMs);
    return shortcutAt;
  }, [applyM3, obsSwitch]);

  // --- END SEQUENCE, natural completion -----------------------------------
  const runCompletionSequence = useCallback(
    async (closeAfter: boolean) => {
      busyRef.current = true;
      const e = SEQUENCE.end;
      let shortcutAt = 0;
      try {
        setPhase({ kind: 'ending', until: Date.now() + e.holdZeroMs });
        cancelPendingObsMedia();
        await skippableDelay(e.holdZeroMs);
        setPhase({ kind: 'returning' });
        shortcutAt = await handBackToM3();
      } finally {
        busyRef.current = false;
        setPhase(null);
      }
      if (closeAfter && !autoCloseBlockedRef.current) setQuitAt(shortcutAt + e.quitAfterShortcutMs);
    },
    [handBackToM3, skippableDelay, cancelPendingObsMedia]
  );

  const prevTimerState = useRef(timer.state);
  useEffect(() => {
    if (prevTimerState.current === 'running' && timer.state === 'complete') {
      setTargetTimeMode(false);
      setTargetTimeValue('');
      runCompletionSequence(autoClose);
    }
    prevTimerState.current = timer.state;
  }, [timer.state, autoClose, runCompletionSequence]);

  // Auto-close countdown: quits when it reaches zero unless the button is clicked to cancel.
  useEffect(() => {
    if (quitAt === null) return;
    const id = setInterval(() => {
      if (Date.now() >= quitAt) {
        clearInterval(id);
        if (!autoCloseBlockedRef.current) window.electronAPI?.closeApp?.();
        else setQuitAt(null); // OBS connected meanwhile: stay running
      }
    }, 100);
    return () => clearInterval(id);
  }, [quitAt]);

  const handleAutoCloseButton = useCallback(() => {
    if (autoCloseBlockedRef.current) return;
    if (quitAt !== null) {
      setQuitAt(null); // cancel the pending close
      setAutoClose(false);
      return;
    }
    setAutoClose((v) => !v);
  }, [quitAt]);

  // --- STOP SEQUENCE (user-cancelled): never quits; asks about auto-close again on the next Start ---
  const handleStop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setPhase({ kind: 'stopping' });
      cancelPendingObsMedia();
      if (autoClose) setPendingCloseReconfirm(true);
      timer.stop();
      setStageShowsTimer(false); // timer fades out while the curtain fades in
      setTargetTimeMode(false);
      setTargetTimeValue('');
      await handBackToM3();
    } finally {
      busyRef.current = false;
      setPhase(null);
    }
  }, [timer, autoClose, handBackToM3, cancelPendingObsMedia]);

  const handleSetNewTime = useCallback(() => {
    // After a finished countdown the stage is already closed and M3 is back: just reset.
    if (timer.state === 'complete') return timer.stop();
    handleStop();
  }, [timer, handleStop]);

  const handleToggleM3 = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase({ kind: 'returning' });
    try {
      applyM3(await window.electronAPI?.toggleM3?.());
    } finally {
      busyRef.current = false;
      setPhase(null);
    }
  }, [applyM3]);

  const handleTargetTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTargetTimeValue(value);

    if (!value) {
      setTargetTimeMode(false);
      return;
    }

    // Preview only: the real duration is worked out when counting begins.
    const diffMs = nextOccurrence(value, new Date()).getTime() - Date.now();
    const totalSeconds = Math.floor(diffMs / 1000);
    timer.setSettings({ ...timer.settings, minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60 });
    setTargetTimeMode(true);
  };

  const handleClearTargetTime = useCallback(() => {
    setTargetTimeValue('');
    setTargetTimeMode(false);
  }, []);

  // --- OBS DOCK ------------------------------------------------------------
  // The dock is a remote control: each command does exactly what the matching button here does.
  const dockCommandRef = useRef<(cmd: DockCommand) => void>(() => {});
  dockCommandRef.current = (cmd) => {
    const idle = (timer.state === 'idle' || timer.state === 'complete') && !busyRef.current;
    const hasTime = cmd.minutes !== undefined && cmd.seconds !== undefined;
    switch (cmd.action) {
      case 'setTime':
        if (idle && hasTime) {
          setTargetTimeMode(false);
          setTargetTimeValue('');
          timer.setSettings({ minutes: cmd.minutes!, seconds: cmd.seconds! });
        }
        break;
      case 'start': {
        if (!idle && timer.state !== 'idle') break;
        if (hasTime) {
          const ms = (cmd.minutes! * 60 + cmd.seconds!) * 1000;
          setTargetTimeMode(false);
          setTargetTimeValue('');
          timer.setSettings({ minutes: cmd.minutes!, seconds: cmd.seconds! });
          if (ms > 0) runStartSequence(() => ms);
        } else {
          handleStart();
        }
        break;
      }
      case 'startAt': {
        if (!idle || !cmd.time) break;
        const targetAt = nextOccurrence(cmd.time, new Date()).getTime();
        setTargetTimeValue(cmd.time);
        setTargetTimeMode(true);
        runStartSequence((startAt) => targetAt - startAt);
        break;
      }
      case 'pause':
        timer.pause();
        break;
      case 'resume':
        timer.resume();
        break;
      case 'restart':
        if (timer.state === 'paused' || timer.state === 'complete') handleRestart();
        break;
      case 'stop':
        if (timer.state === 'running' || timer.state === 'paused') handleStop();
        break;
      case 'skip':
        skipHoldRef.current?.();
        break;
    }
  };

  useEffect(() => window.electronAPI?.onDockCommand?.((cmd) => dockCommandRef.current(cmd)), []);

  useEffect(() => {
    window.electronAPI?.pushDockState?.({
      timerState: timer.state,
      minutes: timer.settings.minutes,
      seconds: timer.settings.seconds,
      totalMs: timer.totalMs,
      remainingMs: timer.state === 'running' ? 0 : timer.remainingMs,
      endsAt: timer.endsAt,
      phase,
      quitAt,
      m3: { enabled: m3.enabled !== false, media: m3.media, hidden: m3.hidden, ok: m3.ok, error: m3.error, note: m3.note },
      autoClose,
      clock24h: visual.clock24h,
    });
  }, [timer.state, timer.settings.minutes, timer.settings.seconds, timer.totalMs, timer.remainingMs, timer.endsAt, phase, quitAt, m3, autoClose, visual.clock24h]);

  const noopNumberHandler = useCallback(() => {}, []);

  const counting = timer.state === 'running' || timer.state === 'paused';
  const manualControlsLocked = targetTimeMode || counting || busy;
  const m3On = m3.enabled !== false;
  const { label: stateText, tone: stateTone } = stateLabel(timer.state, phase);

  const pills = (
    <>
      <span className={`st-pill ${stateTone}`}><i />{stateText}</span>
      {m3On && <M3Pill status={m3} />}
      {obsStatus?.enabled && <ObsPill status={obsStatus} />}
    </>
  );

  const targetTime = (
    <div className="sc-attime">
      <label htmlFor="target-time">
        Count down to a time
        <small>Ends exactly at this clock time</small>
      </label>
      <input
        id="target-time"
        type="time"
        className="sc-input st-num"
        value={targetTimeValue}
        onChange={handleTargetTimeChange}
        disabled={counting || busy}
      />
      {targetTimeMode && (
        <button className="st-btn st-btn--quiet" onClick={handleClearTargetTime} disabled={counting || busy}>
          Clear
        </button>
      )}
    </div>
  );

  const options = (
    <>
      {m3On && <M3Option status={m3} busy={busy} onToggle={handleToggleM3} />}
      {obsStatus?.enabled && <ObsOption status={obsStatus} note={obsNote} />}
      <AutoCloseOption autoClose={autoClose} quitAt={quitAt} blocked={autoCloseBlocked} onClick={handleAutoCloseButton} />
    </>
  );

  return (
    <div className="sc-app relative overflow-hidden">
      <Controller
        state={timer.state}
        minutes={timer.settings.minutes}
        seconds={timer.settings.seconds}
        onMinutesChange={manualControlsLocked ? noopNumberHandler : (m) => timer.setSettings({ ...timer.settings, minutes: m })}
        onSecondsChange={manualControlsLocked ? noopNumberHandler : (s) => timer.setSettings({ ...timer.settings, seconds: s })}
        disableTimeInputs={manualControlsLocked}
        lockedNote={targetTimeMode && targetTimeValue ? `Counting down to ${targetTimeValue}` : undefined}
        onStart={handleStart}
        onPause={timer.pause}
        onResume={timer.resume}
        onStop={handleStop}
        onRestart={handleRestart}
        onSetNewTime={handleSetNewTime}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => openHelp('start')}
        pinned={pinned}
        onTogglePin={togglePin}
        visual={visual}
        phase={phase}
        onSkipPhase={() => skipHoldRef.current?.()}
        pills={pills}
        banner={update && (update.status === 'ready' || update.status === 'downloading') ? <UpdateBanner update={update} /> : null}
        targetTime={targetTime}
        countingNote={m3On ? 'M³ is hidden and guarded until the end' : undefined}
        options={options}
      >
        <TimerDisplay
          remainingMs={preroll ?? (timer.state === 'idle' ? timer.durationMs : timer.remainingMs)}
          totalMs={preroll ?? (timer.state === 'idle' ? timer.durationMs : timer.totalMs)}
          endsAt={preroll !== null ? 0 : timer.endsAt}
          state={preroll !== null ? 'ready' : timer.state}
          visual={visual}
          windowSize={windowSize}
        />
      </Controller>

      {confirmRequest && (
        <ConfirmDialog
          message={confirmRequest.message}
          onAnswer={(v) => {
            confirmRequest.resolve(v);
            setConfirmRequest(null);
          }}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        visual={visual}
        onChange={setVisual}
        onM3EnabledChange={() => window.electronAPI?.getM3State?.().then(applyM3).catch(() => {})}
        onOpenHelp={(t) => {
          setSettingsOpen(false);
          openHelp(t);
        }}
        onShowWhatsNew={() => setWhatsNew({ open: true })}
      />

      <HelpModal open={helpOpen} topic={helpTopic} onClose={closeHelp} />
      <WhatsNewModal open={whatsNew.open} version={appInfo?.version ?? ''} from={whatsNew.from} onClose={closeWhatsNew} />
    </div>
  );
}

/**
 * Dev only (`npm run dev`): `?view=stage&demo=1` shows the stage in a browser with a made-up countdown, for screenshots.
 * Optional: `&at=counting|last|done`, `&scene=mountains|meadow|lake`, `&look=light|dark|auto`, `&motion=calm|plain`,
 * `&style=custom`. Never used by the app itself.
 */
function demoStageState(params: URLSearchParams): StageState | null {
  if (!import.meta.env.DEV || params.get('demo') !== '1') return null;
  const total = 5 * 60_000;
  const at = params.get('at');
  const visual = mergeVisual({
    stage: {
      ...DEFAULT_VISUAL_SETTINGS.stage,
      ...Object.fromEntries(['scene', 'look', 'motion', 'style'].flatMap((k) => (params.get(k) ? [[k, params.get(k)]] : []))),
    },
  });
  const base = { show: true, totalMs: total, visual, blackout: false, curtainMs: 0 };
  if (at === 'counting') return { ...base, state: 'running', remainingMs: 0, endsAt: Date.now() + 222_000 };
  if (at === 'last') return { ...base, state: 'running', remainingMs: 0, endsAt: Date.now() + 7_400 };
  if (at === 'done') return { ...base, state: 'complete', remainingMs: 0, endsAt: 0 };
  return { ...base, state: 'idle', remainingMs: total, endsAt: 0 };
}

// --- STAGE VIEW (TRANSPARENT WITH GPU-ACCELERATED ANIMATION) ---
function StageView() {
  const [stageState, setStageState] = useState<StageState>(() => demoStageState(new URLSearchParams(window.location.search)) ?? {
    show: false,
    state: 'idle',
    totalMs: 0,
    remainingMs: 0,
    endsAt: 0,
    visual: DEFAULT_VISUAL_SETTINGS,
    blackout: false,
    curtainMs: 0,
  });
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const update = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStageState) return;
    return window.electronAPI.onUpdateStageState((data: Partial<StageState>) => {
      setStageState((prev) => ({ ...prev, ...data, visual: mergeVisual(data.visual ?? prev.visual) }));
    });
  }, []);

  const isActive = stageState.show;
  const sceneStyle = stageState.visual.stage.style === 'scene';

  const bgStyle = stageState.visual?.background?.mode === 'gradient'
    ? { background: `linear-gradient(135deg, ${stageState.visual.background.color1}, ${stageState.visual.background.color2})` }
    : { background: stageState.visual?.background?.color1 || 'transparent' };

  // Opacity + transform only: cheap to animate on a transparent always-on-top window.
  const ease = [0.16, 1, 0.3, 1] as const;

  const timer = (
    <TimerDisplay
      remainingMs={stageState.remainingMs}
      totalMs={stageState.totalMs}
      endsAt={stageState.endsAt}
      state={stageState.state}
      visual={stageState.visual}
      windowSize={windowSize}
      arrive
    />
  );

  return (
    <div className="w-screen h-screen overflow-hidden flex items-center justify-center relative">
      {sceneStyle ? (
        // The Steward look: the scene IS the background (opaque), with the countdown on glass over it. It is only
        // mounted while shown, so nothing animates behind the curtain or while M³ is on screen.
        <AnimatePresence>
          {isActive && (
            <motion.div
              key="stage-scene"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease }}
              className="absolute inset-0"
              style={{ willChange: 'opacity' }}
            >
              {timer}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <>
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={bgStyle}
            initial={false}
            animate={{ opacity: isActive ? (stageState.visual?.background?.opacity ?? 1) : 0 }}
            transition={{ duration: 0.5, ease }}
          />

          <AnimatePresence mode="wait">
            {isActive && (
              <motion.div
                key="stage-timer"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.5, ease }}
                className="relative flex items-center justify-center p-8"
                style={{ willChange: 'transform, opacity' }}
              >
                {timer}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Black curtain: covers the stage while M3 is hidden/shown so the hand-off never flashes. */}
      <motion.div
        className="absolute inset-0 bg-black pointer-events-none"
        initial={false}
        animate={{ opacity: stageState.blackout ? 1 : 0 }}
        transition={{ duration: (stageState.curtainMs ?? 500) / 1000, ease: 'easeInOut' }}
        style={{ zIndex: 20 }}
      />
    </div>
  );
}

/** "Close StageCountdown after Timer ends" as a switch row; while the app is about to quit, a Cancel button and a draining bar. */
function AutoCloseOption({ autoClose, quitAt, blocked, onClick }: { autoClose: boolean; quitAt: number | null; blocked: boolean; onClick: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (quitAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [quitAt]);

  if (quitAt !== null && !blocked) {
    const secs = Math.max(0, Math.ceil((quitAt - now) / 1000));
    return (
      <div className="st-option st-option--wrap" role="status">
        <span>
          <b>Closing in {secs}s</b>
          <small>Stage Countdown closes after this countdown</small>
        </span>
        <button className="st-btn st-btn--soft" onClick={onClick} title="Click to cancel and keep StageCountdown open">
          Cancel
        </button>
        <div className="sc-drain" style={{ flexBasis: '100%' }}>
          <i style={{ width: `${Math.min(100, ((quitAt - now) / SEQUENCE.end.quitAfterShortcutMs) * 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="st-option" title={blocked ? AUTO_CLOSE_BLOCKED_HINT : undefined}>
      <span>
        Close StageCountdown after Timer ends
        <small>{blocked ? AUTO_CLOSE_BLOCKED_TEXT : autoClose ? 'On: the app closes 5 s after M³ is back' : 'Off'}</small>
      </span>
      <button
        className="st-switch"
        role="switch"
        aria-checked={autoClose && !blocked}
        aria-label="Close StageCountdown after Timer ends"
        disabled={blocked}
        onClick={onClick}
      />
    </div>
  );
}

const OBS_TONE: Record<ObsStatus['state'], string> = {
  off: '',
  searching: 'st-pill--warn',
  connecting: 'st-pill--warn',
  connected: 'st-pill--ok',
  'auth-failed': 'st-pill--danger',
  error: 'st-pill--danger',
};

function obsText(status: ObsStatus) {
  const back = status.returnMode === 'previous' ? (status.previousScene || 'previous scene') : status.cameraScene;
  const ready = status.state === 'connected' && status.mediaScene && (status.returnMode === 'previous' || status.cameraScene);
  return status.state === 'connected'
    ? ready
      ? `Connected · ${back} ⇄ ${status.mediaScene}`
      : 'Connected · choose the scenes in Settings'
    : status.state === 'auth-failed'
      ? 'Wrong WebSocket password'
      : status.state === 'error'
        ? 'Could not talk to OBS'
        : 'Looking for OBS…';
}

function ObsPill({ status }: { status: ObsStatus }) {
  const label = status.state === 'connected' ? 'OBS connected' : status.state === 'auth-failed' || status.state === 'error' ? 'OBS problem' : 'Looking for OBS';
  return <span className={`st-pill ${OBS_TONE[status.state]}`}><i />{label}</span>;
}

function ObsOption({ status, note }: { status: ObsStatus; note: string }) {
  return (
    <div className="st-option" title={note || status.error}>
      <span>
        <b>OBS</b>
        <small>
          {obsText(status)}
          {note && <span className="sc-error"> · {note}</span>}
        </small>
      </span>
    </div>
  );
}

/** Update notice. Click to restart and update (the app asks first). */
function UpdateBanner({ update }: { update: UpdateInfo }) {
  const icon = (
    <svg className="st-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" />
    </svg>
  );
  if (update.status === 'downloading') {
    return (
      <div className="st-banner" role="status">
        {icon}
        <div className="st-banner__body">
          <b>Downloading update {update.version}… {update.percent}%</b>
          <p>It downloads quietly and is never installed on its own.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="st-banner" role="status">
      {icon}
      <div className="st-banner__body">
        <b>Update {update.version} is ready</b>
        <p>Restart to install it, when no meeting is running.</p>
      </div>
      <button className="st-btn st-btn--primary" onClick={() => window.electronAPI?.updateInstall?.()} title="Install the update and restart the app (it asks first)">
        Restart and update
      </button>
    </div>
  );
}

function M3Pill({ status }: { status: M3Status }) {
  const label = m3Label(status);
  const tone = !status.ok ? 'st-pill--danger' : label.word === 'Shown' ? 'st-pill--warn' : 'st-pill--brand';
  return <span className={`st-pill ${tone}`}><i />{label.text}</span>;
}

function M3Option({ status, busy, onToggle }: { status: M3Status; busy: boolean; onToggle: () => void }) {
  const label = m3Label(status);
  return (
    <div className="st-option">
      <span title={status.error ?? status.note ?? (label.guessed ? "Best guess: M³'s window could not be read" : undefined)}>
        <b>{M3_BADGE_PREFIX}</b>
        <small>
          {label.word}
          {label.guessed && ' (assumed)'}
          {status.note && <span className="sc-note"> · {status.note}</span>}
          {!status.ok && <span className="sc-error"> · {status.error ?? 'could not reach M³'}</span>}
        </small>
      </span>
      <button
        className="st-btn st-btn--quiet"
        onClick={onToggle}
        disabled={busy}
        title="Send M³'s Media Window shortcut now (shows it if hidden, hides it if showing)"
      >
        {label.word === 'Shown' ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function ConfirmDialog({ message, onAnswer }: { message: string; onAnswer: (value: boolean) => void }) {
  return (
    <div className="sc-dialog" role="alertdialog" aria-modal="true" aria-label="Please confirm">
      <div className="sc-dialog__veil" />
      <div className="sc-dialog__panel" style={{ maxWidth: 400 }}>
        <div className="sc-dialog__body">
          <p className="whitespace-pre-line" style={{ margin: 0, fontSize: 15 }}>{message}</p>
        </div>
        <div className="sc-dialog__foot">
          <button className="st-btn st-btn--secondary" onClick={() => onAnswer(false)}>
            No, turn it off
          </button>
          <button className="st-btn st-btn--primary" onClick={() => onAnswer(true)}>
            Keep it on
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
