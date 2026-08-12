import { createReadStream, statSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = dirname(fileURLToPath(import.meta.url))
const mapsDir = resolve(root, 'maps')

/**
 * The .pmtiles archives live in maps/ at the repo root rather than public/, so they
 * stay out of the way of the app source and can be regenerated independently. This
 * serves them at /maps/* in dev and copies them into dist/ on build.
 *
 * Range support is not optional: PMTiles fetches byte ranges out of a single archive.
 */
function mapsPlugin(): Plugin {
  return {
    name: 'sdhm-maps',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith('/maps/')) return next()

        // normalize() collapses any ../ before we join, so requests cannot escape maps/.
        const file = join(mapsDir, normalize(decodeURIComponent(url.slice('/maps/'.length))))
        if (!file.startsWith(mapsDir)) {
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
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream')
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
      await cp(mapsDir, resolve(root, 'dist/maps'), { recursive: true })
    },
  }
}

export default defineConfig({
  // Relative base keeps the build working under a GitHub Pages project subpath
  // (user.github.io/repo/) without hardcoding the repo name.
  base: './',
  plugins: [vue(), mapsPlugin()],
  build: {
    target: 'es2022',
  },
})
