import type { DisplaysSnapshot } from '../../shared/types'

export async function initDisplays(): Promise<void> {
  const select = document.getElementById('display') as HTMLSelectElement
  const warning = document.getElementById('single-warning') as HTMLElement
  const identify = document.getElementById('identify') as HTMLButtonElement

  const render = (snapshot: DisplaysSnapshot) => {
    select.replaceChildren(
      ...snapshot.displays.map((d) => {
        const option = document.createElement('option')
        option.value = String(d.id)
        option.textContent = `${d.label} (${d.width}×${d.height})${d.isPrimary ? ' — principal' : ''}`
        option.selected = d.id === snapshot.selectedId
        return option
      }),
    )
    warning.hidden = snapshot.displays.length !== 1
  }

  render(await window.control.getDisplays())
  select.addEventListener('change', async () => render(await window.control.selectDisplay(Number(select.value))))
  identify.addEventListener('click', () => void window.control.identifyDisplays())
  window.control.onDisplaysChanged(render)
}
