/**
 * Pure, testable XR input helpers.
 * Maps controller events + XR hand joint pinch onto HandLab's
 * existing tap-vs-hold (380ms / 0.45-unit) gesture semantics.
 */

export interface JointPos {
  x: number;
  y: number;
  z: number;
}

/** Pinch thresholds in metres (Quest hand joints are in session space). */
export const PINCH_DOWN_M = 0.025;
export const PINCH_UP_M = 0.035;

/** Tap = quick press without much cursor travel (mirrors desktop engine). */
export const TAP_MAX_MS = 380;
export const TAP_MAX_MOVE = 0.45;

export function jointDistance(a: JointPos, b: JointPos): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

/** Hysteresis pinch latch: closes below DOWN, opens above UP. */
export function latchPinch(
  distM: number,
  wasPinched: boolean,
  downM = PINCH_DOWN_M,
  upM = PINCH_UP_M,
): boolean {
  if (!wasPinched && distM < downM) return true;
  if (wasPinched && distM > upM) return false;
  return wasPinched;
}

export function isQuickTap(
  downAtMs: number,
  upAtMs: number,
  movedUnits: number,
  maxMs = TAP_MAX_MS,
  maxMove = TAP_MAX_MOVE,
): boolean {
  return upAtMs - downAtMs < maxMs && movedUnits < maxMove;
}

export type Vec3 = [number, number, number];

/** Clamp a cursor target into the HandLab build volume. */
export function clampTarget(
  p: Vec3,
  min: Vec3 = [-4, -2.5, -3.9],
  max: Vec3 = [4, 2.5, 3.9],
): Vec3 {
  return [
    Math.min(max[0], Math.max(min[0], p[0])),
    Math.min(max[1], Math.max(min[1], p[1])),
    Math.min(max[2], Math.max(min[2], p[2])),
  ];
}

/** Thumbstick Y (-1..1) to depth nudge per frame. */
export function stickToDepthDZ(stickY: number, speed = 2.2, dt = 1 / 60): number {
  if (!Number.isFinite(stickY) || Math.abs(stickY) < 0.15) return 0;
  return -stickY * speed * dt;
}
