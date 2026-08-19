import { createReadStream, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize, resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * Data directories that live at the repo root rather than in public/, so the app
 * source stays uncluttered and both can be regenerated independently. They are
 * served at /<name>/* in dev and copied into dist/ on build.
 *
 * public/ would have been simpler, but Vite full-page-reloads on any change in
 * there — which would blow away the annotation editor's state every time it saves.
 */
const DATA_DIRS = ['maps', 'annotations'] as const

const annotationsDir = resolve(root, 'annotations')

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.geojson': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

const mimeFor = (file: string) => MIME[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream'

/**
 * Serves the data directories with byte-range support. Range support is not
 * optional: PMTiles fetches byte ranges out of a single archive.
 */
function dataDirsPlugin(): Plugin {
  return {
    name: 'sdhm-data-dirs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const name = DATA_DIRS.find((d) => url.startsWith(`/${d}/`))
        if (!name) return next()

        const baseDir = resolve(root, name)
        // normalize() collapses any ../ before we join, so requests cannot escape baseDir.
        const file = join(baseDir, normalize(decodeURIComponent(url.slice(name.length + 2))))
        if (!file.startsWith(baseDir)) {
          res.statusCode = 403
          return res.end('Forbidden')
        }

        let size: number
        try {
          const stat = statSync(file)
          if (!stat.isFile()) throw new Error('not a file')
          size = stat.size
        } catch {
          res.statusCode = 404
          return res.end('Not found')
        }

        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Type', mimeFor(file))
        res.setHeader('Cache-Control', 'no-cache')

        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
        if (!range) {
          res.setHeader('Content-Length', size)
          return createReadStream(file).pipe(res)
        }

        // A suffix range ("bytes=-500") asks for the final N bytes.
        const [, rawStart, rawEnd] = range
        const start = rawStart === '' ? size - Number(rawEnd) : Number(rawStart)
        const end = rawStart === '' || rawEnd === '' ? size - 1 : Number(rawEnd)
        if (!Number.isFinite(start) || start < 0 || start > end || end >= size) {
          res.statusCode = 416
          res.setHeader('Content-Range', `bytes */${size}`)
          return res.end()
        }

        res.statusCode = 206
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
        res.setHeader('Content-Length', end - start + 1)
        createReadStream(file, { start, end }).pipe(res)
      })
    },
    async closeBundle() {
      for (const name of DATA_DIRS) {
        // annotations/ may not exist yet in a fresh checkout.
        await cp(resolve(root, name), resolve(root, 'dist', name), { recursive: true, force: true }).catch(() => {})
      }
    },
  }
}

/* --------------------------------------------------------- annotation API --
 * Read/write endpoints backing editor.html. This lives in configureServer only,
 * so it exists on a developer's machine and nowhere in the deployed site.
 */

const isMapId = (id: string) => /^[a-z0-9][a-z0-9_-]*$/i.test(id)

/**
 * Uploads are re-encoded to AVIF, matching the format the map tiles already use.
 * Pasted screenshots are typically lossless PNGs several megabytes wide, and
 * these files get committed and served from GitHub Pages — the saving is large.
 *
 * The long-edge cap is generous enough for the lightbox on a retina display and
 * nothing more; nobody prints from this gallery.
 */
const MAX_IMAGE_EDGE = 2400
/** Photographs get inspected up close in the lightbox, so don't skimp here. */
const AVIF_QUALITY = 60
/**
 * Encoder effort. Measured on a 3200x2000 source: effort 3 takes ~1.3s, while
 * effort 4 takes ~10s to save a further 8%. Not worth the wait on every paste.
 */
const AVIF_EFFORT = 3

async function toAvif(body: Buffer, contentType: string): Promise<{ data: Buffer; ext: string }> {
  try {
    // Imported here rather than at module scope so that `vite build`, which
    // evaluates this config, never has to load sharp's native binary.
    const { default: sharp } = await import('sharp')
    const data = await sharp(body, { failOn: 'none' })
      // Bake in EXIF orientation before the metadata is dropped on encode.
      .rotate()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
      .toBuffer()
    return { data, ext: '.avif' }
  } catch {
    // Anything sharp can't read (an animated GIF, a corrupt paste) is kept as-is
    // rather than lost.
    return { data: body, ext: Object.entries(MIME).find(([, m]) => m === contentType)?.[0] ?? '.png' }
  }
}

const readBody = (req: Connect.IncomingMessage) =>
  new Promise<Buffer>((ok, fail) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => ok(Buffer.concat(chunks)))
    req.on('error', fail)
  })

/** Lists the map ids that actually have at least one annotation, for the public site. */
function writeIndex() {
  let files: string[] = []
  try {
    files = readdirSync(annotationsDir).filter((f) => f.endsWith('.geojson'))
  } catch {
    return
  }

  const maps = files
    .filter((f) => {
      try {
        return (JSON.parse(readFileSync(join(annotationsDir, f), 'utf8')).features ?? []).length > 0
      } catch {
        return false
      }
    })
    .map((f) => f.replace(/\.geojson$/, ''))
    .sort()

  writeFileSync(join(annotationsDir, 'index.json'), `${JSON.stringify({ maps }, null, 2)}\n`)
}

function annotationApiPlugin(): Plugin {
  return {
    name: 'sdhm-annotation-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/annotations', async (req, res, next) => {
        const json = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        // req.url is already stripped of the /api/annotations prefix here.
        const path = (req.url ?? '/').split('?')[0]
        const [, mapId, sub] = path.split('/')
        if (!mapId || !isMapId(mapId)) return next()

        try {
          if (sub === 'images' && req.method === 'POST') {
            const body = await readBody(req)
            if (!body.length) return json(400, { error: 'empty upload' })

            const dir = join(annotationsDir, 'images', mapId)
            mkdirSync(dir, { recursive: true })

            // Content-addressed on the *source* bytes, so pasting the same
            // screenshot twice costs one file and skips the re-encode entirely.
            const digest = createHash('sha1').update(body).digest('hex').slice(0, 16)
            const done = (name: string, bytes: number) =>
              json(200, { src: `annotations/images/${mapId}/${name}`, bytes, originalBytes: body.length })

            const existing = readdirSync(dir).find((f) => f.startsWith(digest))
            if (existing) return done(existing, statSync(join(dir, existing)).size)

            const { data, ext } = await toAvif(body, String(req.headers['content-type'] ?? 'image/png'))
            writeFileSync(join(dir, digest + ext), data)
            return done(digest + ext, data.length)
          }

          if (sub) return next()
          const file = join(annotationsDir, `${mapId}.geojson`)

          if (req.method === 'GET') {
            try {
              return json(200, JSON.parse(readFileSync(file, 'utf8')))
            } catch {
              return json(200, { type: 'FeatureCollection', features: [] })
            }
          }

          if (req.method === 'PUT') {
            const parsed = JSON.parse((await readBody(req)).toString('utf8'))
            if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
              return json(400, { error: 'expected a GeoJSON FeatureCollection' })
            }
            mkdirSync(annotationsDir, { recursive: true })
            writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`)
            writeIndex()
            return json(200, { ok: true, features: parsed.features.length })
          }
        } catch (err) {
          return json(500, { error: err instanceof Error ? err.message : String(err) })
        }

        next()
      })
    },
  }
}

export default defineConfig({
  // Relative base keeps the build working under a GitHub Pages project subpath
  // (user.github.io/repo/) without hardcoding the repo name.
  base: './',
  plugins: [vue(), dataDirsPlugin(), annotationApiPlugin()],
  server: {
    // The editor writes into annotations/ constantly; without this every save
    // would trip the watcher and reload the page mid-edit.
    watch: { ignored: DATA_DIRS.map((d) => `**/${d}/**`) },
  },
  build: {
    target: 'es2022',
    // editor.html is deliberately absent: the editor is a local authoring tool
    // and must not ship with the public site.
  },
})
