import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { DisplayInfo } from '../shared/types'

function webPreferences(preload?: string) {
  return {
    ...(preload ? { preload: join(__dirname, `../preload/${preload}.js`) } : {}),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  }
}

export function createControlWindow(baseUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 460,
    title: 'Player YouTube',
    backgroundColor: '#111111',
    webPreferences: webPreferences('control'),
  })
  void win.loadURL(`${baseUrl}/control/index.html`)
  return win
}

export function createPlayerWindow(baseUrl: string, display: DisplayInfo, single: boolean): BrowserWindow {
  const win = new BrowserWindow(
    single
      ? {
          width: 960,
          height: 540,
          title: 'Player',
          backgroundColor: '#000000',
          show: false,
          webPreferences: webPreferences('player'),
        }
      : {
          x: display.x,
          y: display.y,
          width: display.width,
          height: display.height,
          frame: false,
          resizable: false,
          fullscreenable: false,
          backgroundColor: '#000000',
          show: false,
          webPreferences: webPreferences('player'),
        },
  )
  win.setMenuBarVisibility(false)
  if (!single) win.setAlwaysOnTop(true, 'screen-saver')
  win.once('ready-to-show', () => win.show())
  void win.loadURL(`${baseUrl}/player/index.html`)
  return win
}

export function identifyDisplays(baseUrl: string, displays: DisplayInfo[]): void {
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
    })
    win.setIgnoreMouseEvents(true)
    void win.loadURL(`${baseUrl}/identify/index.html#${index + 1}`)
    setTimeout(() => {
      if (!win.isDestroyed()) win.close()
    }, 2500)
  })
}
