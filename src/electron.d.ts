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
    moveToDisplay: (displayId: number) => Promise<boolean>;
  };
}
