import { describe, expect, it } from 'vitest'
import { buildMenuTemplate } from './appMenu'

const roles = (items: ReturnType<typeof buildMenuTemplate>) =>
  (items ?? []).flatMap((m) => [m.role, ...(m.submenu ?? []).map((s) => s.role)])

describe('buildMenuTemplate', () => {
  it.each(['win32', 'linux'] as const)('has no menu on %s', (platform) => {
    expect(buildMenuTemplate(platform, 'Player YouTube')).toBeNull()
  })

  it('builds a minimal menu on darwin', () => {
    const t = buildMenuTemplate('darwin', 'Player YouTube')!
    expect(t.map((m) => m.label ?? m.role)).toEqual(['Player YouTube', 'Editar', 'Janela'])
    const r = roles(t)
    expect(r).toEqual(expect.arrayContaining(['about', 'hide', 'quit', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'minimize', 'zoom', 'close']))
  })

  it('has no DevTools or reload items', () => {
    const r = roles(buildMenuTemplate('darwin', 'X'))
    for (const bad of ['toggleDevTools', 'reload', 'forceReload']) expect(r).not.toContain(bad)
  })
})
