import { describe, expect, it } from 'vitest'
import { describeYtError } from './playerErrors'

describe('describeYtError', () => {
  it.each([100, 101, 150, 5])('marks %i as skippable', (code) => {
    const info = describeYtError(code)
    expect(info.skippable).toBe(true)
    expect(info.message.length).toBeGreaterThan(0)
  })

  it('explains blocked embedding for 101 and 150', () => {
    expect(describeYtError(101).message).toBe('O dono do vídeo bloqueou a reprodução em players externos.')
    expect(describeYtError(150).message).toBe(describeYtError(101).message)
  })

  it.each([2, 153, 999])('does not skip on %i', (code) => {
    expect(describeYtError(code).skippable).toBe(false)
  })

  it('includes the code for unknown errors', () => {
    expect(describeYtError(999).message).toBe('Erro desconhecido do player (999).')
  })
})
