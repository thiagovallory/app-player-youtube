// Menu mínimo do app: só existe no macOS (a barra do sistema não pode ser escondida).
// Sem importar `electron` para poder testar; o tipo é estrutural e compatível com MenuItemConstructorOptions.
export interface MenuTemplateItem {
  label?: string
  role?: string
  type?: 'separator'
  submenu?: MenuTemplateItem[]
}

export function buildMenuTemplate(platform: NodeJS.Platform, appName: string): MenuTemplateItem[] | null {
  if (platform !== 'darwin') return null
  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Janela',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]
}
