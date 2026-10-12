import type { QueueItem, QueueState } from '../../shared/types'
import type { LoadMode } from '../../shared/validate'
import { icon, type IconName } from './icons'
import { CLOSE_MENU_EVENT } from './menu'

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let currentUid: string | null = null

export const getCurrentUid = (): string | null => currentUid

export async function initQueue(): Promise<void> {
  const list = byId<HTMLUListElement>('queue')
  const empty = byId<HTMLElement>('queue-empty')
  const status = byId<HTMLElement>('queue-status')
  const count = byId<HTMLElement>('queue-count')
  const clear = byId<HTMLButtonElement>('queue-clear')
  const nameInput = byId<HTMLInputElement>('queue-name')
  const save = byId<HTMLButtonElement>('queue-save')
  const savedList = byId<HTMLUListElement>('saved-list')
  const savedEmpty = byId<HTMLElement>('saved-empty')

  let dragUid: string | null = null
  let pushed = false
  let state: QueueState = { items: [], currentUid: null, expanding: false, saved: [] }

  const row = (item: QueueItem, position: number): HTMLLIElement => {
    const li = document.createElement('li')
    li.draggable = true
    li.classList.toggle('current', item.uid === state.currentUid)

    const handle = document.createElement('span')
    handle.className = 'handle'
    handle.append(icon('grip'))

    const index = document.createElement('span')
    index.className = 'queue-index'
    if (li.classList.contains('current')) index.append(icon('bars'))
    else index.textContent = String(position + 1)

    const title = document.createElement('button')
    title.type = 'button'
    title.className = 'queue-title'
    title.textContent = item.title
    title.title = item.title
    title.addEventListener('click', () => window.control.queuePlayAt(item.uid))

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'queue-remove'
    remove.append(icon('x'))
    remove.setAttribute('aria-label', `Remover ${item.title}`)
    remove.title = 'Remover da fila'
    remove.addEventListener('click', () => window.control.queueRemove(item.uid))

    li.append(index, title, handle, remove)

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
      if (dragUid && dragUid !== item.uid) window.control.queueMove(dragUid, position)
      dragUid = null
    })
    li.addEventListener('dragend', () => {
      dragUid = null
      list.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'))
    })
    return li
  }

  const savedRow = (name: string): HTMLLIElement => {
    const li = document.createElement('li')
    const label = document.createElement('span')
    label.className = 'saved-name'
    label.textContent = name
    label.title = name

    const action = (className: string, iconName: IconName, text: string, onClick: () => void) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `icon-btn ${className}`
      button.append(icon(iconName))
      button.setAttribute('aria-label', `${text} fila ${name}`)
      button.title = `${text} fila ${name}`
      button.addEventListener('click', onClick)
      return button
    }
    const load = (mode: LoadMode) => () => {
      window.control.queueLoadSaved(name, mode)
      document.dispatchEvent(new CustomEvent(CLOSE_MENU_EVENT))
    }

    li.append(
      label,
      action('saved-append', 'list-plus', 'Adicionar', load('append')),
      action('saved-replace', 'replace', 'Substituir', load('replace')),
      action('saved-delete', 'trash', 'Excluir', () => {
        if (confirm(`Excluir a fila "${name}"?`)) window.control.queueDeleteSaved(name)
      }),
    )
    return li
  }

  const render = (next: QueueState) => {
    state = next
    currentUid = next.currentUid
    const n = next.items.length
    count.textContent = n === 0 ? 'Fila' : `Fila · ${n} ${n === 1 ? 'item' : 'itens'}`
    empty.hidden = n > 0
    status.hidden = !next.expanding
    clear.disabled = next.items.length === 0
    save.disabled = next.items.length === 0
    list.replaceChildren(...next.items.map(row))

    savedEmpty.hidden = next.saved.length > 0
    savedList.replaceChildren(...next.saved.map(savedRow))
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
  window.control.onQueueState((next) => {
    pushed = true
    render(next)
  })
  const initial = await window.control.queueGet()
  if (!pushed) render(initial ?? state)
}
