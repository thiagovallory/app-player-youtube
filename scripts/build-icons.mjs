// Gera build/icon.png, build/icon.icns e build/icon.ico a partir de assets/icon.svg.
// Uso: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import png2icons from 'png2icons'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'assets', 'icon.svg'), 'utf8')
const out = join(root, 'build')
mkdirSync(out, { recursive: true })

const render = (source, size) =>
  new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()

// O conteúdo do SVG (sem a tag <svg>) é reaproveitado no ícone do macOS, que precisa de margem transparente.
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const MAC_ART = 824 // área do desenho num canvas de 1024 (guia de ícones do macOS)
const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <g transform="translate(${(1024 - MAC_ART) / 2} ${(1024 - MAC_ART) / 2}) scale(${MAC_ART / 180})">${inner}</g>
</svg>`

const png = render(svg, 1024)
const macPng = render(macSvg, 1024)

const icns = png2icons.createICNS(macPng, png2icons.BICUBIC, 0)
const ico = png2icons.createICO(png, png2icons.BICUBIC, 0, false, true)
if (!icns || !ico) throw new Error('Falha ao gerar .icns/.ico')

writeFileSync(join(out, 'icon.png'), render(svg, 512))
writeFileSync(join(out, 'icon.icns'), icns)
writeFileSync(join(out, 'icon.ico'), ico)
console.log('Ícones gerados em build/: icon.png (512), icon.icns, icon.ico')
