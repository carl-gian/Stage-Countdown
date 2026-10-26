interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

interface M3Status {
  ok: boolean;
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
  version: string;
  error: string;
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
    setM3State: (hidden: boolean) => Promise<M3Status>;
    obsGetStatus: () => Promise<ObsStatus>;
    obsSaveSettings: (settings: {
      enabled: boolean;
      port: number;
      /** Omit to keep the saved password; '' clears it. */
      password?: string;
      mediaScene: string;
      cameraScene: string;
    }) => Promise<ObsStatus>;
    obsRefresh: () => Promise<ObsStatus>;
    obsSwitch: (kind: 'media' | 'camera', fadeMs: number) => Promise<ObsSwitchResult>;
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
