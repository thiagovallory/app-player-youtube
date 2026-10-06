import { join } from "node:path";
import { BrowserWindow } from "electron";
import type { DisplayInfo } from "../shared/types";

function webPreferences(preload?: string) {
  return {
    ...(preload
      ? { preload: join(__dirname, `../preload/${preload}.js`) }
      : {}),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

// Block top-level navigation (e.g. a dropped link) and popups; iframes are unaffected.
function lockDown(win: BrowserWindow): void {
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

export function createControlWindow(baseUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 460,
    title: "Player YouTube",
    backgroundColor: "#111111",
    webPreferences: webPreferences("control"),
  });
  lockDown(win);
  void win.loadURL(`${baseUrl}/control/index.html`);
  return win;
}

export function createPlayerWindow(
  baseUrl: string,
  display: DisplayInfo,
  windowed: boolean,
): BrowserWindow {
  const win = new BrowserWindow(
    windowed
      ? {
          width: 960,
          height: 540,
          title: "Player",
          backgroundColor: "#000000",
          show: false,
          webPreferences: webPreferences("player"),
        }
      : {
          x: display.x,
          y: display.y,
          width: display.width,
          height: display.height,
          frame: false,
          resizable: false,
          fullscreenable: false,
          // macOS otherwise clamps frameless windows below the menu bar
          ...(process.platform === "darwin"
            ? { enableLargerThanScreen: true }
            : {}),
          backgroundColor: "#000000",
          show: false,
          webPreferences: webPreferences("player"),
        },
  );
  win.setMenuBarVisibility(false);
  if (!windowed) win.setAlwaysOnTop(true, "screen-saver");
  lockDown(win);
  win.once("ready-to-show", () => {
    if (windowed) {
      win.show();
      return;
    }
    win.showInactive(); // do not steal focus from the control window
    // macOS: re-apply bounds so the window covers the menu bar too
    if (process.platform === "darwin")
      win.setBounds({
        x: display.x,
        y: display.y,
        width: display.width,
        height: display.height,
      });
  });
  void win.loadURL(`${baseUrl}/player/index.html`);
  return win;
}

export function identifyDisplays(
  baseUrl: string,
  displays: DisplayInfo[],
): void {
  displays.forEach((display, index) => {
    const win = new BrowserWindow({
      x: display.x + Math.round(display.width / 2) - 150,
      y: display.y + Math.round(display.height / 2) - 150,
      width: 300,
      height: 300,
      frame: false,
      transparent: true,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      webPreferences: webPreferences(),
    });
    win.setIgnoreMouseEvents(true);
    lockDown(win);
    void win.loadURL(`${baseUrl}/identify/index.html#${index + 1}`);
    setTimeout(() => {
      if (!win.isDestroyed()) win.close();
    }, 2500);
  });
}
