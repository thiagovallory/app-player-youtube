import type { QueueItem, QueueState } from '../../shared/types'

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let currentUid: string | null = null

export const getCurrentUid = (): string | null => currentUid

export async function initQueue(): Promise<void> {
  const list = byId<HTMLUListElement>('queue')
  const empty = byId<HTMLElement>('queue-empty')
  const status = byId<HTMLElement>('queue-status')
  const clear = byId<HTMLButtonElement>('queue-clear')
  const nameInput = byId<HTMLInputElement>('queue-name')
  const save = byId<HTMLButtonElement>('queue-save')
  const saved = byId<HTMLSelectElement>('saved-queues')
  const load = byId<HTMLButtonElement>('saved-load')
  const del = byId<HTMLButtonElement>('saved-delete')

  let dragUid: string | null = null
  let pushed = false
  let state: QueueState = { items: [], currentUid: null, expanding: false, saved: [] }

  const row = (item: QueueItem, index: number): HTMLLIElement => {
    const li = document.createElement('li')
    li.draggable = true
    li.classList.toggle('current', item.uid === state.currentUid)

    const handle = document.createElement('span')
    handle.className = 'handle'
    handle.textContent = '⠿'

    const title = document.createElement('button')
    title.type = 'button'
    title.className = 'queue-title'
    title.textContent = item.title
    title.title = item.title
    title.addEventListener('click', () => window.control.queuePlayAt(item.uid))

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'queue-remove'
    remove.textContent = '✕'
    remove.setAttribute('aria-label', `Remover ${item.title}`)
    remove.addEventListener('click', () => window.control.queueRemove(item.uid))

    li.append(handle, title, remove)

    li.addEventListener('dragstart', (e) => {
      dragUid = item.uid
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', item.uid)
        e.dataTransfer.effectAllowed = 'move'
      }
    })
    li.addEventListener('dragover', (e) => {
      if (dragUid && dragUid !== item.uid) {
        e.preventDefault()
        li.classList.add('drop-target')
      }
    })
    li.addEventListener('dragleave', (e) => {
      if (!li.contains(e.relatedTarget as Node | null)) li.classList.remove('drop-target')
    })
    li.addEventListener('drop', (e) => {
      e.preventDefault()
      li.classList.remove('drop-target')
      if (dragUid && dragUid !== item.uid) window.control.queueMove(dragUid, index)
      dragUid = null
    })
    li.addEventListener('dragend', () => {
      dragUid = null
      list.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'))
    })
    return li
  }

  const render = (next: QueueState) => {
    state = next
    currentUid = next.currentUid
    empty.hidden = next.items.length > 0
    status.hidden = !next.expanding
    clear.disabled = next.items.length === 0
    save.disabled = next.items.length === 0
    list.replaceChildren(...next.items.map(row))

    const previous = saved.value
    saved.replaceChildren(
      ...next.saved.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name })),
    )
    if (next.saved.includes(previous)) saved.value = previous
    load.disabled = next.saved.length === 0
    del.disabled = next.saved.length === 0
  }

  const saveCurrent = () => {
    const name = nameInput.value.trim()
    if (!name) {
      nameInput.focus()
      return
    }
    window.control.queueSave(name)
  }

  clear.addEventListener('click', () => window.control.queueClear())
  save.addEventListener('click', saveCurrent)
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCurrent()
  })
  load.addEventListener('click', () => {
    if (saved.value) window.control.queueLoadSaved(saved.value, 'replace')
  })
  del.addEventListener('click', () => {
    if (saved.value && confirm(`Excluir a fila "${saved.value}"?`)) window.control.queueDeleteSaved(saved.value)
  })

  window.control.onQueueState((next) => {
    pushed = true
    render(next)
  })
  const initial = await window.control.queueGet()
  if (!pushed) render(initial ?? state)
}
