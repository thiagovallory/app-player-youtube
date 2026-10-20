import { describe, expect, it } from 'vitest'
import { EMBED_HIDE_SELECTORS } from './embedSelectors'

describe('EMBED_HIDE_SELECTORS', () => {
  it('keeps the key selectors of both embed layouts', () => {
    const key = [
      '.ytPlayerControlsContainerHost',
      'ytm-watch-player-controls',
      'player-middle-controls',
      '.player-controls-content',
      '.fullscreen-action-menu',
      '.action-menu-engagement-buttons-wrapper',
      '.quick-actions-wrapper',
      '.fullscreen-watch-next-entrypoint-wrapper',
      'ytm-fullscreen-related-videos-entry-point-view-model',
      'ytm-endscreen-video-renderer',
      '[class*="FullscreenVideoRecommendation"]',
      '[class*="RelatedVideosEntryPoint"]',
      '.watch-on-youtube-button',
      '.ytwPlayerTopControlsTitleWrapper',
      'embedded-player-video-details',
      '.ytp-pause-overlay',
      '.ytp-endscreen-content',
      '.ytp-youtube-button',
      '.ytp-watermark',
      '.ytp-chrome-top',
    ]
    for (const s of key) expect(EMBED_HIDE_SELECTORS).toContain(s)
  })
})
