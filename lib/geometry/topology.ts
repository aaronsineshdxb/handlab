/**
 * Exact surface topology for Three.js geometries.
 *
 * Position-attribute counts over-report vertices (split normals/UVs duplicate
 * them), so V must come from tolerance-merged vertices and E from unique
 * undirected triangle edges. Works for closed solids (χ=2, χ=0 for torus)
 * and open patches like the dome hemisphere (χ=1).
 */
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface SurfaceTopology {
  v: number;
  e: number;
  f: number;
  euler: number;
}

export function surfaceTopology(
  geo: THREE.BufferGeometry,
  tolerance = 1e-4,
): SurfaceTopology {
  // Merge on positions only: seam/pole duplicates share coordinates but
  // differ in normals/UVs, which would defeat a full-attribute merge.
  const posOnly = new THREE.BufferGeometry();
  posOnly.setAttribute("position", geo.attributes.position.clone());
  if (geo.index) posOnly.setIndex(geo.index.clone());
  const merged = mergeVertices(posOnly, tolerance);
  const v = merged.attributes.position.count;
  const index = merged.index;
  // Non-indexed input (rare here): every triple is a face, no shared edges.
  if (!index) {
    const f = Math.floor(v / 3);
    return { v, e: f * 3, f, euler: v - f * 3 + f };
  }
  const idx = index.array;
  const edges = new Set<string>();
  let f = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    if (a === b || b === c || c === a) continue; // degenerate after merge
    f += 1;
    const pairs: Array<[number, number]> = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [u, w] of pairs) {
      edges.add(u < w ? `${u}|${w}` : `${w}|${u}`);
    }
  }
  const e = edges.size;
  return { v, e, f, euler: v - e + f };
}
