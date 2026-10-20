// Lógica pura da tabela de downloads do README (usada por update-readme-downloads.mjs e pelos testes).
export const START = '<!-- downloads:start -->'
export const END = '<!-- downloads:end -->'

const ROWS = [
  ['macOS (Apple Silicon: M1, M2, M3…)', 'Executar (descompacte o `.zip`)', 'mac-arm64.zip'],
  ['macOS (Intel)', 'Executar (descompacte o `.zip`)', 'mac-x64.zip'],
  ['Windows 10/11 (64 bits)', 'Instalar', 'win-x64-setup.exe'],
  ['Windows 10/11 (64 bits)', 'Executar, sem instalar', 'win-x64-portable.exe'],
  ['Windows 10/11 (ARM)', 'Instalar', 'win-arm64-setup.exe'],
  ['Windows 7 / 8 / 8.1 (64 bits)', 'Instalar (versão "legado")', 'win7-x64-setup.exe'],
  ['Windows 7 / 8 / 8.1 (32 bits)', 'Instalar (versão "legado")', 'win7-ia32-setup.exe'],
]

export function fileNames(version) {
  return ROWS.map(([, , suffix]) => `Player-YouTube-${version}-${suffix}`)
}

export function buildTable(version, repo) {
  const base = `https://github.com/${repo}/releases/download/v${version}`
  const lines = ['| Sistema | Como usar | Download |', '|---|---|---|']
  for (const [system, how, suffix] of ROWS) {
    const name = `Player-YouTube-${version}-${suffix}`
    lines.push(`| ${system} | ${how} | [${name}](${base}/${name}) |`)
  }
  return lines.join('\n')
}

export function replaceDownloads(readme, table) {
  const start = readme.indexOf(START)
  const end = readme.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Marcadores ${START} / ${END} não encontrados no README`)
  }
  return `${readme.slice(0, start + START.length)}\n${table}\n${readme.slice(end)}`
}

export function isValidVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version)
}
