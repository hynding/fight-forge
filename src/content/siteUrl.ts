// Content names files shipped with the game by site paths ("/models/x.glb").
// The game may be served from a sub-path (GitHub Pages serves a project at
// /<repo>/), so turn a site path into a URL under the app's base.

const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')

/** "/models/x.glb" → "<base>/models/x.glb"; anything else (blob:, data:, relative) unchanged. */
export const siteUrl = (path: string): string => (/^\/(?!\/)/.test(path) && !path.startsWith(`${base}/`) ? `${base}${path}` : path)
