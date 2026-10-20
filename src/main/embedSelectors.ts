// FRAGILE: YouTube-internal selectors that may change at any time. The first group is the
// current embed layout (custom elements / ytw* classes); the .ytp-* group is the older
// layout, which other Chromium versions (e.g. the Electron 22 legacy build) may still serve.
// The player window also sets `pointer-events: none` on the iframe, so clicks on these
// elements do nothing even if the selectors stop matching.
export const EMBED_HIDE_SELECTORS: readonly string[] = [
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
  '.ytp-pause-overlay-container',
  '.ytp-endscreen-content',
  '.ytp-ce-element',
  '.ytp-cards-teaser',
  '.ytp-youtube-button',
  '.ytp-watermark',
  '.ytp-gradient-top',
  '.ytp-chrome-top',
  '.ytp-show-cards-title',
]
