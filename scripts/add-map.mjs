// Adds a new archive to maps/manifest.json: you supply the things only a human
// knows (title, year, attribution), and the spatial fields are filled in from the
// archive header by enrich-manifest.mjs, which stays the single source of truth
// for bounds/zooms/tile format.
//
//   npm run map:add -- lowell_1935.pmtiles --title "Street Map" --year 1935
//
// Anything you leave off is prompted for when the terminal is interactive; in a
// script or CI, a missing title or year is an error instead. Re-running for an
// archive that is already listed updates that entry rather than duplicating it.

import { access, readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve } from 'node:path'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const mapsDir = resolve(scriptsDir, '../maps')
const manifestPath = resolve(mapsDir, 'manifest.json')

/** Flag name -> manifest key. The key order here is the key order in the file. */
const FIELDS = {
  title: 'title',
  year: 'year',
  author: 'author',
  publisher: 'publisher',
  source: 'source',
  'src-url': 'src_url',
  description: 'description',
}
const REQUIRED = ['title', 'year']

function usage(message) {
  if (message) console.error(`error: ${message}\n`)
  console.error(`usage: node scripts/add-map.mjs <archive.pmtiles> [options]

  --id <id>           manifest id (default: the file name without .pmtiles)
  --title <text>      map title                                    (required)
  --year <number>     year of publication                          (required)
  --author <text>
  --publisher <text>
  --source <text>     collection the scan came from
  --src-url <url>     page the scan came from
  --description <text>
  --yes               don't prompt for the optional fields`)
  process.exit(message ? 1 : 0)
}

function parseArgs(argv) {
  const opts = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') usage()
    else if (arg === '--yes' || arg === '-y') opts.yes = true
    else if (arg.startsWith('--')) {
      const name = arg.slice(2)
      if (name !== 'id' && !(name in FIELDS)) usage(`unknown option: ${arg}`)
      const value = argv[++i]
      if (value === undefined) usage(`${arg} needs a value`)
      opts[name] = value
    } else positional.push(arg)
  }
  if (positional.length !== 1) usage('expected exactly one archive path')
  return { archive: positional[0], opts }
}

const { archive, opts } = parseArgs(process.argv.slice(2))

// Accept "maps/foo.pmtiles", "foo.pmtiles" or bare "foo" -- they all mean the
// same archive, and the manifest stores it as a bare file name under maps/.
const file = basename(archive).endsWith('.pmtiles') ? basename(archive) : `${basename(archive)}.pmtiles`
try {
  await access(resolve(mapsDir, file))
} catch {
  console.error(`error: maps/${file} does not exist -- generate the archive first`)
  process.exit(1)
}

const id = opts.id ?? file.replace(/\.pmtiles$/, '')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const existing = manifest.maps.find((m) => m.id === id || m.file === file)
if (existing) console.log(`maps/${file} is already listed as "${existing.title}" -- updating it.\n`)

const interactive = process.stdin.isTTY && process.stdout.isTTY
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null

/**
 * readline's question() never settles if stdin closes under it, which would leave
 * the process hanging on a bare Ctrl-D. Turn that into a rejection we can report.
 */
function ask(query) {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error('cancelled'))
    rl.once('close', cancel)
    rl.question(query).then(
      (answer) => {
        rl.off('close', cancel)
        resolve(answer)
      },
      reject,
    )
  })
}

/** Flag if given, else the current value, else a prompt (or an error when required). */
async function field(name) {
  if (opts[name] !== undefined) return opts[name]
  const current = existing?.[FIELDS[name]]
  const required = REQUIRED.includes(name)
  if (!rl || (opts.yes && !required)) return current
  if (!required && !interactive) return current

  const label = current ? `${name} [${current}]` : required ? `${name} (required)` : `${name} (optional)`
  for (;;) {
    const answer = (await ask(`${label}: `)).trim()
    if (answer) return answer
    if (current !== undefined) return current
    if (!required) return undefined
    console.log(`  ${name} is required.`)
  }
}

if (!interactive) {
  for (const name of REQUIRED) {
    if (opts[name] === undefined && existing?.[FIELDS[name]] === undefined) {
      console.error(`error: --${name} is required when stdin is not a terminal`)
      process.exit(1)
    }
  }
}

const entry = { id, file }
try {
  for (const name of Object.keys(FIELDS)) {
    const value = await field(name)
    if (value === undefined || value === '') continue
    if (name === 'year') {
      const year = Number(value)
      if (!Number.isInteger(year)) {
        console.error(`error: --year must be a whole number, got "${value}"`)
        process.exit(1)
      }
      entry.year = year
    } else entry[FIELDS[name]] = value
  }
} catch (err) {
  // Nothing has been written yet, so a Ctrl-D here leaves the manifest untouched.
  console.error(`\n${err.message === 'cancelled' ? 'Cancelled -- manifest unchanged.' : err}`)
  process.exit(1)
} finally {
  rl?.close()
}

// Spatial fields are placeholders only until enrich-manifest runs below; they
// exist so the entry is never written in a shape the app can't parse.
Object.assign(entry, {
  bounds: existing?.bounds ?? [0, 0, 0, 0],
  center: existing?.center ?? [0, 0],
  minzoom: existing?.minzoom ?? 0,
  maxzoom: existing?.maxzoom ?? 0,
  tileType: existing?.tileType ?? 'unknown',
  tileSize: existing?.tileSize ?? 512,
})

manifest.maps = manifest.maps.filter((m) => m !== existing)
manifest.maps.push(entry)
// Oldest first, matching the existing file order. The app restacks by year itself.
manifest.maps.sort((a, b) => a.year - b.year)

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`\n${existing ? 'Updated' : 'Added'} ${id} (${entry.year}) -- reading the archive header:\n`)

// Importing runs it, which fills in bounds/center/zooms/tile format for every
// entry including the one just written.
await import('./enrich-manifest.mjs')
