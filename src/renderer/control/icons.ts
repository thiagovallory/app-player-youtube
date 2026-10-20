// Ícones inline (estilo traço, currentColor). Constantes estáticas: nunca interpolar dados externos.
const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  'skip-prev': '<path d="M18 5v14L8 12z" fill="currentColor"/><path d="M6 5v14"/>',
  'skip-next': '<path d="M6 5v14l10-7z" fill="currentColor"/><path d="M18 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  minimize: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  replace: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  'list-plus': '<path d="M4 6h11M4 12h11M4 18h7M18 14v6M15 17h6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  bars: '<path d="M6 20V10M12 20V4M18 20v-8"/>',
} as const

export type IconName = keyof typeof ICONS

const ICON_SVG: Record<IconName, string> = Object.fromEntries(
  (Object.keys(ICONS) as IconName[]).map((name) => [
    name,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`,
  ]),
) as Record<IconName, string>

export function icon(name: IconName): SVGSVGElement {
  const doc = new DOMParser().parseFromString(ICON_SVG[name], 'image/svg+xml')
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
  svg.classList.add('icon')
  return svg
}

// Substitui <span data-icon="nome"> estáticos do HTML pelo SVG correspondente.
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.dataset.icon
    if (name && name in ICONS) el.replaceChildren(icon(name as IconName))
  })
}
