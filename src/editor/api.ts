import type { AnnotationCollection, AnnotationFeature } from '../types'

/**
 * Talks to the dev-server-only endpoints in vite.config.ts. Nothing here has a
 * counterpart in the deployed site — the published annotations are plain files.
 */
const endpoint = (mapId: string, sub = '') => `/api/annotations/${mapId}${sub}`

async function unwrap(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body
}

export async function fetchAnnotations(mapId: string): Promise<AnnotationFeature[]> {
  const collection = (await unwrap(await fetch(endpoint(mapId)))) as AnnotationCollection
  return collection.features ?? []
}

export async function saveAnnotations(mapId: string, features: AnnotationFeature[]): Promise<void> {
  const collection: AnnotationCollection = { type: 'FeatureCollection', features }
  await unwrap(
    await fetch(endpoint(mapId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collection),
    }),
  )
}

export interface Upload {
  /** Site-relative path the annotation should store. */
  src: string
  /** Size on disk after re-encoding. */
  bytes: number
  originalBytes: number
}

/** Uploads one image. The server re-encodes it to AVIF and content-addresses it. */
export async function uploadImage(mapId: string, blob: Blob): Promise<Upload> {
  return (await unwrap(
    await fetch(endpoint(mapId, '/images'), {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/png' },
      body: blob,
    }),
  )) as Upload
}
