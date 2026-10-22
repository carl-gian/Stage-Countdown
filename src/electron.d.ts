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
