import type { BrowserWindow, WebContents } from 'electron'
import { CMD_TO_PLAYER } from '../shared/ipc'
import type { DisplayInfo, PlayerCommand } from '../shared/types'
import { CommandQueue } from './commandQueue'
import { createPlayerWindow } from './windows'

export interface PlayerTarget {
  display: DisplayInfo
  windowed: boolean
}

type Mode = 'screen' | 'window'

export class PlayerController {
  private win: BrowserWindow | null = null
  private mode: Mode = 'screen'
  private lastLoad: PlayerCommand | null = null
  private lastVolume: PlayerCommand | null = null
  private readonly queue = new CommandQueue<PlayerCommand>((cmd) =>
    this.win?.webContents.send(CMD_TO_PLAYER, cmd),
  )

  constructor(
    private readonly baseUrl: string,
    private readonly onClosed: () => void,
  ) {}

  isOpen(): boolean {
    return this.win !== null
  }

  owns(sender: WebContents): boolean {
    return this.win !== null && this.win.webContents === sender
  }

  markReady(): void {
    this.queue.markReady()
  }

  send(cmd: PlayerCommand, target: PlayerTarget): void {
    if (cmd.type === 'stop') {
      this.close()
      return
    }
    if (!this.win && cmd.type !== 'load') return
    if (cmd.type === 'load') {
      const replay = this.lastLoad
      this.lastLoad = cmd
      this.place(target, replay)
    } else if (cmd.type === 'volume') {
      this.lastVolume = cmd
    }
    this.queue.push(cmd)
  }

  reposition(target: PlayerTarget): void {
    if (this.win) this.place(target, this.lastLoad)
  }

  close(): void {
    if (!this.win) return
    this.destroy()
    this.lastLoad = null
    this.lastVolume = null
    this.onClosed()
  }

  private place(target: PlayerTarget, replay: PlayerCommand | null): void {
    const mode: Mode = target.windowed ? 'window' : 'screen'
    if (this.win && this.mode !== mode) this.destroy()
    if (!this.win) {
      this.open(target, mode)
      if (replay) {
        this.queue.push(replay)
        if (this.lastVolume) this.queue.push(this.lastVolume)
      }
    } else if (mode === 'screen') {
      const { x, y, width, height } = target.display
      this.win.setBounds({ x, y, width, height })
    }
  }

  private open(target: PlayerTarget, mode: Mode): void {
    const win = createPlayerWindow(this.baseUrl, target.display, target.windowed)
    this.win = win
    this.mode = mode
    this.queue.reset()
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.lastLoad = null
      this.lastVolume = null
      this.queue.reset()
      this.onClosed()
    })
  }

  private destroy(): void {
    const win = this.win
    this.win = null
    this.queue.reset()
    if (win && !win.isDestroyed()) win.destroy()
  }
}
