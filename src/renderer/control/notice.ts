const AUTO_DISMISS_MS = 12000

// Fecha o aviso após alguns segundos (pausa com o mouse em cima) ou pelo botão.
// Um live region persistente espelha o texto para leitores de tela.
export function initNotice(): void {
  const notice = document.getElementById('notice') as HTMLElement
  const close = document.getElementById('notice-close') as HTMLButtonElement
  const live = document.getElementById('notice-live') as HTMLElement
  const bar = close.parentElement as HTMLElement
  let timer: ReturnType<typeof setTimeout> | undefined

  const dismiss = () => {
    clearTimeout(timer)
    notice.hidden = true
  }
  const sync = () => {
    clearTimeout(timer)
    live.textContent = notice.hidden ? '' : (notice.textContent ?? '')
    if (notice.hidden) return
    if (!bar.matches(':hover')) timer = setTimeout(dismiss, AUTO_DISMISS_MS)
  }

  new MutationObserver(sync).observe(notice, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true })
  close.addEventListener('click', dismiss)
  bar.addEventListener('mouseenter', () => clearTimeout(timer))
  bar.addEventListener('mouseleave', () => {
    if (!notice.hidden) timer = setTimeout(dismiss, AUTO_DISMISS_MS)
  })
}
