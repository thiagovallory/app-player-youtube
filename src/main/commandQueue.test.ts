import { describe, expect, it, vi } from 'vitest'
import { CommandQueue } from './commandQueue'

describe('CommandQueue', () => {
  it('buffers commands until ready, then flushes in order', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.push(1)
    queue.push(2)
    expect(sent).toEqual([])
    queue.markReady()
    expect(sent).toEqual([1, 2])
  })

  it('sends immediately once ready', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.markReady()
    queue.push(3)
    expect(sent).toEqual([3])
  })

  it('does not flush twice on repeated markReady', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.push(1)
    queue.markReady()
    queue.markReady()
    expect(sent).toEqual([1])
  })

  it('reset drops pending commands and requires ready again', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.push(1)
    queue.reset()
    queue.markReady()
    expect(sent).toEqual([])
    queue.reset()
    queue.push(2)
    expect(sent).toEqual([])
    queue.markReady()
    expect(sent).toEqual([2])
  })

  it('keeps flushing the remaining commands when one send throws', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => {
      if (c === 2) throw new Error('boom')
      sent.push(c)
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    queue.push(1)
    queue.push(2)
    queue.push(3)
    expect(() => queue.markReady()).not.toThrow()
    expect(sent).toEqual([1, 3])
    expect(errors).toHaveBeenCalledTimes(1)
    errors.mockRestore()
  })
})
