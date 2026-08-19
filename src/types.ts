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

/* -------------------------------------------------------------- annotations -- */

export interface AnnotationImage {
  /** Site-relative path, e.g. "annotations/images/lowell_1935/a1b2.png". */
  src: string
  caption?: string
}

export interface AnnotationProperties {
  title: string
  /** Markdown, rendered in the sidebar. */
  body: string
  images: AnnotationImage[]
}

/**
 * A single annotated area. The id is duplicated into properties because MapLibre
 * paint expressions can read properties but not a Feature's top-level id.
 */
export type AnnotationFeature = GeoJSON.Feature<GeoJSON.Polygon, AnnotationProperties & { id: string }> & {
  id: string
}

export interface AnnotationCollection extends GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  features: AnnotationFeature[]
}

/** annotations/index.json — the map ids that have at least one annotation. */
export interface AnnotationIndex {
  maps: string[]
}
