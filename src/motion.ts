// Per-frame animation state. It lives outside React so the render loop can
// update it 60 times a second without re-rendering components.
//
// The page position runs 0..views-1 and leaf j is mid-turn when pagePos is
// in (j-1, j).

export const motion = {
  pagePos: 0,
  pageVel: 0,
  /**
   * Set while a page is being dragged: the turn position under the pointer.
   * Unbounded, so dragging past the last page can wrap round to the first.
   */
  drag: null as null | { target: number },
};

/** One step of a damped spring. Returns true while still moving. */
export function springStep(
  pos: number,
  vel: number,
  target: number,
  dt: number,
  stiffness: number,
  damping: number,
): [number, number, boolean] {
  const accel = stiffness * (target - pos) - damping * vel;
  const v = vel + accel * dt;
  const p = pos + v * dt;
  const moving = Math.abs(target - p) > 0.0005 || Math.abs(v) > 0.0005;
  return moving ? [p, v, true] : [target, 0, false];
}
