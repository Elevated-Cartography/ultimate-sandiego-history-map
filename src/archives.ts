/**
 * A raster overlay that never appears looks exactly like one that is still
 * loading — the map sits at the right place showing nothing, and you are left
 * guessing whether the archive is missing, the server is gone, or the tiles are
 * simply slow. MapLibre is no help here: a failed tile arrives as a bare `error`
 * event with nothing on it naming the source it came from, and reporting every
 * one of those would mean reporting the ordinary hiccups too.
 *
 * So the archive is checked directly, by reading the handful of header bytes
 * that every PMTiles file starts with.
 */

/** PMTiles v3 archives open with this, followed by a version byte. */
const MAGIC = 'PMTiles'

/** Resolves to null when the archive is readable, or a short reason when it is not. */
export async function probeArchive(url: string): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Range: `bytes=0-${MAGIC.length - 1}` } })
  } catch (err) {
    // A dev server that has gone away, or no network at all: no status to report.
    return err instanceof Error ? err.message : String(err)
  }

  if (!res.ok) return `${res.status} ${res.statusText}`.trim()

  if (res.status !== 206) {
    // The range was ignored and the whole archive is on its way — tens of
    // megabytes we have no use for. Drop it; "reachable" is all we can say.
    void res.body?.cancel()
    return null
  }

  const head = new TextDecoder().decode(await res.arrayBuffer())
  return head.startsWith(MAGIC) ? null : 'not a PMTiles archive'
}
