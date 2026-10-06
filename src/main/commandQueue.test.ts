import { describe, expect, it } from 'vitest'
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
})
