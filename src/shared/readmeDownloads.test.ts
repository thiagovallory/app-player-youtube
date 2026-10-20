import { describe, expect, it } from 'vitest'
import { START, END, buildTable, fileNames, isValidVersion, replaceDownloads } from '../../scripts/readmeDownloads.mjs'

const repo = 'thiagovallory/app-player-youtube'

describe('fileNames', () => {
  it('puts the version in every installer name', () => {
    expect(fileNames('1.2.3')).toEqual([
      'Player-YouTube-1.2.3-mac-arm64.dmg',
      'Player-YouTube-1.2.3-mac-x64.dmg',
      'Player-YouTube-1.2.3-mac-arm64.zip',
      'Player-YouTube-1.2.3-mac-x64.zip',
      'Player-YouTube-1.2.3-win-x64-setup.exe',
      'Player-YouTube-1.2.3-win-x64-portable.exe',
      'Player-YouTube-1.2.3-win-arm64-setup.exe',
      'Player-YouTube-1.2.3-win7-x64-setup.exe',
      'Player-YouTube-1.2.3-win7-ia32-setup.exe',
    ])
  })
})

describe('buildTable', () => {
  it('links each file to the tagged release', () => {
    const table = buildTable('1.2.3', repo)
    for (const name of fileNames('1.2.3')) {
      expect(table).toContain(`[${name}](https://github.com/${repo}/releases/download/v1.2.3/${name})`)
    }
    expect(table.split('\n')).toHaveLength(2 + fileNames('1.2.3').length)
  })
})

describe('replaceDownloads', () => {
  const readme = `# T\n\n${START}\nOLD TABLE\n${END}\n\nresto`

  it('replaces only what is between the markers', () => {
    const out = replaceDownloads(readme, 'NEW')
    expect(out).toBe(`# T\n\n${START}\nNEW\n${END}\n\nresto`)
  })

  it('is idempotent', () => {
    const once = replaceDownloads(readme, 'NEW')
    expect(replaceDownloads(once, 'NEW')).toBe(once)
  })

  it('throws when a marker is missing or out of order', () => {
    expect(() => replaceDownloads('sem marcadores', 'x')).toThrow(/Marcadores/)
    expect(() => replaceDownloads(`${END}\n${START}`, 'x')).toThrow(/Marcadores/)
  })
})

describe('isValidVersion', () => {
  it.each(['0.1.4', '10.20.30'])('accepts %s', (v) => expect(isValidVersion(v)).toBe(true))
  it.each(['', 'v0.1.4', '0.1', '0.1.4-beta', '../x', '1.2.3 && rm'])('rejects %j', (v) => expect(isValidVersion(v)).toBe(false))
})
