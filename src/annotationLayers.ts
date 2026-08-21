import { watch } from 'vue'
import type { Ref, ShallowRef } from 'vue'
import type maplibregl from 'maplibre-gl'
import type { ExpressionSpecification } from 'maplibre-gl'
import {
  annotationsByMap,
  annotationsVisible,
  clearSelection,
  hasAnnotations,
  loadAnnotations,
  selectAnnotation,
  selected,
} from './annotations'
import { layers } from './store'

/**
 * Amber reads as "drawn on top" against both sepia scans and the blue-and-grey
 * base map, which is the one thing every historical layer here has in common.
 */
const OUTLINE = '#ff7a00'
const OUTLINE_SELECTED = '#ffd24a'
const FILL_OPACITY = 0.16
const FILL_OPACITY_SELECTED = 0.4

const srcId = (mapId: string) => `anno-src-${mapId}`
export const fillId = (mapId: string) => `anno-fill-${mapId}`
const lineId = (mapId: string) => `anno-line-${mapId}`
const mapIdOfFill = (layerId: string) => layerId.slice('anno-fill-'.length)

/** Stands in for "nothing selected" — no generated id looks like this, so nothing matches. */
const NO_SELECTION = '__none__'

const whenSelected = (featureId: string, yes: string | number, no: string | number): ExpressionSpecification => [
  'case',
  ['==', ['get', 'id'], featureId],
  yes,
  no,
]

/**
 * Owns the GeoJSON sources and the fill/outline layers that render annotations,
 * plus the click handling that drives selection. Kept out of MapCanvas so that
 * component stays about the raster stack.
 *
 * `styleReady` gates every style mutation: MapLibre throws "Style is not done
 * loading" if a source or layer is touched before style.load, and layers can
 * become visible (from the URL hash, say) well before the base map is up.
 *
 * Must be called from a component setup(): it registers watchers.
 */
export function useAnnotationLayers(map: ShallowRef<maplibregl.Map | undefined>, styleReady: Ref<boolean>) {
  /** The map, but only once it is safe to add sources and layers to it. */
  const ready = () => (styleReady.value ? map.value : undefined)
  /**
   * Visible layers whose map is known to have annotations, topmost first. Empty
   * while annotations are switched off, which is what makes the master switch
   * work: everything downstream already treats "not active" as "not on the map".
   */
  const activeMapIds = () =>
    annotationsVisible.value ? layers.value.filter((l) => l.visible && hasAnnotations(l.map.id)).map((l) => l.map.id) : []

  const liveFillLayers = (m: maplibregl.Map) =>
    activeMapIds()
      .map(fillId)
      .filter((id) => m.getLayer(id))

  function applySelection(m: maplibregl.Map) {
    const sel = selected.value?.featureId ?? NO_SELECTION
    for (const mapId of activeMapIds()) {
      if (!m.getLayer(fillId(mapId))) continue
      m.setPaintProperty(fillId(mapId), 'fill-opacity', whenSelected(sel, FILL_OPACITY_SELECTED, FILL_OPACITY))
      m.setPaintProperty(lineId(mapId), 'line-width', whenSelected(sel, 4, 2))
      m.setPaintProperty(lineId(mapId), 'line-color', whenSelected(sel, OUTLINE_SELECTED, OUTLINE))
    }
  }

  /**
   * Annotations belong on top of every raster overlay, whatever the stack order
   * is. Walked bottom-up like the raster stack: each move lands above the last,
   * so two annotated maps end up ordered the same way the drawer shows them.
   */
  function raise() {
    const m = ready()
    if (!m) return
    for (const mapId of activeMapIds().reverse()) {
      if (m.getLayer(fillId(mapId))) m.moveLayer(fillId(mapId))
      if (m.getLayer(lineId(mapId))) m.moveLayer(lineId(mapId))
    }
  }

  function remove(m: maplibregl.Map, mapId: string) {
    for (const id of [fillId(mapId), lineId(mapId)]) if (m.getLayer(id)) m.removeLayer(id)
    if (m.getSource(srcId(mapId))) m.removeSource(srcId(mapId))
  }

  /** Reconciles the map with the store. Safe to call after a style swap, which wipes everything. */
  function sync() {
    const m = ready()
    if (!m) return

    const active = activeMapIds()

    for (const layer of layers.value) {
      if (!active.includes(layer.map.id)) remove(m, layer.map.id)
    }

    for (const mapId of active) {
      const features = annotationsByMap.value[mapId]
      if (!features?.length) continue

      const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
      const source = m.getSource(srcId(mapId)) as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(data)
        continue
      }

      m.addSource(srcId(mapId), { type: 'geojson', data })
      m.addLayer({
        id: fillId(mapId),
        type: 'fill',
        source: srcId(mapId),
        paint: { 'fill-color': OUTLINE, 'fill-opacity': FILL_OPACITY },
      })
      m.addLayer({
        id: lineId(mapId),
        type: 'line',
        source: srcId(mapId),
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': OUTLINE, 'line-width': 2, 'line-opacity': 0.95 },
      })
    }

    applySelection(m)
    raise()
  }

  /** Wires click-to-select. Call once, right after the map is constructed. */
  function attach(m: maplibregl.Map) {
    m.on('click', (event) => {
      const targets = liveFillLayers(m)
      const found = targets.length ? m.queryRenderedFeatures(event.point, { layers: targets }) : []
      // Clicking bare map is how you dismiss the sidebar.
      if (!found.length) return clearSelection()

      // Topmost hit wins, matching what the user sees.
      const hit = found[0]
      const id = hit.properties?.id
      if (typeof id === 'string') selectAnnotation(mapIdOfFill(hit.layer.id), id)
    })

    m.on('mousemove', (event) => {
      const targets = liveFillLayers(m)
      const over = targets.length > 0 && m.queryRenderedFeatures(event.point, { layers: targets }).length > 0
      m.getCanvas().style.cursor = over ? 'pointer' : ''
    })
  }

  // Turning a layer on is what triggers its (one-time) fetch.
  watch(
    () => activeMapIds().join(','),
    async (ids) => {
      const active = ids.split(',').filter(Boolean)
      // Hiding a layer strands its selection: the sidebar would go on describing
      // a polygon that is no longer drawn anywhere.
      if (selected.value && !active.includes(selected.value.mapId)) clearSelection()

      sync()
      const loaded = await Promise.all(active.map(loadAnnotations))
      if (loaded.some(Boolean)) sync()
    },
    { immediate: true },
  )

  watch(annotationsByMap, sync)

  watch(selected, () => {
    const m = ready()
    if (m) applySelection(m)
  })

  return { sync, raise, attach }
}
