<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import AnnotationForm from './AnnotationForm.vue'
import { fetchAnnotations, saveAnnotations } from './api'
import { BASE_STYLES, DEFAULT_VIEW } from '../store'
import { siteUrl } from '../paths'
import type { AnnotationFeature, AnnotationProperties, HistoricalMap, Manifest } from '../types'

const OUTLINE = '#ff7a00'
const OUTLINE_SELECTED = '#ffd24a'

const RASTER_SOURCE = 'editor-raster-src'
const RASTER_LAYER = 'editor-raster'
/** Terra Draw's adapter prefixes every layer it owns with this. */
const DRAW_PREFIX = 'td-'

const container = ref<HTMLDivElement>()
const map = shallowRef<maplibregl.Map>()
const draw = shallowRef<TerraDraw>()

const maps = ref<HistoricalMap[]>([])
const mapId = ref('')
const overlayOpacity = ref(1)

/** Feature id → the editable content. Geometry stays in Terra Draw's own store. */
const records = reactive<Record<string, AnnotationProperties>>({})
const featureIds = ref<string[]>([])
const selectedId = ref<string | null>(null)

/**
 * Set once style.load has fired. Not map.isStyleLoaded(), which also waits on
 * every tile and glyph of the base map and so reads false most of the time.
 */
let styleLoaded = false

const drawMode = ref<'select' | 'polygon'>('select')
const dirty = ref(false)
const saving = ref(false)
const loading = ref(true)
const notice = ref('')
const error = ref('')

/** Set while we mutate the draw store ourselves, so loading doesn't look like an edit. */
let programmatic = false

const selectedRecord = computed(() => (selectedId.value ? records[selectedId.value] : undefined))

const blank = (): AnnotationProperties => ({ title: '', body: '', images: [] })

const label = (id: string) => records[id]?.title || 'Untitled area'

/* ------------------------------------------------------------- draw store -- */

/** Terra Draw's store also holds selection handles and midpoints; only ours count. */
const polygons = () =>
  (draw.value?.getSnapshot() ?? []).filter(
    (f) => f.properties?.mode === 'polygon' && f.geometry.type === 'Polygon',
  )

const refreshList = () => (featureIds.value = polygons().map((f) => String(f.id)))

function markDirty() {
  if (!programmatic) dirty.value = true
}

/* ----------------------------------------------------------------- actions -- */

function setMode(mode: 'select' | 'polygon') {
  drawMode.value = mode
  draw.value?.setMode(mode)
}

function select(id: string) {
  // Selecting always happens through Terra Draw, so its handles follow along.
  setMode('select')
  draw.value?.selectFeature(id)
}

function deleteSelected() {
  const id = selectedId.value
  if (!id || !draw.value) return
  draw.value.removeFeatures([id])
  delete records[id]
  selectedId.value = null
  dirty.value = true
  refreshList()
}

function zoomToSelected() {
  const m = map.value
  const feature = polygons().find((f) => String(f.id) === selectedId.value)
  if (!m || !feature) return

  const bounds = new maplibregl.LngLatBounds()
  for (const ring of (feature.geometry as GeoJSON.Polygon).coordinates) {
    for (const [lon, lat] of ring) bounds.extend([lon, lat])
  }
  m.fitBounds(bounds, { padding: 120, duration: 700 })
}

async function save() {
  if (!mapId.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const features: AnnotationFeature[] = polygons().map((f) => {
      const id = String(f.id)
      const record = records[id] ?? blank()
      return {
        type: 'Feature',
        id,
        // id is mirrored into properties because MapLibre paint expressions can
        // read properties but not a feature's top-level id.
        properties: { id, title: record.title, body: record.body, images: record.images },
        geometry: f.geometry as GeoJSON.Polygon,
      }
    })

    await saveAnnotations(mapId.value, features)
    dirty.value = false
    notice.value = `Saved ${features.length} area${features.length === 1 ? '' : 's'}`
    setTimeout(() => (notice.value = ''), 2500)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

/* -------------------------------------------------------------- map wiring -- */

/** Puts Terra Draw's own layers back on top after we touch the style. */
function raiseDrawLayers() {
  const m = map.value
  if (!m) return
  for (const layer of m.getStyle().layers) {
    if (layer.id.startsWith(DRAW_PREFIX)) m.moveLayer(layer.id)
  }
}

function showOverlay(target: HistoricalMap | undefined) {
  const m = map.value
  if (!m || !styleLoaded) return

  if (m.getLayer(RASTER_LAYER)) m.removeLayer(RASTER_LAYER)
  if (m.getSource(RASTER_SOURCE)) m.removeSource(RASTER_SOURCE)
  if (!target) return

  m.addSource(RASTER_SOURCE, {
    type: 'raster',
    url: `pmtiles://${siteUrl(`maps/${target.file}`)}`,
    tileSize: target.tileSize,
  })
  m.addLayer({
    id: RASTER_LAYER,
    type: 'raster',
    source: RASTER_SOURCE,
    minzoom: target.minzoom,
    paint: { 'raster-opacity': overlayOpacity.value },
  })
  raiseDrawLayers()
}

/** Swaps in another map's raster and annotations. Guards unsaved work first. */
async function openMap(id: string) {
  const target = maps.value.find((m) => m.id === id)
  if (!target) return

  loading.value = true
  error.value = ''
  programmatic = true
  draw.value?.clear()
  for (const key of Object.keys(records)) delete records[key]
  selectedId.value = null
  refreshList()

  // The scan goes up before anything is awaited. Annotations are secondary; a
  // slow or failing fetch must never leave you looking at a blank base map and
  // wondering whether picking the map did anything at all.
  showOverlay(target)
  // Frame the scan, but never settle below the zoom where its tiles begin —
  // landing on a blank map would look like the overlay failed to load.
  const camera = map.value?.cameraForBounds(target.bounds, { padding: 60 })
  if (camera) map.value?.jumpTo({ ...camera, zoom: Math.max(camera.zoom ?? target.minzoom, target.minzoom) })
  window.location.hash = `map=${id}`

  try {
    const features = await fetchAnnotations(id)
    for (const feature of features) {
      records[feature.id] = {
        title: feature.properties?.title ?? '',
        body: feature.properties?.body ?? '',
        images: feature.properties?.images ?? [],
      }
    }

    // Terra Draw owns geometry only; it requires the mode tag on anything added.
    const results =
      draw.value?.addFeatures(
        features.map((f) => ({ type: 'Feature', id: f.id, geometry: f.geometry, properties: { mode: 'polygon' } })),
      ) ?? []
    const rejected = results.filter((r) => !r.valid)
    if (rejected.length) error.value = `${rejected.length} saved area(s) could not be loaded`

    refreshList()
    dirty.value = false
  } catch (err) {
    error.value = `Could not load annotations for this map — ${err instanceof Error ? err.message : String(err)}`
  } finally {
    programmatic = false
    loading.value = false
  }
}

function requestMap(id: string) {
  if (id === mapId.value) return
  if (dirty.value && !window.confirm('Discard unsaved changes to this map?')) return
  mapId.value = id
  void openMap(id)
}

function initDraw(m: maplibregl.Map) {
  const instance = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map: m, prefixId: DRAW_PREFIX.slice(0, -1) }),
    // Timestamps would have to round-trip through the .geojson files for no gain.
    tracked: false,
    idStrategy: {
      getId: () => crypto.randomUUID(),
      isValidId: (id) => typeof id === 'string' && id.length > 0,
    },
    modes: [
      new TerraDrawPolygonMode({
        styles: {
          fillColor: OUTLINE,
          fillOpacity: 0.16,
          outlineColor: OUTLINE,
          outlineWidth: 2,
        },
      }),
      new TerraDrawSelectMode({
        // Terra Draw's key handling is document-wide, which would make Delete
        // destructive while typing in the description. Buttons only.
        keyEvents: null,
        flags: {
          polygon: {
            feature: {
              draggable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
        styles: {
          selectedPolygonColor: OUTLINE_SELECTED,
          selectedPolygonFillOpacity: 0.4,
          selectedPolygonOutlineColor: OUTLINE_SELECTED,
          selectedPolygonOutlineWidth: 3,
        },
      }),
    ],
  })

  instance.start()
  instance.setMode('select')

  instance.on('change', () => {
    markDirty()
    refreshList()
  })

  instance.on('finish', (id, context) => {
    if (context.action !== 'draw') return
    // A freshly drawn polygon has nothing to say yet — open it for writing.
    records[String(id)] = blank()
    dirty.value = true
    refreshList()
    select(String(id))
  })

  instance.on('select', (id) => (selectedId.value = String(id)))
  instance.on('deselect', () => (selectedId.value = null))

  draw.value = instance
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)

  const m = new maplibregl.Map({
    container: container.value!,
    style: BASE_STYLES[0].url,
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    maxZoom: 19,
    hash: false,
  })
  map.value = m
  // Handy for poking at style layers from the dev console.
  ;(window as unknown as { __editorMap: maplibregl.Map }).__editorMap = m
  m.on('error', (event) => {
    // Tile hiccups are noisy and self-correcting. A failure before the style is
    // up is fatal, though, and would otherwise leave the editor silently blank.
    if (!styleLoaded) error.value = `Base map failed to load — ${event.error?.message ?? 'unknown error'}`
  })
  m.addControl(new maplibregl.NavigationControl(), 'bottom-right')
  m.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'imperial' }), 'bottom-left')

  try {
    const res = await fetch(siteUrl('maps/manifest.json'))
    if (!res.ok) throw new Error(`manifest.json responded ${res.status}`)
    maps.value = ((await res.json()) as Manifest).maps.slice().sort((a, b) => b.year - a.year)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }

  await new Promise<void>((ready) => m.once('style.load', () => ready()))
  styleLoaded = true
  initDraw(m)

  const requested = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('map')
  mapId.value = (requested && maps.value.some((x) => x.id === requested) ? requested : maps.value[0]?.id) ?? ''
  if (mapId.value) await openMap(mapId.value)
  loading.value = false
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  draw.value?.stop()
  map.value?.remove()
})

watch(overlayOpacity, (value) => {
  if (map.value?.getLayer(RASTER_LAYER)) map.value.setPaintProperty(RASTER_LAYER, 'raster-opacity', value)
})
</script>

<template>
  <div class="editor">
    <header class="bar">
      <div class="brand">
        <strong>Annotation editor</strong>
        <span class="badge">local only</span>
      </div>

      <label class="control">
        <span>Map</span>
        <select :value="mapId" @change="requestMap(($event.target as HTMLSelectElement).value)">
          <option v-for="m in maps" :key="m.id" :value="m.id">{{ m.title }} ({{ m.year }})</option>
        </select>
      </label>

      <label class="control">
        <span>Overlay</span>
        <input v-model.number="overlayOpacity" type="range" min="0" max="1" step="0.05" />
      </label>

      <div class="modes" role="group" aria-label="Tool">
        <button class="tool" :class="{ active: drawMode === 'select' }" type="button" @click="setMode('select')">
          Select
        </button>
        <button class="tool" :class="{ active: drawMode === 'polygon' }" type="button" @click="setMode('polygon')">
          Draw polygon
        </button>
      </div>

      <div class="spacer" />

      <span v-if="error" class="status error">{{ error }}</span>
      <span v-else-if="notice" class="status ok">{{ notice }}</span>
      <span v-else-if="loading" class="status">Loading…</span>
      <span v-else-if="dirty" class="status">Unsaved changes</span>

      <button class="button primary" type="button" :disabled="!dirty || saving" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </header>

    <div class="stage">
      <aside class="list-pane">
        <div class="pane-head">
          <span>Areas</span>
          <span class="count">{{ featureIds.length }}</span>
        </div>
        <p v-if="!featureIds.length" class="muted pad">
          Nothing here yet. Choose <em>Draw polygon</em>, click to place corners, then close the shape.
        </p>
        <ul v-else class="areas">
          <li v-for="id in featureIds" :key="id">
            <button class="area" :class="{ active: id === selectedId }" type="button" @click="select(id)">
              {{ label(id) }}
            </button>
          </li>
        </ul>
      </aside>

      <div ref="container" class="map" />

      <aside class="detail-pane">
        <template v-if="selectedId && selectedRecord">
          <div class="pane-head">
            <span>{{ label(selectedId) }}</span>
            <button class="text-button" type="button" @click="zoomToSelected">Zoom to</button>
          </div>
          <div class="pane-body">
            <AnnotationForm
              :key="selectedId"
              :map-id="mapId"
              :record="selectedRecord"
              @change="dirty = true"
              @delete="deleteSelected"
            />
          </div>
        </template>
        <template v-else>
          <div class="pane-head"><span>No area selected</span></div>
          <p class="muted pad">
            Pick an area on the map or in the list to edit it. Drag its outline to move it, or drag the midpoints to
            reshape it.
          </p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.editor {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
}

.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 14px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 7px;
}
.badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 7px;
}

.control {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-dim);
}
.control input[type='range'] {
  width: 90px;
}
.spacer {
  flex: 1;
}

.modes {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.tool {
  font: inherit;
  font-size: 11.5px;
  font-weight: 550;
  color: var(--text-dim);
  background: none;
  border: 0;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.tool.active {
  color: var(--accent-text);
  background: var(--accent);
}

.status {
  font-size: 11.5px;
  color: var(--text-dim);
}
.status.ok {
  color: var(--accent);
}
.status.error {
  max-width: 40ch;
  color: var(--danger);
}

.stage {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr 380px;
}

.map {
  position: relative;
  min-width: 0;
}

.list-pane,
.detail-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
}
.list-pane {
  border-right: 1px solid var(--line);
}
.detail-pane {
  border-left: 1px solid var(--line);
}

.pane-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  font-size: 11.5px;
  font-weight: 650;
  border-bottom: 1px solid var(--line);
}
.pane-head span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  flex: none;
  font-weight: 500;
  color: var(--text-dim);
}
.pane-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.areas {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  padding: 8px;
  display: grid;
  gap: 3px;
  align-content: start;
}
.area {
  width: 100%;
  font: inherit;
  font-size: 12px;
  text-align: left;
  color: var(--text);
  background: none;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 6px 8px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.area:hover {
  background: var(--surface-2);
}
.area.active {
  color: var(--accent-text);
  background: var(--accent);
  border-color: var(--accent);
}

.muted {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-dim);
}
.pad {
  padding: 12px;
}
</style>
