/**
 * The stage — "look around" parallax.
 *
 * Layers sit at different depths and shift by different amounts as you move the
 * pointer, the way the world does when you move your head in a real cockpit:
 * the sky outside travels furthest, the airframe barely moves, and the HUD is
 * collimated so it tracks the outside rather than the panel.
 *
 * Pure functions are exported and tested; `createStage` wires the DOM.
 */

/** Pointer position mapped to -1..1 in both axes, clamped. */
export function normalise(x, y, rect) {
  const nx = ((x - rect.left) / rect.width) * 2 - 1;
  const ny = ((y - rect.top) / rect.height) * 2 - 1;
  return { x: clamp(nx), y: clamp(ny) };
}

const clamp = v => (v < -1 ? -1 : v > 1 ? 1 : v);

/**
 * Depth per layer, as a fraction of the maximum travel.
 * Negative depth moves against the pointer (nearer than the pivot).
 */
export const DEPTHS = {
  sky: 1.0,      // furthest away, travels most
  hud: 0.62,     // collimated on the canopy glass
  shell: 0.16,   // the airframe you are strapped into
  panel: 0.10,   // instrument panel, effectively fixed
  console: 0.06, // side consoles, closest to you
};

/** Travel in px for a layer at `depth`, given normalised pointer and range. */
export function offsetFor(depth, n, range = 26) {
  return { x: -n.x * depth * range, y: -n.y * depth * range * 0.55 };
}

/** Eased follow so the stage glides rather than snapping to the cursor. */
export function ease(current, target, factor = 0.12) {
  return current + (target - current) * factor;
}

export function createStage(root, { range = 26, reduced = false } = {}) {
  const layers = [...root.querySelectorAll('[data-depth]')].map(el => ({
    el,
    depth: DEPTHS[el.dataset.depth] ?? Number(el.dataset.depth) ?? 0,
    x: 0, y: 0,
  }));

  let target = { x: 0, y: 0 };
  let raf = null;
  let running = false;

  function step() {
    let moving = false;
    for (const l of layers) {
      const want = offsetFor(l.depth, target, range);
      l.x = ease(l.x, want.x);
      l.y = ease(l.y, want.y);
      if (Math.abs(l.x - want.x) > 0.05 || Math.abs(l.y - want.y) > 0.05) moving = true;
      l.el.style.transform = `translate3d(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px, 0)`;
    }
    return moving;
  }

  function apply() {
    raf = step() ? requestAnimationFrame(apply) : (running = false, null);
  }

  /**
   * Apply one step immediately, then keep easing on animation frames. The first
   * step must not wait for a frame: rAF is throttled to nothing in a
   * backgrounded tab, which would leave the view stuck until it regained focus.
   */
  function kick() {
    if (reduced) return;
    step();
    if (running) return;
    running = true;
    raf = requestAnimationFrame(apply);
  }

  function onMove(e) {
    const p = e.touches?.[0] ?? e;
    target = normalise(p.clientX, p.clientY, root.getBoundingClientRect());
    kick();
  }

  function onLeave() {
    target = { x: 0, y: 0 };
    kick();
  }

  if (!reduced) {
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave, { passive: true });
  }

  return {
    /** Manually aim the view, -1..1. Used by the keyboard look controls. */
    look(x, y) { target = { x: clamp(x), y: clamp(y) }; kick(); },
    destroy() {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
