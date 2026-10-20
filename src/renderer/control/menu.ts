export const CLOSE_MENU_EVENT = 'menu:close'

export function initMenu(): void {
  const toggle = document.getElementById('menu-toggle') as HTMLButtonElement
  const panel = document.getElementById('menu-panel') as HTMLElement
  const close = document.getElementById('menu-close') as HTMLButtonElement
  const main = document.querySelector('main') as HTMLElement

  const isOpen = () => !panel.hidden
  const setOpen = (open: boolean) => {
    if (open === isOpen()) return
    panel.hidden = !open
    main.inert = open // keeps focus and clicks out of the page behind the full-window menu
    toggle.setAttribute('aria-expanded', String(open))
    if (open) close.focus()
    else toggle.focus()
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()))
  close.addEventListener('click', () => setOpen(false))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false)
  })
  document.addEventListener(CLOSE_MENU_EVENT, () => setOpen(false))
}
