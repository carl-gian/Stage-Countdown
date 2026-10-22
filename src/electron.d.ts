interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

interface Window {
  electronAPI: {
    setAlwaysOnTop: (pinned: boolean) => Promise<boolean>;
    getDisplays: () => Promise<DisplayInfo[]>;
    moveToDisplay: (displayId: number | string) => Promise<boolean>;
    syncStateToStage: (state: unknown) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdateStageState: (callback: (data: any) => void) => () => void;
    triggerShortcut: () => Promise<boolean>;
    selectAndSignalM3: () => Promise<boolean>;
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
