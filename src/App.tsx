import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Controller, { type Phase } from '@/components/Controller';
import TimerDisplay from '@/components/TimerDisplay';
import SettingsModal from '@/components/SettingsModal';
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

  const askConfirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setConfirmRequest({ message, resolve })),
    []
  );

  const applyM3 = useCallback((status?: M3Status) => {
    if (status) setM3(status);
  }, []);

  useEffect(() => {
    window.electronAPI?.getM3State?.().then(applyM3).catch(() => {});
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
      } finally {
        busyRef.current = false;
        setPhase(null);
      }
    },
    [timer, pendingCloseReconfirm, askConfirm, applyM3]
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

  /** Shared tail of END and STOP: black -> show M3 (on top of us) -> close our window behind it. */
  const handBackToM3 = useCallback(
    async (fadeMs: number, closeAfterMs: number) => {
      setCurtain({ on: true, ms: fadeMs });
      await delay(fadeMs);
      applyM3(await window.electronAPI?.selectAndSignalM3?.());
      const shortcutAt = Date.now();
      await delay(closeAfterMs);
      await window.electronAPI?.closeStageWindow?.();
      setStageShowsTimer(false);
      setCurtain({ on: false, ms: 0 });
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
        await skippableDelay(e.holdZeroMs);
        setPhase({ kind: 'returning' });
        shortcutAt = await handBackToM3(e.fadeToBlackMs, e.closeAfterShortcutMs);
      } finally {
        busyRef.current = false;
        setPhase(null);
      }
      if (closeAfter) setQuitAt(shortcutAt + e.quitAfterShortcutMs);
    },
    [handBackToM3, skippableDelay]
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
      if (autoClose) setPendingCloseReconfirm(true);
      timer.stop();
      setStageShowsTimer(false); // timer fades out while the curtain fades in
      setTargetTimeMode(false);
      setTargetTimeValue('');
      await handBackToM3(SEQUENCE.stop.fadeToBlackMs, SEQUENCE.stop.closeAfterShortcutMs);
    } finally {
      busyRef.current = false;
      setPhase(null);
    }
  }, [timer, autoClose, handBackToM3]);

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

  const handleFlipM3Label = useCallback(async () => {
    applyM3(await window.electronAPI?.setM3State?.(!m3.hidden));
  }, [m3.hidden, applyM3]);

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

          <M3StatusRow status={m3} busy={busy} onToggle={handleToggleM3} onFlip={handleFlipM3Label} />
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
      />
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

function M3StatusRow({
  status,
  busy,
  onToggle,
  onFlip,
}: {
  status: M3Status;
  busy: boolean;
  onToggle: () => void;
  onFlip: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-black/70 backdrop-blur border border-white/10 rounded-lg px-2 py-1.5 shadow-lg">
      <span className="text-xs text-gray-300 flex-1 min-w-0 truncate" title={status.error}>
        M³ media: <b className={status.hidden ? 'text-amber-400' : 'text-emerald-400'}>{status.hidden ? 'Hidden' : 'Shown'}</b>
        {!status.ok && <span className="text-red-400"> · {status.error ?? 'could not reach M³'}</span>}
      </span>
      <button
        onClick={onToggle}
        disabled={busy}
        title="Send M³'s hide/show shortcut now"
        className="px-2 py-1 rounded text-xs font-semibold bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
      >
        Toggle
      </button>
      <button
        onClick={onFlip}
        disabled={busy}
        title="Only fix this label (use if M³ was changed by hand); sends nothing"
        className="px-2 py-1 rounded text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30"
      >
        Fix label
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
