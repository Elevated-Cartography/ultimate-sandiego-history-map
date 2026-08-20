import { reactive, ref } from 'vue'
import { probeArchive } from './archives'
import { siteUrl } from './paths'
import type { BaseStyle, HistoricalMap, Layer, Manifest } from './types'

export const BASE_STYLES: BaseStyle[] = [
  { id: 'bright', label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  { id: 'positron', label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
]

/** Where the map opens if the URL hash doesn't say otherwise: downtown San Diego. */
export const DEFAULT_VIEW = { center: [-117.1611, 32.7157] as [number, number], zoom: 12.2 }

/** Shown on first visit so the map isn't bare — small archive, good downtown coverage. */
const DEFAULT_VISIBLE = 'lowell_1935'
const DEFAULT_OPACITY = 1

export const layers = ref<Layer[]>([])
/** Mirrors the map's live zoom, so the drawer can flag layers that have no tiles yet. */
export const zoom = ref(DEFAULT_VIEW.zoom)
export const baseStyleId = ref(BASE_STYLES[0].id)
export const drawerOpen = ref(window.innerWidth > 820)
export const infoMapId = ref<string | null>(null)

/** Bumped whenever the stacking order changes, so the map can resync in one pass. */
export const orderVersion = ref(0)

export const status = reactive({ loading: true, error: '' as string })

/** map id → why its archive could not be read. Absent means readable, or not yet checked. */
export const archiveErrors = reactive<Record<string, string>>({})
const probed = new Set<string>()

/**
 * Checks one layer's archive, once per session. Only layers that are actually
 * switched on get checked: probing the whole manifest would put a request per
 * archive on every page load to answer a question nobody asked.
 */
export async function checkArchive(map: HistoricalMap) {
  if (probed.has(map.id)) return
  probed.add(map.id)
  const reason = await probeArchive(siteUrl(`maps/${map.file}`))
  if (reason) archiveErrors[map.id] = reason
}

export const layerAt = (id: string) => layers.value.find((l) => l.map.id === id)

export function toggle(id: string) {
  const layer = layerAt(id)
  if (layer) layer.visible = !layer.visible
}

export function setOpacity(id: string, opacity: number) {
  const layer = layerAt(id)
  if (!layer) return
  layer.opacity = opacity
  // Reaching for a hidden layer's opacity means you want to see it.
  if (opacity > 0) layer.visible = true
}

/** Moves a layer within the stack. `to` is clamped, so callers can pass index ± 1 freely. */
export function moveLayer(from: number, to: number) {
  const target = Math.max(0, Math.min(layers.value.length - 1, to))
  if (from === target || from < 0 || from >= layers.value.length) return
  const next = layers.value.slice()
  next.splice(target, 0, ...next.splice(from, 1))
  layers.value = next
  orderVersion.value++
}

export async function loadManifest() {
  try {
    const res = await fetch(siteUrl('maps/manifest.json'))
    if (!res.ok) throw new Error(`manifest.json responded ${res.status}`)
    const manifest = (await res.json()) as Manifest

    // Newest first, so the drawer reads top-down as "most recent on top of the stack".
    const maps = manifest.maps.slice().sort((a, b) => b.year - a.year)
    layers.value = maps.map((map) => ({
      map,
      visible: map.id === DEFAULT_VISIBLE,
      opacity: DEFAULT_OPACITY,
    }))
    applyHashLayers()
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err)
  } finally {
    status.loading = false
  }
}

/* ---------------------------------------------------------------- URL hash --
 * #map=zoom/lat/lon&layers=id:opacityPercent,...  — the layers list is ordered
 * topmost-first and holds only the visible ones, which keeps shared links short.
 */

export interface CameraState {
  center: [number, number]
  zoom: number
}

function hashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

export function readHashCamera(): CameraState | null {
  const parts = hashParams().get('map')?.split('/').map(Number)
  if (!parts || parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [zoom, lat, lon] = parts
  return { center: [lon, lat], zoom }
}

function applyHashLayers() {
  const raw = hashParams().get('layers')
  if (raw === null) return

  const requested = raw
    .split(',')
    .filter(Boolean)
    .map((token) => {
      const [id, pct] = token.split(':')
      return { id, opacity: Number(pct) / 100 }
    })
    .filter(({ id, opacity }) => layerAt(id) && Number.isFinite(opacity))

  for (const layer of layers.value) layer.visible = false

  const ordered: Layer[] = []
  for (const { id, opacity } of requested) {
    const layer = layerAt(id)!
    layer.visible = true
    layer.opacity = Math.max(0, Math.min(1, opacity))
    ordered.push(layer)
  }
  // Hidden layers keep their default relative order, stacked underneath.
  layers.value = [...ordered, ...layers.value.filter((l) => !ordered.includes(l))]
}

export function writeHash(camera: CameraState) {
  const visible = layers.value
    .filter((l) => l.visible)
    .map((l) => `${l.map.id}:${Math.round(l.opacity * 100)}`)
    .join(',')

  const hash =
    `#map=${camera.zoom.toFixed(2)}/${camera.center[1].toFixed(5)}/${camera.center[0].toFixed(5)}` +
    `&layers=${visible}`

  // replaceState keeps panning out of the browser's back history.
  window.history.replaceState(null, '', hash)
}
