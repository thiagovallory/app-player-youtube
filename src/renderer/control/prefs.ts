import type { ThemePref } from '../../shared/types'
import { PLAYBACK_RATES } from '../../shared/validate'

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const COMMON_LANGS: { code: string; name: string }[] = [
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'pt-PT', name: 'Português (Portugal)' },
  { code: 'en', name: 'Inglês' },
  { code: 'es', name: 'Espanhol' },
  { code: 'fr', name: 'Francês' },
  { code: 'de', name: 'Alemão' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: 'Japonês' },
  { code: 'ko', name: 'Coreano' },
  { code: 'zh-Hans', name: 'Chinês (simplificado)' },
]

const TRANSLATE_LANGS: { code: string; name: string }[] = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'Inglês' },
  { code: 'es', name: 'Espanhol' },
  { code: 'fr', name: 'Francês' },
  { code: 'de', name: 'Alemão' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: 'Japonês' },
  { code: 'ko', name: 'Coreano' },
  { code: 'zh-Hans', name: 'Chinês (simplificado)' },
  { code: 'ru', name: 'Russo' },
  { code: 'ar', name: 'Árabe' },
  { code: 'hi', name: 'Hindi' },
]

const rateLabel = (r: number) => `${String(r).replace('.', ',')}×`

export async function initPrefs(): Promise<void> {
  const captions = byId<HTMLInputElement>('opt-captions')
  const lang = byId<HTMLSelectElement>('opt-caption-lang')
  const translate = byId<HTMLSelectElement>('opt-caption-translate')
  const rate = byId<HTMLSelectElement>('opt-rate')
  const theme = byId<HTMLSelectElement>('opt-theme')

  const addOption = (code: string, name: string) => {
    if (Array.from(lang.options).some((o) => o.value === code)) return
    const option = document.createElement('option')
    option.value = code
    option.textContent = name
    lang.append(option)
  }

  const auto = document.createElement('option')
  auto.value = ''
  auto.textContent = 'Automático (idioma do sistema)'
  lang.append(auto)
  COMMON_LANGS.forEach((l) => addOption(l.code, l.name))

  const addTranslate = (code: string, name: string) => {
    if (Array.from(translate.options).some((o) => o.value === code)) return
    const option = document.createElement('option')
    option.value = code
    option.textContent = name
    translate.append(option)
  }
  const none = document.createElement('option')
  none.value = ''
  none.textContent = 'Não traduzir'
  translate.append(none)
  TRANSLATE_LANGS.forEach((l) => addTranslate(l.code, l.name))

  for (const r of PLAYBACK_RATES) {
    const option = document.createElement('option')
    option.value = String(r)
    option.textContent = r === 1 ? '1× (normal)' : rateLabel(r)
    rate.append(option)
  }

  const settings = await window.control.getSettings()
  const { videoPrefs } = settings
  captions.checked = videoPrefs.captions
  if (videoPrefs.captionLang) addOption(videoPrefs.captionLang, videoPrefs.captionLang)
  lang.value = videoPrefs.captionLang ?? ''
  if (videoPrefs.captionTranslate) addTranslate(videoPrefs.captionTranslate, videoPrefs.captionTranslate)
  translate.value = videoPrefs.captionTranslate ?? ''
  rate.value = String(videoPrefs.playbackRate)
  theme.value = settings.theme
  lang.disabled = !captions.checked
  translate.disabled = !captions.checked

  captions.addEventListener('change', () => {
    lang.disabled = !captions.checked
    translate.disabled = !captions.checked
    window.control.setPrefs({ videoPrefs: { captions: captions.checked } })
  })
  lang.addEventListener('change', () => {
    window.control.setPrefs({ videoPrefs: { captionLang: lang.value === '' ? null : lang.value } })
  })
  translate.addEventListener('change', () => {
    window.control.setPrefs({ videoPrefs: { captionTranslate: translate.value === '' ? null : translate.value } })
  })
  rate.addEventListener('change', () => {
    window.control.setPrefs({ videoPrefs: { playbackRate: Number(rate.value) } })
  })
  theme.addEventListener('change', () => {
    window.control.setPrefs({ theme: theme.value as ThemePref })
  })

  // Extra languages offered by the current video; the selection is preserved.
  let lastTracks = ''
  let lastTranslations = ''
  window.control.onState((state) => {
    if (state.translationLanguages) {
      const key = JSON.stringify(state.translationLanguages.map((t) => [t.code, t.name]))
      if (key !== lastTranslations) {
        lastTranslations = key
        const selected = translate.value
        state.translationLanguages.forEach((t) => addTranslate(t.code, t.name))
        translate.value = selected
      }
    }
    if (!state.captionTracks) return
    const key = JSON.stringify(state.captionTracks.map((t) => [t.code, t.name]))
    if (key === lastTracks) return
    lastTracks = key
    const selected = lang.value
    state.captionTracks.forEach((t) => addOption(t.code, t.name))
    lang.value = selected
  })
}
