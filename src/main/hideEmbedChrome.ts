import { webFrameMain, type WebContents } from 'electron'
import { EMBED_HIDE_SELECTORS } from './embedSelectors'
import { isYoutubeEmbedUrl } from './embedUrl'

const SELECTORS = EMBED_HIDE_SELECTORS.join(', ')

const INJECT = `(() => {
  if (document.getElementById('pyt-hide')) return
  const style = document.createElement('style')
  style.id = 'pyt-hide'
  style.textContent = ${JSON.stringify(`${SELECTORS} { display: none !important; } * { cursor: none !important; }`)}
  ;(document.head || document.documentElement).appendChild(style)
})()`

export function hideEmbedChrome(webContents: WebContents): void {
  webContents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    if (isMainFrame) return
    const frame = webFrameMain.fromId(frameProcessId, frameRoutingId)
    if (!frame || !isYoutubeEmbedUrl(frame.url)) return
    frame.executeJavaScript(INJECT).catch(() => {})
  })
}
