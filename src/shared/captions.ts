import type { CaptionTrack } from './types'

export function mapTracks(raw: unknown): CaptionTrack[] {
  if (!Array.isArray(raw)) return []
  const out: CaptionTrack[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const t = item as Record<string, unknown>
    if (typeof t.languageCode !== 'string' || t.languageCode === '' || seen.has(t.languageCode)) continue
    seen.add(t.languageCode)
    const name =
      typeof t.languageName === 'string' && t.languageName
        ? t.languageName
        : typeof t.displayName === 'string' && t.displayName
          ? t.displayName
          : t.languageCode
    out.push({ code: t.languageCode, name })
  }
  return out
}

const norm = (code: string) => code.toLowerCase().replace(/_/g, '-')

export function pickTrack(tracks: CaptionTrack[], lang: string | null): string | null {
  if (!lang || tracks.length === 0) return null
  const want = norm(lang)
  const exact = tracks.find((t) => norm(t.code) === want)
  if (exact) return exact.code
  const prefix = want.split('-')[0]
  const loose = tracks.find((t) => norm(t.code).split('-')[0] === prefix)
  return loose ? loose.code : null
}
