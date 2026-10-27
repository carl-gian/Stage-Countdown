// The in-app Help guide. Plain data so it is easy to edit; rendered by components/HelpModal.tsx.
// Keep it short and written for the person running the stage display, not for a developer.

export interface HelpSection {
  heading?: string;
  paragraphs?: string[];
  steps?: string[];
  tip?: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  sections: HelpSection[];
}

export const DOCK_URL = 'http://127.0.0.1:4578/dock';

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'start',
    title: 'Quick start',
    summary: 'Run your first countdown in a minute.',
    sections: [
      {
        paragraphs: [
          'Stage Countdown puts a big countdown on a screen the audience (or the stage) can see. It works on its own, and it can also work together with Meeting Media Manager (M³) and OBS. Everything beyond the basics is optional.',
        ],
      },
      {
        heading: 'Run a countdown',
        steps: [
          'Open Settings (the gear) and, under Display, choose the screen the countdown should appear on. "Automatic" picks a screen other than this controller\'s.',
          'Set the minutes and seconds in the controller, or use "Countdown to Time" to finish exactly at a clock time (for example 18:30).',
          'Press Start. The stage screen goes black, the timer fades in showing the full time, and a couple of seconds later it starts counting.',
          'Use Pause / Resume / Stop whenever you need to. When the time is up, 00:00 stays on screen for 10 seconds, then the screen fades to black and closes.',
        ],
        tip: 'Colours, ring, glow, font size and the clock format are all in Settings and change live, so you can see them on the preview first.',
      },
      {
        heading: 'Good to know',
        paragraphs: [
          'Closing or minimizing the window does not quit the app: it keeps running in the tray (the small icon by the clock). Click the tray icon to bring it back, or use Quit from the tray menu.',
          'Press F1 or the ? button any time to open this guide.',
        ],
      },
    ],
  },
  {
    id: 'standalone',
    title: 'Without M³',
    summary: 'Use it as a plain countdown, with nothing else installed.',
    sections: [
      {
        paragraphs: [
          'If you do not use Meeting Media Manager, turn its hand-off off. The app then never sends any keyboard shortcut and never touches other programs: it is just a countdown on your chosen screen.',
        ],
      },
      {
        heading: 'Set it up',
        steps: [
          'Open Settings > Meeting Media Manager (M³) and switch "Control M³\'s media window" off.',
          'The "M³ media" row on the controller disappears. Nothing else changes: you still get the same fade in and fade out.',
          'Choose the display in Settings and press Start.',
        ],
        tip: 'You can turn it back on at any time. Your shortcut and other settings are kept.',
      },
    ],
  },
  {
    id: 'm3',
    title: 'With M³',
    summary: 'Hide M³\'s media display during the countdown and bring it back after.',
    sections: [
      {
        paragraphs: [
          'M³ shows media (songs, pictures, videos) on a second screen. The countdown uses that same screen, so Stage Countdown tells M³ to hide its media window, shows the timer there, and then gives the screen back to M³ when the timer ends.',
          'M³ cannot be asked directly. Instead the app sends M³ the same keyboard shortcut you would press: M³\'s "Media Window" shortcut, which opens or closes the media window.',
          'M³ has two windows. The app watches the one the audience sees, "Media Player - M³", and checks it for real: before and after every shortcut it looks at whether that window is showing and tries again if the shortcut did not work. If M³ still ignores the shortcut, the app hides (and later shows) M³\'s media display directly, so it can never stay on top of the timer. Before pressing the shortcut the app selects M³\'s own controller window ("Meeting media - M³") so the key press reaches M³; that window is never used to decide whether M³ is showing.',
        ],
      },
      {
        heading: 'One-time setup in M³',
        steps: [
          'In M³ open Settings > Interface & Shortcuts and turn on "Enable Keyboard Shortcuts".',
          'Set the "Media Window" shortcut to a combination you do not use for anything else, for example Shift + Alt + F3. It should be a global shortcut (works even when M³ is not in front).',
        ],
      },
      {
        heading: 'Then in Stage Countdown',
        steps: [
          'Open Settings > Meeting Media Manager (M³), make sure "Control M³\'s media window" is on, and press the Shortcut box and type the very same combination.',
          'Start M³ and open its media window, so that it is showing on the screen you chose.',
          'Press Start. Watch the "M³ media" row on the controller: it says Hidden while the timer is up and Shown again afterwards.',
        ],
        tip: 'The "M³ Media Display" badge always shows what M³\'s media window is really doing (Shown or Hidden), refreshed every couple of seconds. "Toggle" sends the shortcut now.',
      },
      {
        heading: 'While the countdown runs',
        paragraphs: [
          'From the moment the countdown starts until it ends or you press Stop, the app keeps an eye on M³\'s media display. If it ever comes back on top of the timer (for example M³ shows a song or a picture), the app sends the shortcut again to hide it, and the row says "M³ was showing on top of the timer — hid it again". If you really need M³ on screen, press Stop first.',
          'When the countdown ends (or you press Stop) the way back is deliberately gentle: the timer window fades to black and stays black for 3 seconds, then the shortcut brings M³\'s media display back so it fades in over the black, the timer window closes behind it, and (with OBS on) OBS fades back one second later. The app only brings M³ back if it was the one that hid it.',
          'For the smoothest result turn on M³\'s own fade: M³ Settings > "Enable Media Window Fade Transitions".',
        ],
      },
      {
        heading: 'Is the shortcut working? Press "Test"',
        steps: [
          'Open M³ and its media window.',
          'In Stage Countdown open Settings > Meeting Media Manager (M³) and press "Test the shortcut". It presses the shortcut once, checks whether M³\'s media display really changed, and puts it back.',
          'Green means the shortcut works. Amber means M³ ignored it but the direct method works (the app will use that); the message lists what to check in M³. Red means neither worked.',
        ],
        tip: 'M³ ignores its shortcuts while one of its own dialogs is open, and the shortcut must be exactly the same as in M³ (Interface & Shortcuts > Media Window, with keyboard shortcuts turned on).',
      },
      {
        heading: 'If it does not work',
        paragraphs: [
          'Red text next to the "M³ Media Display" badge says what failed, for example that the media display is still showing after the shortcut was sent. Check that the shortcut matches in both programs, that keyboard shortcuts are switched on in M³, and that M³ is open. The countdown itself always runs, even if M³ could not be reached.',
        ],
      },
    ],
  },
  {
    id: 'obs',
    title: 'With OBS (Zoom)',
    summary: 'Let Zoom participants see the timer too, with smooth fades.',
    sections: [
      {
        paragraphs: [
          'Optional. If your meeting goes out through OBS to Zoom, OBS decides what participants see. With this on, a moment after the countdown starts OBS fades to your Media Display scene (the one that shows the timer screen), and once the countdown has ended and M³\'s media display is back, it fades back to your Camera scene, or to the scene OBS was on before. Nobody has to switch scenes by hand.',
        ],
      },
      {
        heading: 'Set up OBS',
        steps: [
          'In OBS open Tools > WebSocket Server Settings. Tick "Enable WebSocket server". Note the port (4455 by default). If you set a password, remember it.',
          'Make a scene that shows the stage countdown screen (for example a Display Capture of that screen). This is your Media Display scene.',
          'Keep your normal camera scene as the Camera scene.',
        ],
      },
      {
        heading: 'Set up Stage Countdown',
        steps: [
          'Open Settings > OBS Scene Switching and switch it on.',
          'Enter the same port and password. When OBS is detected the status turns green ("Connected to OBS") and your scenes appear.',
          'Choose the Media Display scene and the Camera scene. Or, under "When the countdown ends or stops, OBS goes back to", pick "The scene OBS was on before the countdown": the app then remembers whatever scene OBS was on when the countdown took over and returns to it (the Camera scene becomes a fallback).',
          'Press Start. About a second after the timer begins counting, OBS fades to the Media Display scene (1.2 seconds). When the countdown ends or you press Stop, the timer window fades to black, M³\'s media display comes back, and one second later OBS fades back (2 seconds): going back is always the last step.',
        ],
        tip: 'Turning this on also makes the app start with Windows, hidden in the tray, so scene switching and the dock are ready without anyone opening it. You can turn that off in Settings > Startup & Schedule.',
      },
      {
        heading: 'Good to know',
        paragraphs: [
          'The app keeps looking for OBS every few seconds, so you can open OBS before or after it. If the password is wrong it says so. OBS Studio Mode works too, and your own transition settings are put back afterwards. If OBS cannot be reached the countdown still runs; the "OBS:" row on the controller shows the problem.',
          'Closing the app during a countdown also sends OBS back. If you move OBS to a different scene yourself during the countdown, "previous scene" mode leaves your choice alone.',
        ],
      },
    ],
  },
  {
    id: 'dock',
    title: 'The OBS dock',
    summary: 'Control the timer from a panel inside OBS.',
    sections: [
      {
        paragraphs: [
          'When OBS scene switching is on, the app also offers a small control panel you can dock inside OBS. It does exactly what the main window does: set the minutes and seconds, or a clock time to finish at, then Start, Pause, Resume, Restart or Stop. It also shows the countdown, the clock, and the M³, OBS and update status.',
        ],
      },
      {
        heading: 'Add the dock to OBS (once)',
        steps: [
          'In OBS open View > Docks > Custom Browser Docks.',
          'Type "Stage Countdown" as the Dock Name and paste this address as the URL: http://127.0.0.1:4578/dock (Settings > OBS Scene Switching has a Copy button).',
          'Click Apply. The dock appears in OBS: drag it wherever you like, or click its title bar to float it.',
        ],
        tip: 'The dock only works while Stage Countdown is running (it can be hidden in the tray). It listens only on this PC.',
      },
    ],
  },
  {
    id: 'tray',
    title: 'Tray, startup & updates',
    summary: 'Keep it running quietly, and stay up to date.',
    sections: [
      {
        heading: 'The tray',
        paragraphs: [
          'Closing the window (X) or minimizing it hides the app to the tray instead of quitting, so scheduled countdowns, OBS switching and the dock keep working. Click the tray icon to show or hide the window. To really quit, right-click the tray icon and choose Quit.',
        ],
      },
      {
        heading: 'Start with Windows',
        paragraphs: [
          'In Settings > Startup & Schedule you can start the app with Windows and start it hidden in the tray. Both are switched on for you when OBS scene switching is turned on. You can also schedule up to two automatic countdowns per day.',
        ],
      },
      {
        heading: 'Updates',
        paragraphs: [
          'The app checks for a new version each time it starts (and every few hours while it stays open) and downloads it quietly. It never restarts by itself during a meeting: when it is ready a blue "Update ready" badge appears at the top, Windows shows a notification, and the tray menu offers "Restart to update". Click any of them when you are ready, or it installs the next time you quit.',
          'After an update the app opens once and shows what is new. The portable version cannot update itself; use the installer version for automatic updates.',
        ],
      },
    ],
  },
  {
    id: 'trouble',
    title: 'Troubleshooting',
    summary: 'Quick answers.',
    sections: [
      {
        heading: 'Nothing shows on the stage screen',
        paragraphs: ['Check Settings > Display. "Automatic" uses a screen other than the controller\'s; if you only have one screen, pick it explicitly. The countdown window never takes focus and clicks pass through it.'],
      },
      {
        heading: 'M³ does not hide or show',
        paragraphs: ['See "With M³": the shortcut must be identical in both apps, M³ must be open, and keyboard shortcuts must be enabled in M³. The red message in the "M³ media" row names the problem.'],
      },
      {
        heading: 'OBS is not detected',
        paragraphs: ['OBS must be open with Tools > WebSocket Server Settings > Enable on, and the same port and password. The app retries every few seconds; press Refresh in Settings to look again.'],
      },
      {
        heading: 'Something else',
        paragraphs: ['Open the tray menu and choose "Open logs folder" to see what the app recorded, and include that file when asking for help.'],
      },
    ],
  },
];
