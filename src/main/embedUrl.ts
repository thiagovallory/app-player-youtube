const EMBED_HOSTS = new Set(['www.youtube.com', 'www.youtube-nocookie.com'])

export function isYoutubeEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && EMBED_HOSTS.has(u.hostname) && u.pathname.startsWith('/embed/')
  } catch {
    return false
  }
}
