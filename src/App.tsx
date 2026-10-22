import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Controller from '@/components/Controller';
import TimerDisplay from '@/components/TimerDisplay';
import SettingsModal from '@/components/SettingsModal';
import { useCountdownTimer, saveVisualSettings } from '@/hooks/useCountdownTimer';
import { DEFAULT_VISUAL_SETTINGS, type VisualSettings } from '@/types';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function safeLoadVisualSettings(): VisualSettings {
  try {
    const raw = window.localStorage.getItem('stagecountdown:visual');
    if (!raw) return DEFAULT_VISUAL_SETTINGS;
    const saved = JSON.parse(raw);
    const merged: any = { ...DEFAULT_VISUAL_SETTINGS };
    for (const key of Object.keys(DEFAULT_VISUAL_SETTINGS as any)) {
      merged[key] = {
        ...(DEFAULT_VISUAL_SETTINGS as any)[key],
        ...(saved && typeof saved[key] === 'object' ? saved[key] : {}),
      };
    }
    return merged as VisualSettings;
  } catch {
    return DEFAULT_VISUAL_SETTINGS;
  }
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

  const isStartingRef = useRef(false);
  const [starting, setStarting] = useState(false);
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
        if (config?.visual) {
          const merged: any = { ...DEFAULT_VISUAL_SETTINGS };
          for (const key of Object.keys(DEFAULT_VISUAL_SETTINGS as any)) {
            merged[key] = {
              ...(DEFAULT_VISUAL_SETTINGS as any)[key],
              ...(config.visual[key] || {}),
            };
          }
          setVisual(merged as VisualSettings);
        }
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

  useEffect(() => {
    if (window.electronAPI?.syncStateToStage) {
      window.electronAPI.syncStateToStage({
        remainingMs: timer.remainingMs,
        totalMs: timer.totalMs,
        progress: timer.progress,
        state: timer.state,
        visual: visual,
        blackout: stageBlackout,
      });
    }
  }, [timer.remainingMs, timer.totalMs, timer.progress, timer.state, visual, stageBlackout]);

  const togglePin = useCallback(async () => {
    const newPinned = !pinned;
    setPinned(newPinned);
    if (window.electronAPI?.setAlwaysOnTop) {
      await window.electronAPI.setAlwaysOnTop(newPinned);
    }
  }, [pinned]);

  // --- START SEQUENCE (steps 1, 2, 3, 9) ------------------------------
  // 1: main.cjs selects M3's window (holds 500ms)
  // 2: main.cjs sends the hide/show shortcut (holds 500ms)
  //    — trigger-shortcut only resolves once both of the above are truly
  //      done, not just fired.
  // 3: give the stage's 500ms reveal transition room to play
  // 9: the timer actually starts
  const runStartSequence = useCallback(
    async (startFn: () => void, opts?: { interactive?: boolean }) => {
      if (isStartingRef.current || timer.state === 'running') return;

      const interactive = opts?.interactive !== false;
      if (interactive && pendingCloseReconfirm) {
        const keep = window.confirm(
          'The last countdown was stopped early while "Close StageCountdown after Timer ends" was on.\n\nKeep it enabled for this countdown?'
        );
        setAutoClose(keep);
        setPendingCloseReconfirm(false);
      }

      isStartingRef.current = true;
      setStarting(true);

      if (window.electronAPI?.triggerShortcut) {
        await window.electronAPI.triggerShortcut(); // steps 1 + 2
      }
      await delay(500); // step 3

      startFn(); // step 9
      isStartingRef.current = false;
      setStarting(false);
    },
    [timer.state, pendingCloseReconfirm]
  );

  const handleStart = useCallback(() => {
    runStartSequence(() => timer.start());
  }, [runStartSequence, timer]);

  const handleRestart = useCallback(() => {
    setTargetTimeMode(false);
    setTargetTimeValue('');
    runStartSequence(() => timer.restart());
  }, [runStartSequence, timer]);

  // Scheduled auto-timer fires unattended — never pop a blocking confirm()
  // for it, so it's explicitly non-interactive.
  useEffect(() => {
    if (!window.electronAPI?.onScheduledStart) return;
    const unsubscribe = window.electronAPI.onScheduledStart(({ durationMinutes }: { durationMinutes: number }) => {
      if (timer.state === 'running') return;
      setTargetTimeMode(false);
      setTargetTimeValue('');
      timer.setSettings({ ...timer.settings, minutes: durationMinutes ?? 5, seconds: 0 });
      runStartSequence(() => timer.start(), { interactive: false });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.state, runStartSequence]);

  // --- END SEQUENCE, natural completion (steps 4, 5, 1, 2, then 6 or 7) --
  const runCompletionSequence = useCallback(async (closeAfter: boolean) => {
    // Step 4: let the heartbeat pulse (driven by state === 'complete' in
    // TimerDisplay) actually play for a beat before cutting away.
    await delay(1400);

    // Step 5: fade the stage to black, then close its window outright —
    // no more fading back to transparent and leaving it open.
    setStageBlackout(true);
    await delay(500);
    if (window.electronAPI?.closeStageWindow) {
      window.electronAPI.closeStageWindow();
    }
    setStageBlackout(false);

    // Steps 1 & 2 again: reselect M3 and toggle its Yeartext back on. The
    // stage window is already closed at this point, so this uses the
    // window-agnostic call rather than trigger-shortcut.
    if (window.electronAPI?.selectAndSignalM3) {
      await window.electronAPI.selectAndSignalM3();
    }

    if (closeAfter) {
      if (window.electronAPI?.closeApp) window.electronAPI.closeApp(); // step 7
    }
    // else: step 6 — controller just sits idle, nothing further to do.
  }, []);

  const prevTimerState = useRef(timer.state);
  useEffect(() => {
    if (prevTimerState.current === 'running' && timer.state === 'complete') {
      setTargetTimeMode(false);
      setTargetTimeValue('');
      runCompletionSequence(autoClose);
    }
    prevTimerState.current = timer.state;
  }, [timer.state, autoClose, runCompletionSequence]);

  // --- STOP SEQUENCE, user-cancelled mid-timer (steps 10, 5, 1, 2, 6) ----
  // Always ends at 6 (idle) regardless of autoClose — stopping never
  // closes the app. If autoClose was on, remember to ask about it again
  // on the next Start instead.
  const handleStop = useCallback(async () => {
    const wasAutoClose = autoClose;
    timer.stop(); // step 10
    setTargetTimeMode(false);
    setTargetTimeValue('');
    if (wasAutoClose) setPendingCloseReconfirm(true);

    setStageBlackout(true); // step 5 (fade)
    await delay(500);
    if (window.electronAPI?.closeStageWindow) {
      window.electronAPI.closeStageWindow(); // step 5 (close, no wait)
    }
    setStageBlackout(false);

    if (window.electronAPI?.selectAndSignalM3) {
      await window.electronAPI.selectAndSignalM3(); // steps 1 + 2
    }
    // step 6 — idle, always (stopping never closes the app)
  }, [timer, autoClose]);

  const handleSetNewTime = useCallback(() => {
    handleStop();
  }, [handleStop]);

  const handleTargetTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTargetTimeValue(value);

    if (!value) {
      setTargetTimeMode(false);
      return;
    }

    const [hours, minutes] = value.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    if (target.getTime() < now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const diffMs = target.getTime() - now.getTime();
    const totalSeconds = Math.floor(diffMs / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;

    timer.setSettings({ ...timer.settings, minutes: m, seconds: s });
    setTargetTimeMode(true);
  };

  const handleClearTargetTime = useCallback(() => {
    setTargetTimeValue('');
    setTargetTimeMode(false);
  }, []);

  const handleStartTargetCountdown = useCallback(() => {
    if (!targetTimeMode) return;
    handleStart();
  }, [targetTimeMode, handleStart]);

  const noopNumberHandler = useCallback(() => {}, []);

  const bgStyle = visual?.background?.mode === 'gradient'
    ? { background: `linear-gradient(135deg, ${visual.background.color1}, ${visual.background.color2})` }
    : { background: visual?.background?.color1 || 'transparent' };

  const manualControlsLocked = targetTimeMode || timer.state === 'running' || starting;

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
              disabled={timer.state === 'running' || starting}
              className="bg-gray-800 text-white rounded px-2 py-1 outline-none text-sm disabled:opacity-50 flex-1 min-w-0"
            />
            {targetTimeMode && (
              <button
                onClick={handleClearTargetTime}
                disabled={timer.state === 'running' || starting}
                title="Clear target time"
                className="text-gray-400 hover:text-white text-sm px-1.5 disabled:opacity-30"
              >
                ✕
              </button>
            )}
            <button
              onClick={handleStartTargetCountdown}
              disabled={!targetTimeMode || timer.state === 'running' || starting}
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
              remainingMs={timer.remainingMs}
              totalMs={timer.totalMs}
              progress={timer.progress}
              state={timer.state}
              visual={visual}
              windowSize={windowSize}
              hideStatus={false}
            />
          </Controller>
        </div>
      </div>

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
  const [stageState, setStageState] = useState({
    remainingMs: 0,
    totalMs: 0,
    progress: 1,
    state: 'idle',
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
    if (window.electronAPI?.onUpdateStageState) {
      const unsubscribe = window.electronAPI.onUpdateStageState((data: any) => {
        setStageState(prev => ({
          ...prev,
          ...data,
          visual: {
            ...DEFAULT_VISUAL_SETTINGS,
            ...prev.visual,
            ...(data.visual || {})
          }
        }));
      });
      return () => unsubscribe();
    }
  }, []);

  const isActive = stageState.state === 'running' || stageState.state === 'paused' || stageState.state === 'complete';

  const bgStyle = stageState.visual?.background?.mode === 'gradient'
    ? { background: `linear-gradient(135deg, ${stageState.visual.background.color1}, ${stageState.visual.background.color2})` }
    : { background: stageState.visual?.background?.color1 || 'transparent' };

  return (
    <div className="w-screen h-screen overflow-hidden flex items-center justify-center relative">
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={bgStyle}
        initial={false}
        animate={{ opacity: isActive ? (stageState.visual?.background?.opacity ?? 1) : 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      />

      <AnimatePresence mode="wait">
        {isActive && (
          <motion.div
            key="stage-timer"
            initial={{ opacity: 0, scale: 0.6, clipPath: 'circle(0% at 50% 50%)' }}
            animate={{ opacity: 1, scale: 1, clipPath: 'circle(100% at 50% 50%)' }}
            exit={{ opacity: 0, scale: 0.6, clipPath: 'circle(0% at 50% 50%)' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex items-center justify-center p-8 rounded-full"
            style={{ willChange: 'transform, opacity, clip-path' }}
          >
            <TimerDisplay
              remainingMs={stageState.remainingMs}
              totalMs={stageState.totalMs}
              progress={stageState.progress}
              state={stageState.state}
              visual={stageState.visual}
              windowSize={windowSize}
              hideStatus={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Black safety curtain — covers the reveal while M3's own window is
          being reselected/restored after a countdown ends or is stopped,
          so the handoff back to M3 never flashes or glitches. */}
      <motion.div
        className="absolute inset-0 bg-black pointer-events-none"
        initial={false}
        animate={{ opacity: stageState.blackout ? 1 : 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ zIndex: 20 }}
      />
    </div>
  );
}

export default App;
