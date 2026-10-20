// Reescreve a tabela de downloads do README com os links da versão informada.
// Uso: node scripts/update-readme-downloads.mjs <versão> [<dono>/<repositório>] [<caminho do README>]
import { readFileSync, writeFileSync } from 'node:fs'
import { buildTable, isValidVersion, replaceDownloads } from './readmeDownloads.mjs'

const [version, repo = 'thiagovallory/app-player-youtube', path = 'README.md'] = process.argv.slice(2)
if (!version || !isValidVersion(version)) {
  console.error('Uso: node scripts/update-readme-downloads.mjs <versão X.Y.Z> [repo] [README]')
  process.exit(1)
}
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error(`Repositório inválido: ${repo}`)
  process.exit(1)
}
const before = readFileSync(path, 'utf8')
const after = replaceDownloads(before, buildTable(version, repo))
writeFileSync(path, after)
console.log(after === before ? 'README já estava atualizado' : `README atualizado para a versão ${version}`)
