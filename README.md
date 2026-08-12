# San Diego History Map

An interactive map of San Diego that overlays georeferenced historical maps on a modern
base map. Each historical map is a layer you can switch on, restack, and fade.

Vue 3 + TypeScript + MapLibre GL, with the historical scans stored as [PMTiles](https://docs.protomaps.com/pmtiles/)
archives and the base map served by [OpenFreeMap](https://openfreemap.org/) (Bright by default,
with Positron as a quieter alternative). The whole thing is static — no tile server, no backend.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/, including a copy of maps/
npm run preview  # serve the built site
```

## How the maps are wired up

`maps/` holds one `.pmtiles` archive per historical map plus `manifest.json`, which is the
single source of truth for what the app shows. The archives are not in `public/` — a small
plugin in [vite.config.ts](vite.config.ts) serves them at `/maps/*` during development
(with the HTTP range support PMTiles needs) and copies them into `dist/` on build.

PMTiles reads each archive with ranged requests instead of downloading it whole, so a 26 MB
map only costs the handful of tiles actually on screen.

### Adding a map

1. Drop the new `.pmtiles` archive in `maps/`.
2. Add an entry to `maps/manifest.json` with at least `id`, `file`, `title`, and `year`.
   `author`, `publisher`, `source`, `src_url`, and `description` are optional and show up in
   the layer's details dialog.
3. Run `npm run manifest:enrich`.

That last step reads each archive's header and fills in `bounds`, `center`, `minzoom`,
`maxzoom`, `tileType`, and `tileSize`. Those aren't hand-editable bookkeeping — the app uses
them to frame "zoom to this map", to avoid drawing a layer at zooms where the archive has no
tiles, and to pick the right `tileSize` (getting that wrong puts every overlay a full zoom
level off). The script also warns about archives in `maps/` that no manifest entry mentions.

## Interface notes

- The drawer lists layers **topmost first**. Drag the grip, or use the arrow buttons, to
  restack; the map's draw order follows the list.
- Overlays draw above the whole base style, labels included. Drop a layer's opacity to read
  modern street names through it.
- A layer switched on below its archive's minimum zoom says so, rather than silently drawing
  nothing.
- The URL hash carries the camera and the visible layers with their opacities, so a view can
  be linked to.
- The geolocate button (bottom right) shows your position; the browser asks permission first
  and nothing is requested until you press it.

## Deployment

Pushing to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml),
which builds and publishes `dist/` to GitHub Pages. Enable Pages for the repo with
**Settings → Pages → Source: GitHub Actions**.

Vite is configured with a relative `base`, so the site works at a project subpath
(`user.github.io/repo/`) or at a custom domain root without changing config. GitHub Pages
serves range requests, which is what makes hosting the PMTiles archives there work at all.

The archives currently total ~80 MB, comfortably inside the 1 GB Pages limit, though each
individual file must stay under 100 MB.

## Credits

Historical scans come from the [David Rumsey Map Collection](https://www.davidrumsey.com/)
and the [Panama-California Exposition Digital Archive](https://pancalarchive.org/); per-map
provenance and links are in each layer's details dialog. Base map tiles by OpenFreeMap and
OpenMapTiles from OpenStreetMap data.
