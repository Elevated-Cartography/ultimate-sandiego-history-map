// Reads the header of every .pmtiles archive in maps/ and folds its spatial
// metadata (bounds, zoom range, tile format) back into maps/manifest.json, so the
// app never has to guess a layer's extent or hardcode zoom limits.
//
// Run after adding or regenerating an archive:  npm run manifest:enrich

import { open, readFile, writeFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PMTiles } from 'pmtiles'

const mapsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../maps')
const manifestPath = resolve(mapsDir, 'manifest.json')

/** Minimal pmtiles Source backed by a local file handle. */
const fileSource = (path, handle) => ({
  getKey: () => path,
  async getBytes(offset, length) {
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, offset)
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
  },
})

const TILE_TYPES = { 0: 'unknown', 1: 'mvt', 2: 'png', 3: 'jpeg', 4: 'webp', 5: 'avif' }

const round = (n, places = 6) => Number(n.toFixed(places))

const lonToTileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const latToTileY = (lat, z) => {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}

/**
 * Pulls the pixel width out of a raster tile. MapLibre needs the archive's real
 * tile size (256 vs 512) or every overlay sits one zoom level off, and the PMTiles
 * header doesn't record it — so read it out of the encoded image instead.
 *
 * AVIF/WebP/PNG all carry dimensions in a fixed spot near the front of the file:
 * an ISOBMFF `ispe` box, a VP8X chunk, or the PNG IHDR chunk respectively.
 */
function decodeTileWidth(bytes) {
  const buf = Buffer.from(bytes)

  const ispe = buf.indexOf('ispe', 0, 'ascii')
  if (ispe !== -1) return buf.readUInt32BE(ispe + 8) // 4 bytes of version/flags first

  const vp8x = buf.indexOf('VP8X', 0, 'ascii')
  if (vp8x !== -1) return buf.readUIntLE(vp8x + 12, 3) + 1 // canvas width minus one, 24-bit

  const ihdr = buf.indexOf('IHDR', 0, 'ascii')
  if (ihdr !== -1) return buf.readUInt32BE(ihdr + 4)

  return null
}

async function readArchive(file) {
  const path = resolve(mapsDir, file)
  const handle = await open(path, 'r')
  try {
    const archive = new PMTiles(fileSource(path, handle))
    const header = await archive.getHeader()

    const z = header.minZoom
    const tile = await archive.getZxy(z, lonToTileX(header.centerLon, z), latToTileY(header.centerLat, z))
    const tileSize = tile ? decodeTileWidth(tile.data) : null

    return {
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat].map((n) => round(n)),
      center: [round(header.centerLon), round(header.centerLat)],
      minzoom: header.minZoom,
      maxzoom: header.maxZoom,
      tileType: TILE_TYPES[header.tileType] ?? 'unknown',
      tileSize: tileSize ?? 512,
    }
  } finally {
    await handle.close()
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const onDisk = (await readdir(mapsDir)).filter((f) => f.endsWith('.pmtiles'))

for (const entry of manifest.maps) {
  const meta = await readArchive(entry.file)
  Object.assign(entry, meta)
  console.log(
    `${entry.file.padEnd(24)} z${meta.minzoom}-${meta.maxzoom}  ${meta.tileType}@${meta.tileSize}px  [${meta.bounds.join(', ')}]`,
  )
}

const listed = new Set(manifest.maps.map((m) => m.file))
for (const file of onDisk) {
  if (!listed.has(file)) console.warn(`! ${file} is in maps/ but missing from manifest.json`)
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`\nUpdated ${manifest.maps.length} entries in maps/manifest.json`)
