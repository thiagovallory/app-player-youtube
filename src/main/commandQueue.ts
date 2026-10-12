export class CommandQueue<T> {
  private ready = false
  private pending: T[] = []

  constructor(private readonly send: (command: T) => void) {}

  push(command: T): void {
    if (this.ready) this.send(command)
    else this.pending.push(command)
  }

  markReady(): void {
    this.ready = true
    const flush = this.pending
    this.pending = []
    for (const command of flush) {
      try {
        this.send(command)
      } catch (err) {
        console.error('Failed to send queued player command', err)
      }
    }
  }

  reset(): void {
    this.ready = false
    this.pending = []
  }
}
