import type { Position } from 'geojson'
import type { Project, SnapToCustom, TerraDrawMouseEvent, Unproject } from 'terra-draw'

/**
 * Constrains a corner to a fixed set of directions from the corner(s) it is
 * joined to — the "hold Shift for a straight edge" behaviour every drawing tool
 * has. Building footprints and block outlines are overwhelmingly made of
 * straight and square edges, and freehand clicking cannot hit those reliably at
 * any zoom.
 *
 * Terra Draw calls this both on mouse move and on click while drawing, and on
 * every drag frame while editing, so the rubber-band preview and the coordinate
 * that actually lands are snapped the same way.
 */

/** 45° steps: the four compass directions plus the diagonals between them. */
const STEP = Math.PI / 4

/**
 * Angles are measured on screen rather than over the ground. Web Mercator skews
 * everything except due north/south away from its true bearing, so a geographic
 * 45° would land visibly off the diagonal — and it is the drawn shape, not the
 * bearing, that has to look right against the scan underneath.
 */
function snapToAnchors(
  anchors: Position[],
  event: TerraDrawMouseEvent,
  project: Project,
  unproject: Unproject,
  round: (value: number) => number,
): Position | undefined {
  let best: { x: number; y: number; miss: number } | undefined

  for (const anchor of anchors) {
    const from = project(anchor[0], anchor[1])
    const dx = event.containerX - from.x
    const dy = event.containerY - from.y
    if (!dx && !dy) continue

    const angle = Math.round(Math.atan2(dy, dx) / STEP) * STEP
    // Project the cursor onto the chosen ray rather than placing the corner a
    // fixed distance along it, so the edge still grows and shrinks with the mouse.
    const reach = dx * Math.cos(angle) + dy * Math.sin(angle)
    const x = from.x + Math.cos(angle) * reach
    const y = from.y + Math.sin(angle) * reach

    // How far the corner has to leave the cursor to satisfy this anchor. With
    // two of them to choose from, the nearer one is the edge the pointer was
    // already closest to lining up — which is the one you meant to straighten.
    const miss = (x - event.containerX) ** 2 + (y - event.containerY) ** 2
    if (!best || miss < best.miss) best = { x, y, miss }
  }

  if (!best) return undefined
  const { lng, lat } = unproject(best.x, best.y)
  return [round(lng), round(lat)]
}

/**
 * Terra Draw's adapter rounds the coordinates it reads off a pointer event, but
 * not what a custom snap hands back — and it later rejects any feature carrying
 * more precision than this, so an unrounded corner saves fine and then fails to
 * load. Round to the same precision the adapter uses.
 */
const rounder = (precision: number) => (value: number) => Number(value.toFixed(precision))

/** Snapping for a corner being placed: it has one edge so far, back to the previous corner. */
export function createAngleSnap(engaged: () => boolean, precision: number): SnapToCustom {
  const round = rounder(precision)

  return (event, { currentCoordinate, getCurrentGeometrySnapshot, project, unproject }) => {
    // The first corner has nothing to be at an angle to.
    if (!engaged() || !currentCoordinate) return undefined

    const geometry = getCurrentGeometrySnapshot()
    if (geometry?.type !== 'Polygon') return undefined

    // The ring carries the live corner and the closing one after the committed
    // coordinates, so the corner being drawn away from is the last committed one.
    const anchor = geometry.coordinates[0]?.[currentCoordinate - 1]
    if (!anchor) return undefined

    return snapToAnchors([anchor], event, project, unproject, round)
  }
}

/**
 * Snapping for a corner being dragged on a finished area, where both of its
 * edges already exist. Squaring up one of them is what dragging a corner is
 * for; squaring up both at once is not possible from one pointer position, so
 * the closer of the two wins and the other is left alone.
 */
export function createEditAngleSnap(engaged: () => boolean, precision: number): SnapToCustom {
  const round = rounder(precision)

  return (event, { currentCoordinate, getCurrentGeometrySnapshot, project, unproject }) => {
    if (!engaged() || currentCoordinate === undefined) return undefined

    const geometry = getCurrentGeometrySnapshot()
    if (geometry?.type !== 'Polygon') return undefined

    const ring = geometry.coordinates[0]
    // A closed ring repeats its first corner at the end; that duplicate is not a
    // neighbour of anything, and index 0 and the last index are the same corner.
    const corners = (ring?.length ?? 0) - 1
    if (!ring || corners < 3) return undefined

    const index = ((currentCoordinate % corners) + corners) % corners
    const previous = ring[(index - 1 + corners) % corners]
    const next = ring[(index + 1) % corners]

    return snapToAnchors([previous, next], event, project, unproject, round)
  }
}
