import { computed, ref } from 'vue'
import { siteUrl } from './paths'
import type { AnnotationCollection, AnnotationFeature, AnnotationIndex } from './types'

/** Map ids known to have annotations. Empty until the index loads (or if it 404s). */
const annotatedMapIds = ref<Set<string>>(new Set())

/** mapId → its features, populated the first time that layer is shown. */
export const annotationsByMap = ref<Record<string, AnnotationFeature[]>>({})

export const selected = ref<{ mapId: string; featureId: string } | null>(null)

/**
 * Master switch for the annotation overlays. Off pulls them from every layer at
 * once, for reading the scans themselves without outlines drawn over them.
 */
export const annotationsVisible = ref(true)

const inFlight = new Set<string>()

export const hasAnnotations = (mapId: string) => annotatedMapIds.value.has(mapId)

/** Whether anything is annotated at all — the toggle is noise on a site with none. */
export const hasAnyAnnotations = computed(() => annotatedMapIds.value.size > 0)

export const selectedFeature = computed<AnnotationFeature | undefined>(() => {
  const sel = selected.value
  if (!sel) return undefined
  return annotationsByMap.value[sel.mapId]?.find((f) => f.id === sel.featureId)
})

export const selectAnnotation = (mapId: string, featureId: string) => (selected.value = { mapId, featureId })
export const clearSelection = () => (selected.value = null)

/**
 * The index is a single small fetch that tells us which maps are worth asking
 * about, so showing a layer without annotations costs no request at all. Missing
 * or malformed, it just means "no annotations anywhere" — never an error state.
 */
export async function loadAnnotationIndex() {
  try {
    const res = await fetch(siteUrl('annotations/index.json'))
    if (!res.ok) return
    const index = (await res.json()) as AnnotationIndex
    annotatedMapIds.value = new Set(index.maps ?? [])
  } catch {
    /* no annotations published yet */
  }
}

/** Fetches one map's annotations at most once. Returns whether anything was added. */
export async function loadAnnotations(mapId: string): Promise<boolean> {
  if (!hasAnnotations(mapId) || mapId in annotationsByMap.value || inFlight.has(mapId)) return false
  inFlight.add(mapId)
  try {
    const res = await fetch(siteUrl(`annotations/${mapId}.geojson`))
    if (!res.ok) throw new Error(String(res.status))
    const collection = (await res.json()) as AnnotationCollection
    annotationsByMap.value = { ...annotationsByMap.value, [mapId]: collection.features ?? [] }
    return true
  } catch {
    // Cache the failure as "none", so a broken file doesn't retry on every pan.
    annotationsByMap.value = { ...annotationsByMap.value, [mapId]: [] }
    return false
  } finally {
    inFlight.delete(mapId)
  }
}
