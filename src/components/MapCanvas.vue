<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import {
  BASE_STYLES,
  DEFAULT_VIEW,
  baseStyleId,
  layers,
  orderVersion,
  readHashCamera,
  writeHash,
  zoom,
} from '../store'
import { siteUrl } from '../paths'
import { useAnnotationLayers } from '../annotationLayers'
import type { HistoricalMap, Layer } from '../types'

const container = ref<HTMLDivElement>()
const map = shallowRef<maplibregl.Map>()
/**
 * True between style.load and the next setStyle — i.e. whenever it is safe to
 * add sources and layers. Not the same as map.isStyleLoaded(), which also waits
 * on every tile and image of the base map and so is false most of the time.
 */
const styleReady = ref(false)

const annotations = useAnnotationLayers(map, styleReady)

const sourceId = (layer: Layer) => `hist-src-${layer.map.id}`
const layerId = (layer: Layer) => `hist-${layer.map.id}`

/** (Re)creates every overlay source and layer. Safe to call after a style swap. */
function addOverlays() {
  const m = map.value
  if (!m) return

  for (const layer of layers.value) {
    if (!m.getSource(sourceId(layer))) {
      m.addSource(sourceId(layer), {
        type: 'raster',
        url: `pmtiles://${siteUrl(`maps/${layer.map.file}`)}`,
        tileSize: layer.map.tileSize,
        attribution: layer.map.source ?? '',
      })
    }
    if (!m.getLayer(layerId(layer))) {
      m.addLayer({
        id: layerId(layer),
        type: 'raster',
        source: sourceId(layer),
        // Below the archive's own minzoom there is nothing to draw; above its
        // maxzoom MapLibre overzooms the deepest tiles, which is what we want.
        minzoom: layer.map.minzoom,
        layout: { visibility: layer.visible ? 'visible' : 'none' },
        paint: { 'raster-opacity': layer.opacity, 'raster-fade-duration': 200 },
      })
    }
  }
  syncOrder()
}

/**
 * Walks the stack bottom-up, moving each layer to the top of the style. Each move
 * lands above the previously moved one, so the final draw order matches the drawer
 * read top-to-bottom.
 */
function syncOrder() {
  const m = map.value
  if (!m) return

  for (let i = layers.value.length - 1; i >= 0; i--) {
    const id = layerId(layers.value[i])
    if (m.getLayer(id)) m.moveLayer(id)
  }
  // Restacking rasters would otherwise bury the annotation outlines.
  annotations.raise()
}

onMounted(() => {
  const camera = readHashCamera() ?? DEFAULT_VIEW

  const m = new maplibregl.Map({
    container: container.value!,
    style: BASE_STYLES[0].url,
    center: camera.center,
    zoom: camera.zoom,
    maxZoom: 19,
    hash: false,
    attributionControl: false,
  })
  map.value = m

  // Handy for poking at style layers from the dev console.
  if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = m

  m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
  m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
  m.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    }),
    'bottom-right',
  )
  m.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'imperial' }), 'bottom-left')

  // Fires on the initial load and again after every setStyle, which wipes our layers.
  m.on('style.load', () => {
    styleReady.value = true
    addOverlays()
    annotations.sync()
  })
  annotations.attach(m)
  m.on('move', () => (zoom.value = m.getZoom()))
  m.on('moveend', () => writeHash({ center: m.getCenter().toArray() as [number, number], zoom: m.getZoom() }))
  zoom.value = m.getZoom()
})

onBeforeUnmount(() => map.value?.remove())

watch(baseStyleId, (id) => {
  const style = BASE_STYLES.find((s) => s.id === id)
  if (!style) return
  // The old style's layers go away here and come back on the next style.load.
  styleReady.value = false
  map.value?.setStyle(style.url)
})

// Layers arrive after the manifest loads, which may be before or after style.load.
watch(
  () => layers.value.length,
  () => {
    if (styleReady.value) addOverlays()
  },
)

watch(
  () => layers.value.map((l) => `${l.map.id}:${l.visible}:${l.opacity}`),
  (next, prev) => {
    const m = map.value
    if (!m) return
    for (const [i, key] of next.entries()) {
      if (key === prev?.[i]) continue
      const layer = layers.value[i]
      if (!m.getLayer(layerId(layer))) continue
      m.setLayoutProperty(layerId(layer), 'visibility', layer.visible ? 'visible' : 'none')
      m.setPaintProperty(layerId(layer), 'raster-opacity', layer.opacity)
    }
    writeHash({ center: m.getCenter().toArray() as [number, number], zoom: m.getZoom() })
  },
)

watch(orderVersion, syncOrder)

defineExpose({
  /**
   * Frames a historical map. Wide archives can fit on screen at a zoom below the
   * one where their tiles begin, so never settle above the archive's minzoom —
   * "zoom to this map" that lands on a blank map would be a lie.
   */
  flyTo(target: HistoricalMap) {
    const m = map.value
    if (!m) return
    const camera = m.cameraForBounds(target.bounds, { padding: 60 })
    if (!camera) return
    m.flyTo({ ...camera, zoom: Math.max(camera.zoom ?? target.minzoom, target.minzoom), duration: 900 })
  },
})
</script>

<template>
  <div ref="container" class="map-canvas" />
</template>

<style scoped>
.map-canvas {
  position: absolute;
  inset: 0;
}
</style>
