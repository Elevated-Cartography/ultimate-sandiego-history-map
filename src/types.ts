/** One historical map archive, as described by maps/manifest.json. */
export interface HistoricalMap {
  id: string
  file: string
  title: string
  year: number
  author?: string
  publisher?: string
  source?: string
  src_url?: string
  description?: string
  /** [west, south, east, north] — read from the PMTiles header. */
  bounds: [number, number, number, number]
  center: [number, number]
  minzoom: number
  maxzoom: number
  tileType: string
  /** Pixel size of the archive's tiles, probed from an actual tile at build time. */
  tileSize: number
}

export interface Manifest {
  maps: HistoricalMap[]
}

/** A historical map plus the display state the user controls. */
export interface Layer {
  map: HistoricalMap
  visible: boolean
  /** 0–1, applied as raster-opacity. */
  opacity: number
}

export interface BaseStyle {
  id: string
  label: string
  url: string
}
