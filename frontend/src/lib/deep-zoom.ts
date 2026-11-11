/**
 * Zooming a 2D slice past niivue's wheel limit, for the zarr view.
 *
 * niivue's wheel zoom stops at 10x. That is plenty for a volume a few hundred
 * voxels across, and nowhere near enough for a streamed store: a lightsheet
 * chunk 16 000 voxels long still shows almost 3 000 of them across the view
 * at 10x, so its finer pyramid levels can never be seen (niivue picks the
 * level from what is on screen, and at 10x a coarse one covers it).
 *
 * niivue draws any zoom it is given; only its wheel handler clamps. So the
 * zarr view takes over the wheel once the zoom reaches that limit.
 */

/** Where niivue's own wheel zoom stops (`ZOOM_2D_MAX`). */
export const NIIVUE_WHEEL_ZOOM_MAX = 10;

/** Full-resolution voxels left across the view at the deepest zoom. */
const VOXELS_ACROSS_AT_LIMIT = 64;

/**
 * How far the view may zoom in for a volume with these dimensions: until
 * about {@link VOXELS_ACROSS_AT_LIMIT} voxels of its longest axis span the
 * view, and never less than niivue's own limit.
 */
export function deepZoomLimit(dims: ArrayLike<number>): number {
  const longest = Math.max(dims[0] ?? 0, dims[1] ?? 0, dims[2] ?? 0);
  return Math.max(NIIVUE_WHEEL_ZOOM_MAX, longest / VOXELS_ACROSS_AT_LIMIT);
}

/**
 * The zoom one wheel notch moves to, or null to leave the notch to niivue.
 *
 * Below niivue's limit the wheel is niivue's, steps and snapping included.
 * At the limit a notch inward carries on in the same 10% steps, up to
 * `limit`; above it a notch outward steps back, landing exactly on niivue's
 * limit so its own handling resumes from a value it would have produced.
 * (Left to niivue, a notch outward from 40x would jump straight to 10x.)
 */
export function nextDeepZoom(
  zoom: number,
  direction: 1 | -1,
  limit: number,
): number | null {
  if (!Number.isFinite(zoom) || !(limit > NIIVUE_WHEEL_ZOOM_MAX)) return null;
  const atLimit = zoom >= NIIVUE_WHEEL_ZOOM_MAX - 1e-3;
  const beyond = zoom > NIIVUE_WHEEL_ZOOM_MAX + 1e-3;
  if (direction > 0) {
    if (!atLimit) return null;
    return Math.min(limit, zoom * 1.1);
  }
  if (!beyond) return null;
  return Math.max(NIIVUE_WHEEL_ZOOM_MAX, zoom / 1.1);
}

/**
 * The pan that keeps `anchor` (scene units) where it is on screen when the
 * zoom changes. niivue centres a slice view on the scene centre minus the pan
 * and shows 1/zoom of the extent, so holding a point still takes the ratio of
 * the zooms measured from the centre (as niivue's own `zoomPan2DAbout` does).
 */
export function panToHoldAnchor(
  pan: ArrayLike<number>,
  newZoom: number,
  anchor: ArrayLike<number>,
  extentsMin: ArrayLike<number>,
  extentsMax: ArrayLike<number>,
): [number, number, number] {
  const ratio = (pan[3] ?? 1) / newZoom;
  const out: [number, number, number] = [pan[0], pan[1], pan[2]];
  if (!Number.isFinite(ratio) || ratio <= 0) return out;
  for (let axis = 0; axis < 3; axis++) {
    const centre = (extentsMin[axis] + extentsMax[axis]) / 2;
    const offset = anchor[axis] - centre;
    const next = ratio * (offset + pan[axis]) - offset;
    if (Number.isFinite(next)) out[axis] = next;
  }
  return out;
}
