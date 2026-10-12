const AUTO_DISMISS_MS = 8000

// Fecha o aviso após alguns segundos (pausa com o mouse em cima) ou pelo botão.
export function initNotice(): void {
  const notice = document.getElementById('notice') as HTMLElement
  const close = document.getElementById('notice-close') as HTMLButtonElement
  const bar = close.parentElement as HTMLElement
  let timer: ReturnType<typeof setTimeout> | undefined
  let hovering = false

  const dismiss = () => {
    clearTimeout(timer)
    notice.hidden = true
  }
  const arm = () => {
    clearTimeout(timer)
    if (!notice.hidden && !hovering) timer = setTimeout(dismiss, AUTO_DISMISS_MS)
  }

  new MutationObserver(arm).observe(notice, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true })
  close.addEventListener('click', dismiss)
  bar.addEventListener('mouseenter', () => {
    hovering = true
    clearTimeout(timer)
  })
  bar.addEventListener('mouseleave', () => {
    hovering = false
    arm()
  })
}
