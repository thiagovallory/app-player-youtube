import { webFrameMain, type WebContents } from 'electron'
import { isYoutubeEmbedUrl } from './embedUrl'

// FRAGILE: these are YouTube-internal class names and may change at any time.
// The player window also sets `pointer-events: none` on the iframe, so clicks on
// these elements do nothing even if the selectors stop matching.
const SELECTORS = [
  '.ytp-pause-overlay',
  '.ytp-pause-overlay-container',
  '.ytp-endscreen-content',
  '.ytp-ce-element',
  '.ytp-cards-teaser',
  '.ytp-youtube-button',
  '.ytp-watermark',
  '.ytp-gradient-top',
  '.ytp-chrome-top',
  '.ytp-show-cards-title',
].join(', ')

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
