import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './concurrency'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

describe('mapWithConcurrency', () => {
  it('keeps results in input order', async () => {
    const results = await mapWithConcurrency([30, 5, 15], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms
    })
    expect(results).toEqual([
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 5 },
      { status: 'fulfilled', value: 15 },
    ])
  })

  it('never runs more than the limit at once', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active++
      peak = Math.max(peak, active)
      await tick()
      active--
    })
    expect(peak).toBe(3)
  })

  it('isolates rejections', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    })
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(results[1].status).toBe('rejected')
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 })
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([])
  })
})
