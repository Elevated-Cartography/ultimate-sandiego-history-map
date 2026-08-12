/**
 * Resolves a path inside the deployed site to an absolute URL.
 *
 * Vite is configured with a relative `base`, so the site works from any GitHub
 * Pages subpath without knowing the repo name. That makes import.meta.env.BASE_URL
 * a relative "./", which is not a usable base for `new URL()` — resolve against the
 * document instead. PMTiles also needs absolute URLs for its ranged fetches.
 */
export const siteUrl = (path: string) => new URL(path, document.baseURI).href
