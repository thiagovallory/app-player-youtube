import { COMPACT_MAX_HEIGHT, COMPACT_MIN_HEIGHT } from '../../shared/validate'
import { icon } from './icons'

export function initCompact(): void {
  const root = document.documentElement
  const button = document.getElementById('compact-toggle') as HTMLButtonElement
  const main = document.querySelector('main') as HTMLElement
  let compact = false
  let lastHeight = 0
  let frame = 0

  const measure = () => {
    frame = 0
    if (!compact) return
    const height = Math.ceil(main.getBoundingClientRect().height)
    const clamped = Math.min(COMPACT_MAX_HEIGHT, Math.max(COMPACT_MIN_HEIGHT, height))
    if (clamped === lastHeight) return
    lastHeight = clamped
    window.control.setCompact(true, clamped)
  }
  const scheduleMeasure = () => {
    if (!frame) frame = requestAnimationFrame(measure)
  }
  // The height follows the content (title wrapping, error message, window width).
  const observer = new ResizeObserver(scheduleMeasure)

  const apply = (next: boolean) => {
    compact = next
    root.dataset.compact = String(next)
    const label = next ? 'Expandir' : 'Modo compacto'
    button.replaceChildren(icon(next ? 'maximize' : 'minimize'))
    button.setAttribute('aria-label', label)
    button.title = label
    lastHeight = 0
    if (next) {
      observer.observe(main)
      scheduleMeasure()
    } else {
      observer.disconnect()
      window.control.setCompact(false)
    }
  }

  button.addEventListener('click', () => apply(!compact))
}
