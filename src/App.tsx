import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Controller, { type Phase } from '@/components/Controller';
import TimerDisplay from '@/components/TimerDisplay';
import SettingsModal from '@/components/SettingsModal';
import HelpModal from '@/components/HelpModal';
import WhatsNewModal from '@/components/WhatsNewModal';
import { useCountdownTimer, saveVisualSettings } from '@/hooks/useCountdownTimer';
import { DEFAULT_VISUAL_SETTINGS, mergeVisual, type StageState, type VisualSettings } from '@/types';
import { nextOccurrence } from '@/lib/time';
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
  const obsSwitch = useCallback((kind: 'media' | 'camera', fadeMs: number) => {
    window.electronAPI
      ?.obsSwitch?.(kind, fadeMs)
      .then((r) => setObsNote(r.ok || r.skipped ? '' : (r.error ?? 'OBS scene switch failed')))
      .catch(() => {});
  }, []);

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
        if (opts?.interactive !== false && pendingCloseReconfirm) {
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
   * Shared tail of END and STOP: the timer window fades to black -> it is closed -> the shortcut brings M³'s
   * media display back (verified by the app). Returns when the shortcut was sent.
   */
  const handBackToM3 = useCallback(
    async (t: { fadeToBlackMs: number; closeAfterFadeMs: number; shortcutAfterCloseMs: number }) => {
      window.electronAPI?.setM3Guard?.(false); // from now on M³ is SUPPOSED to come back
      setCurtain({ on: true, ms: t.fadeToBlackMs });
      await delay(t.fadeToBlackMs + t.closeAfterFadeMs);
      await window.electronAPI?.closeStageWindow?.();
      setStageShowsTimer(false);
      setCurtain({ on: false, ms: 0 });
      await delay(t.shortcutAfterCloseMs);
      const shortcutAt = Date.now();
      applyM3(await window.electronAPI?.selectAndSignalM3?.());
      return shortcutAt;
    },
    [applyM3]
  );

  // --- END SEQUENCE, natural completion -----------------------------------
  const runCompletionSequence = useCallback(
    async (closeAfter: boolean) => {
      busyRef.current = true;
      const e = SEQUENCE.end;
      let shortcutAt = 0;
      try {
        setPhase({ kind: 'ending', until: Date.now() + e.holdZeroMs });
        // OBS (optional): Zoom fades back to the Camera scene as the timer ends, while the room still sees 00:00.
        cancelPendingObsMedia();
        setTimeout(() => obsSwitch('camera', SEQUENCE.obs.cameraFadeMs), SEQUENCE.obs.cameraDelayAfterEndMs);
        await skippableDelay(e.holdZeroMs);
        setPhase({ kind: 'returning' });
        shortcutAt = await handBackToM3(e);
      } finally {
        busyRef.current = false;
        setPhase(null);
      }
      if (closeAfter) setQuitAt(shortcutAt + e.quitAfterShortcutMs);
    },
    [handBackToM3, skippableDelay, obsSwitch, cancelPendingObsMedia]
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
        window.electronAPI?.closeApp?.();
      }
    }, 100);
    return () => clearInterval(id);
  }, [quitAt]);

  const handleAutoCloseButton = useCallback(() => {
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
      obsSwitch('camera', SEQUENCE.obs.cameraFadeOnStopMs);
      if (autoClose) setPendingCloseReconfirm(true);
      timer.stop();
      setStageShowsTimer(false); // timer fades out while the curtain fades in
      setTargetTimeMode(false);
      setTargetTimeValue('');
      await handBackToM3(SEQUENCE.stop);
    } finally {
      busyRef.current = false;
      setPhase(null);
    }
  }, [timer, autoClose, handBackToM3, obsSwitch, cancelPendingObsMedia]);

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

  const bgStyle = visual?.background?.mode === 'gradient'
    ? { background: `linear-gradient(135deg, ${visual.background.color1}, ${visual.background.color2})` }
    : { background: visual?.background?.color1 || 'transparent' };

  const counting = timer.state === 'running' || timer.state === 'paused';
  const manualControlsLocked = targetTimeMode || counting || busy;

  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ ...bgStyle, opacity: visual?.background?.opacity ?? 1 }}
      />

      <div className="relative z-10 w-full h-full flex flex-col">
        <div className="flex flex-col gap-1.5 px-3 pt-3 pb-1.5 pointer-events-auto shrink-0">
          <div className="flex items-center gap-2 bg-black/70 backdrop-blur border border-white/10 rounded-lg p-2 shadow-lg">
            <span className="text-white text-sm font-medium whitespace-nowrap">Countdown to Time:</span>
            <input
              type="time"
              value={targetTimeValue}
              onChange={handleTargetTimeChange}
              disabled={counting || busy}
              className="bg-gray-800 text-white rounded px-2 py-1 outline-none text-sm disabled:opacity-50 flex-1 min-w-0"
            />
            {targetTimeMode && (
              <button
                onClick={handleClearTargetTime}
                disabled={counting || busy}
                title="Clear target time"
                className="text-gray-400 hover:text-white text-sm px-1.5 disabled:opacity-30"
              >
                ✕
              </button>
            )}
            <button
              onClick={handleStartTargetCountdown}
              disabled={!targetTimeMode || counting || busy}
              className="px-3 py-1.5 rounded-md text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Start
            </button>
          </div>

          <AutoCloseButton autoClose={autoClose} quitAt={quitAt} onClick={handleAutoCloseButton} />

          {update && (update.status === 'ready' || update.status === 'downloading') && (
            <UpdateBadge update={update} />
          )}
          {m3.enabled !== false && (
            <M3StatusRow status={m3} busy={busy} onToggle={handleToggleM3} />
          )}
          {obsStatus?.enabled && <ObsStatusRow status={obsStatus} note={obsNote} />}
        </div>

        <div className="flex-1 min-h-0">
          <Controller
            state={timer.state}
            minutes={timer.settings.minutes}
            seconds={timer.settings.seconds}
            onMinutesChange={manualControlsLocked ? noopNumberHandler : (m) => timer.setSettings({ ...timer.settings, minutes: m })}
            onSecondsChange={manualControlsLocked ? noopNumberHandler : (s) => timer.setSettings({ ...timer.settings, seconds: s })}
            disableTimeInputs={manualControlsLocked}
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
          >
            <TimerDisplay
              remainingMs={preroll ?? (timer.state === 'idle' ? timer.durationMs : timer.remainingMs)}
              totalMs={preroll ?? timer.totalMs}
              endsAt={preroll !== null ? 0 : timer.endsAt}
              state={preroll !== null ? 'ready' : timer.state}
              visual={visual}
              windowSize={windowSize}
              hideStatus={false}
            />
          </Controller>
        </div>
      </div>

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

// --- STAGE VIEW (TRANSPARENT WITH GPU-ACCELERATED ANIMATION) ---
function StageView() {
  const [stageState, setStageState] = useState<StageState>({
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

  const bgStyle = stageState.visual?.background?.mode === 'gradient'
    ? { background: `linear-gradient(135deg, ${stageState.visual.background.color1}, ${stageState.visual.background.color2})` }
    : { background: stageState.visual?.background?.color1 || 'transparent' };

  // Opacity + transform only: cheap to animate on a transparent always-on-top window.
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <div className="w-screen h-screen overflow-hidden flex items-center justify-center relative">
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
            <TimerDisplay
              remainingMs={stageState.remainingMs}
              totalMs={stageState.totalMs}
              endsAt={stageState.endsAt}
              state={stageState.state}
              visual={stageState.visual}
              windowSize={windowSize}
              hideStatus={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

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

function AutoCloseButton({ autoClose, quitAt, onClick }: { autoClose: boolean; quitAt: number | null; onClick: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (quitAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [quitAt]);

  if (quitAt !== null) {
    const secs = Math.max(0, Math.ceil((quitAt - now) / 1000));
    return (
      <button
        onClick={onClick}
        className="relative w-full overflow-hidden py-2 rounded-lg text-sm font-bold shadow-lg border bg-red-700/90 text-white border-red-500"
        title="Click to cancel and keep StageCountdown open"
      >
        {/* Drains over the countdown */}
        <span
          className="absolute inset-y-0 left-0 bg-red-500/50"
          style={{ width: `${Math.min(100, ((quitAt - now) / SEQUENCE.end.quitAfterShortcutMs) * 100)}%`, transition: 'width 200ms linear' }}
        />
        <span className="relative">Closing in {secs}s · click to cancel</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full py-2 rounded-lg text-sm font-bold transition-all shadow-lg border ${
        autoClose
          ? 'bg-red-600/90 text-white border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]'
          : 'bg-black/70 text-gray-300 border-white/10 hover:bg-black/80'
      }`}
    >
      {autoClose ? '✓ WILL CLOSE AFTER TIMER ENDS' : 'Close StageCountdown after Timer ends'}
    </button>
  );
}

const OBS_DOT: Record<ObsStatus['state'], string> = {
  off: 'text-gray-500',
  searching: 'text-amber-400',
  connecting: 'text-amber-400',
  connected: 'text-emerald-400',
  'auth-failed': 'text-red-400',
  error: 'text-red-400',
};

function ObsStatusRow({ status, note }: { status: ObsStatus; note: string }) {
  const ready = status.state === 'connected' && status.mediaScene && status.cameraScene;
  const text =
    status.state === 'connected'
      ? ready
        ? `Connected · ${status.cameraScene} ⇄ ${status.mediaScene}`
        : 'Connected · choose the scenes in Settings'
      : status.state === 'auth-failed'
        ? 'Wrong WebSocket password'
        : status.state === 'error'
          ? 'Could not talk to OBS'
          : 'Looking for OBS…';
  return (
    <div
      className="flex items-center gap-2 bg-black/70 backdrop-blur border border-white/10 rounded-lg px-2 py-1.5 shadow-lg text-xs text-gray-300"
      title={note || status.error}
    >
      <span className={OBS_DOT[status.state]}>●</span>
      <span className="flex-1 min-w-0 truncate">
        OBS: {text}
        {note && <span className="text-red-400"> · {note}</span>}
      </span>
    </div>
  );
}

/** The blue "Update ready" badge. Click to restart and update (the app asks first). */
function UpdateBadge({ update }: { update: UpdateInfo }) {
  if (update.status === 'downloading') {
    return (
      <div className="w-full rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
        Downloading update {update.version}… {update.percent}%
      </div>
    );
  }
  return (
    <button
      onClick={() => window.electronAPI?.updateInstall?.()}
      className="w-full rounded-lg border border-blue-400 bg-blue-600/90 px-3 py-2 text-sm font-bold text-white shadow-lg hover:bg-blue-500"
      title="Install the update and restart the app (it asks first)"
    >
      ⬆ Update {update.version} ready — click to restart and update
    </button>
  );
}

function M3StatusRow({ status, busy, onToggle }: { status: M3Status; busy: boolean; onToggle: () => void }) {
  const label =
    status.media === 'shown' ? { text: 'Showing', cls: 'text-emerald-400' }
    : status.media === 'none' ? { text: 'Not open', cls: 'text-gray-400' }
    : status.media === 'hidden' ? { text: 'Hidden', cls: 'text-amber-400' }
    : status.hidden ? { text: 'Hidden (assumed)', cls: 'text-amber-400' }
    : { text: 'Showing (assumed)', cls: 'text-emerald-400' };
  return (
    <div className="flex items-center gap-2 bg-black/70 backdrop-blur border border-white/10 rounded-lg px-2 py-1.5 shadow-lg">
      <span className="text-xs text-gray-300 flex-1 min-w-0 truncate" title={status.error ?? status.note}>
        M³ media display: <b className={label.cls}>{label.text}</b>
        {status.note && <span className="text-amber-300"> · {status.note}</span>}
        {!status.ok && <span className="text-red-400"> · {status.error ?? 'could not reach M³'}</span>}
      </span>
      <button
        onClick={onToggle}
        disabled={busy}
        title="Send M³'s Media Window shortcut now (shows it if hidden, hides it if showing)"
        className="px-2 py-1 rounded text-xs font-semibold bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
      >
        Toggle
      </button>
    </div>
  );
}

function ConfirmDialog({ message, onAnswer }: { message: string; onAnswer: (value: boolean) => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12121a] p-5 shadow-2xl">
        <p className="whitespace-pre-line text-sm text-gray-200">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => onAnswer(false)}
            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-white/10 text-gray-200 hover:bg-white/20"
          >
            No, turn it off
          </button>
          <button
            onClick={() => onAnswer(true)}
            className="px-3 py-1.5 rounded-md text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500"
          >
            Keep it on
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
