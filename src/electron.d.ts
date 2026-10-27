interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

interface M3Status {
  ok: boolean;
  /** What M³'s MEDIA window ("Media Player - M³") is doing right now. */
  media?: 'shown' | 'hidden' | 'none' | 'unknown';
  /** A short, temporary message, e.g. when the guard had to hide M³ again. */
  note?: string;
  /** False when the M³ hand-off is switched off (standalone countdown). */
  enabled?: boolean;
  hidden: boolean;
  error?: string;
}

interface ObsStatus {
  enabled: boolean;
  state: 'off' | 'searching' | 'connecting' | 'connected' | 'auth-failed' | 'error';
  port: number;
  hasPassword: boolean;
  scenes: string[];
  mediaScene: string;
  cameraScene: string;
  /** What OBS goes back to when the countdown ends or stops. */
  returnMode: 'camera' | 'previous';
  /** The scene OBS was on before the countdown (only while a countdown has it switched away). */
  previousScene: string;
  version: string;
  error: string;
  /** The OBS custom browser dock server (runs only while OBS switching is on). */
  dock: { running: boolean; port: number; url: string; error: string };
}

interface UpdateInfo {
  status: 'disabled' | 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error';
  version: string;
  percent: number;
  /** Why updates are off: development run or the portable build. */
  reason: '' | 'dev' | 'portable';
}

interface AppInfo {
  version: string;
  launch: 'first-run' | 'updated' | 'normal';
  lastSeenVersion: string;
  isPackaged: boolean;
  platform: string;
  update: UpdateInfo;
}

/** A command from the OBS dock (the same actions as the main window's buttons). */
interface DockCommand {
  action: 'start' | 'startAt' | 'setTime' | 'pause' | 'resume' | 'stop' | 'restart' | 'skip';
  minutes?: number;
  seconds?: number;
  time?: string;
}

interface ObsSwitchResult {
  ok: boolean;
  skipped?: boolean;
  alreadyThere?: boolean;
  error?: string;
}

interface Window {
  electronAPI: {
    setAlwaysOnTop: (pinned: boolean) => Promise<boolean>;
    getDisplays: () => Promise<DisplayInfo[]>;
    moveToDisplay: (displayId: number | string) => Promise<boolean>;
    syncStateToStage: (state: unknown) => void;
    onUpdateStageState: (callback: (data: Partial<import('./types').StageState>) => void) => () => void;
    openStageWindow: () => Promise<boolean>;
    triggerShortcut: () => Promise<M3Status>;
    selectAndSignalM3: () => Promise<M3Status>;
    toggleM3: () => Promise<M3Status>;
    getM3State: () => Promise<M3Status>;
    /** While a countdown runs: keep M³'s media display hidden (the app re-sends the shortcut if it comes back). */
    setM3Guard: (on: boolean) => Promise<boolean>;
    onM3Status: (callback: (status: M3Status) => void) => () => void;
    getAppInfo: () => Promise<AppInfo>;
    ackVersion: () => Promise<boolean>;
    updateGetStatus: () => Promise<UpdateInfo>;
    updateCheck: () => Promise<UpdateInfo>;
    updateInstall: () => Promise<void>;
    openLogs: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    pushDockState: (state: unknown) => void;
    onUpdateStatus: (callback: (info: UpdateInfo) => void) => () => void;
    onDockCommand: (callback: (cmd: DockCommand) => void) => () => void;
    onOpenHelp: (callback: (topic: string) => void) => () => void;
    onAppSettingsChanged: (callback: (patch: { autoLaunch?: boolean; startMinimized?: boolean }) => void) => () => void;
    obsGetStatus: () => Promise<ObsStatus>;
    obsSaveSettings: (settings: {
      enabled: boolean;
      port: number;
      /** Omit to keep the saved password; '' clears it. */
      password?: string;
      mediaScene: string;
      cameraScene: string;
      returnMode: 'camera' | 'previous';
    }) => Promise<ObsStatus>;
    obsRefresh: () => Promise<ObsStatus>;
    obsSwitch: (kind: 'media' | 'return', fadeMs: number) => Promise<ObsSwitchResult>;
    onObsStatus: (callback: (status: ObsStatus) => void) => () => void;
    closeStageWindow: () => Promise<boolean>;
    closeApp: () => Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getConfig: () => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConfig: (patch: Record<string, unknown>) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getAppSettings: () => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAppSettings: (settings: unknown) => Promise<any>;
    onScheduledStart: (callback: (data: { durationMinutes: number }) => void) => () => void;
  };
}
