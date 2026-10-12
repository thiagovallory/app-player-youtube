export const CLOSE_MENU_EVENT = 'menu:close'

export function initMenu(): void {
  const toggle = document.getElementById('menu-toggle') as HTMLButtonElement
  const panel = document.getElementById('menu-panel') as HTMLElement
  const topRow = document.getElementById('top-row') as HTMLElement

  const placePanel = () =>
    panel.style.setProperty('--menu-top', `${Math.ceil(topRow.getBoundingClientRect().bottom) + 8}px`)
  const setOpen = (open: boolean) => {
    if (open) placePanel()
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }
  const isOpen = () => !panel.hidden

  toggle.addEventListener('click', () => setOpen(!isOpen()))
  // Com o menu aberto, o clique fora só fecha o menu: é interceptado na fase de captura
  // para não acionar o botão ou item que estiver embaixo.
  document.addEventListener(
    'click',
    (e) => {
      if (!isOpen()) return
      const target = e.target as Node
      if (panel.contains(target) || toggle.contains(target)) return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    },
    true,
  )
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false)
      toggle.focus()
    }
  })
  window.addEventListener('resize', () => {
    if (isOpen()) placePanel()
  })
  document.addEventListener(CLOSE_MENU_EVENT, () => setOpen(false))
}
