import { join } from 'node:path'

// Funciona em dev (out/main) e empacotado (app.asar/out/main): build/icon.png vai junto no pacote.
export const appIconPath = (): string => join(__dirname, '../../build/icon.png')
