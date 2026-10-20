export const START: string
export const END: string
export function fileNames(version: string): string[]
export function buildTable(version: string, repo: string): string
export function replaceDownloads(readme: string, table: string): string
export function isValidVersion(version: string): boolean
