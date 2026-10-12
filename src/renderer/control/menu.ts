export const CLOSE_MENU_EVENT = 'menu:close'

export function initMenu(): void {
  const toggle = document.getElementById('menu-toggle') as HTMLButtonElement
  const panel = document.getElementById('menu-panel') as HTMLElement

  const topRow = document.getElementById('top-row') as HTMLElement

  const setOpen = (open: boolean) => {
    if (open) panel.style.setProperty('--menu-top', `${Math.ceil(topRow.getBoundingClientRect().bottom) + 8}px`)
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }
  const isOpen = () => !panel.hidden

  toggle.addEventListener('click', () => setOpen(!isOpen()))
  document.addEventListener('click', (e) => {
    if (!isOpen()) return
    const target = e.target as Node
    if (!panel.contains(target) && !toggle.contains(target)) setOpen(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false)
      toggle.focus()
    }
  })
  document.addEventListener(CLOSE_MENU_EVENT, () => setOpen(false))
}
