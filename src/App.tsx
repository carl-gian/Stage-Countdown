import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Controller from '@/components/Controller';
import TimerDisplay from '@/components/TimerDisplay';
import SettingsModal from '@/components/SettingsModal';
import { useCountdownTimer, saveVisualSettings } from '@/hooks/useCountdownTimer';
import { DEFAULT_VISUAL_SETTINGS, mergeVisual, type StageState, type VisualSettings } from '@/types';
import { nextOccurrence } from '@/lib/time';

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
  // Set whenever a countdown is stopped early (Stop button) while autoClose
  // was on. Consumed on the next interactive Start to ask "still want to
  // close after this one?" instead of silently carrying the setting over.
  const [pendingCloseReconfirm, setPendingCloseReconfirm] = useState(false);

  const [targetTimeMode, setTargetTimeMode] = useState(false);
  const [targetTimeValue, setTargetTimeValue] = useState('');

  // One lock for every sequence (start, complete, stop) so two M3 toggles can never overlap.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const targetAtRef = useRef(0); // absolute "Countdown to Time" target (epoch ms)
  const [m3, setM3] = useState<M3Status>({ ok: true, hidden: false });
  const [confirmRequest, setConfirmRequest] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);

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
  const [configLoaded, setConfigLoaded] = useState(false);

  // Drives the stage window's black safety-curtain during the ~1s window
  // where M3's own window is being reselected/restored after a countdown
  // ends or is stopped, so nothing flashes/glitches on the shared display
  // while that handoff happens.
  const [stageBlackout, setStageBlackout] = useState(false);

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

  useEffect(() => {
    saveVisualSettings(visual);
    if (configLoaded && window.electronAPI?.setConfig) {
      window.electronAPI.setConfig({ visual });
    }
  }, [visual, configLoaded]);

  // Sent only when something changes (not every frame). The stage runs its own clock from endsAt.
  useEffect(() => {
    const payload: StageState = {
      state: timer.state,
      totalMs: timer.totalMs,
      remainingMs: timer.state === 'running' ? 0 : timer.remainingMs,
      endsAt: timer.endsAt,
      visual,
      blackout: stageBlackout,
    };
    window.electronAPI?.syncStateToStage?.(payload);
  }, [timer.state, timer.totalMs, timer.endsAt, timer.state === 'running' ? 0 : timer.remainingMs, visual, stageBlackout]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePin = useCallback(async () => {
    const newPinned = !pinned;
    setPinned(newPinned);
    if (window.electronAPI?.setAlwaysOnTop) {
      await window.electronAPI.setAlwaysOnTop(newPinned);
    }
  }, [pinned]);

  // --- START SEQUENCE -------------------------------------------------
  // open stage window -> focus M3 + hide it (main verifies focus) -> 500ms for the stage reveal -> timer starts
  const runStartSequence = useCallback(
    async (startFn: () => void, opts?: { interactive?: boolean }) => {
      if (busyRef.current || timer.state === 'running' || timer.state === 'paused') return;
      busyRef.current = true;
      setBusy(true);
      try {
        if (opts?.interactive !== false && pendingCloseReconfirm) {
          const keep = await askConfirm(
            'The last countdown was stopped early while "Close StageCountdown after Timer ends" was on.\n\nKeep it enabled for this countdown?'
          );
          setAutoClose(keep);
          setPendingCloseReconfirm(false);
        }
        setStarting(true);
        await window.electronAPI?.openStageWindow?.();
        applyM3(await window.electronAPI?.triggerShortcut?.());
        await delay(500);
        startFn();
      } finally {
        busyRef.current = false;
        setBusy(false);
        setStarting(false);
      }
    },
    [timer.state, pendingCloseReconfirm, askConfirm, applyM3]
  );

  const handleStart = useCallback(() => {
    runStartSequence(() => timer.start());
  }, [runStartSequence, timer]);

  const handleRestart = useCallback(() => {
    setTargetTimeMode(false);
    setTargetTimeValue('');
    runStartSequence(() => timer.restart());
  }, [runStartSequence, timer]);

  // Scheduled auto-timer fires unattended — never a blocking dialog for it.
  useEffect(() => {
    if (!window.electronAPI?.onScheduledStart) return;
    const unsubscribe = window.electronAPI.onScheduledStart(({ durationMinutes }: { durationMinutes: number }) => {
      if (timer.state === 'running') return;
      setTargetTimeMode(false);
      setTargetTimeValue('');
      const minutes = durationMinutes ?? 5;
      timer.setSettings({ minutes, seconds: 0 });
      runStartSequence(() => timer.start(minutes * 60_000), { interactive: false });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.state, runStartSequence]);

  // --- END SEQUENCE, natural completion ---------------------------------
  // heartbeat (1.4s) -> fade stage to black (500ms) -> close stage -> restore M3 -> optional quit
  const runCompletionSequence = useCallback(
    async (closeAfter: boolean) => {
      busyRef.current = true;
      setBusy(true);
      try {
        await delay(1400);
        setStageBlackout(true);
        await delay(500);
        await window.electronAPI?.closeStageWindow?.();
        setStageBlackout(false);
        applyM3(await window.electronAPI?.selectAndSignalM3?.());
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      if (closeAfter) window.electronAPI?.closeApp?.();
    },
    [applyM3]
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

  // --- STOP SEQUENCE (user-cancelled): never quits; asks about auto-close again on the next Start ---
  const handleStop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const wasAutoClose = autoClose;
      timer.stop();
      setTargetTimeMode(false);
      setTargetTimeValue('');
      if (wasAutoClose) setPendingCloseReconfirm(true);

      setStageBlackout(true);
      await delay(500);
      await window.electronAPI?.closeStageWindow?.();
      setStageBlackout(false);
      applyM3(await window.electronAPI?.selectAndSignalM3?.());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [timer, autoClose, applyM3]);

  const handleSetNewTime = useCallback(() => {
    handleStop();
  }, [handleStop]);

  const handleToggleM3 = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      applyM3(await window.electronAPI?.toggleM3?.());
    } finally {
      busyRef.current = false;
      setBusy(false);
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

    // Preview only: the real duration is worked out when Start is pressed.
    const diffMs = nextOccurrence(value, new Date()).getTime() - Date.now();
    const totalSeconds = Math.floor(diffMs / 1000);
    timer.setSettings({ ...timer.settings, minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60 });
    setTargetTimeMode(true);
  };

  const handleClearTargetTime = useCallback(() => {
    setTargetTimeValue('');
    setTargetTimeMode(false);
  }, []);

  // The countdown must END at the target: fix the target now, then size the timer after the
  // start sequence (which takes ~1.5s) so none of that time is lost.
  const handleStartTargetCountdown = useCallback(() => {
    if (!targetTimeMode || !targetTimeValue) return;
    targetAtRef.current = nextOccurrence(targetTimeValue, new Date()).getTime();
    runStartSequence(() => timer.start(Math.max(1000, targetAtRef.current - Date.now())));
  }, [targetTimeMode, targetTimeValue, runStartSequence, timer]);

  const noopNumberHandler = useCallback(() => {}, []);

  const bgStyle = visual?.background?.mode === 'gradient'
    ? { background: `linear-gradient(135deg, ${visual.background.color1}, ${visual.background.color2})` }
    : { background: visual?.background?.color1 || 'transparent' };

  const manualControlsLocked = targetTimeMode || timer.state === 'running' || starting || busy;

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
              disabled={timer.state === 'running' || starting || busy}
              className="bg-gray-800 text-white rounded px-2 py-1 outline-none text-sm disabled:opacity-50 flex-1 min-w-0"
            />
            {targetTimeMode && (
              <button
                onClick={handleClearTargetTime}
                disabled={timer.state === 'running' || starting || busy}
                title="Clear target time"
                className="text-gray-400 hover:text-white text-sm px-1.5 disabled:opacity-30"
              >
                ✕
              </button>
            )}
            <button
              onClick={handleStartTargetCountdown}
              disabled={!targetTimeMode || timer.state === 'running' || starting || busy}
              className="px-3 py-1.5 rounded-md text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Start
            </button>
          </div>

          <button
            onClick={() => setAutoClose(!autoClose)}
            className={`w-full py-2 rounded-lg text-sm font-bold transition-all shadow-lg border ${
              autoClose
                ? 'bg-red-600/90 text-white border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]'
                : 'bg-black/70 text-gray-300 border-white/10 hover:bg-black/80'
            }`}
          >
            {autoClose ? '✓ WILL CLOSE AFTER TIMER ENDS' : 'Close StageCountdown after Timer end'}
          </button>
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
            starting={starting}
          >
            <TimerDisplay
              remainingMs={timer.state === 'idle' ? timer.durationMs : timer.remainingMs}
              totalMs={timer.totalMs}
              endsAt={timer.endsAt}
              state={timer.state}
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
    state: 'idle',
    totalMs: 0,
    remainingMs: 0,
    endsAt: 0,
    visual: DEFAULT_VISUAL_SETTINGS,
    blackout: false,
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

  const isActive = stageState.state === 'running' || stageState.state === 'paused' || stageState.state === 'complete';

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

      {/* Black safety curtain while M3's window is being restored after a countdown ends or is stopped. */}
      <motion.div
        className="absolute inset-0 bg-black pointer-events-none"
        initial={false}
        animate={{ opacity: stageState.blackout ? 1 : 0 }}
        transition={{ duration: 0.5, ease }}
        style={{ zIndex: 20 }}
      />
    </div>
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
