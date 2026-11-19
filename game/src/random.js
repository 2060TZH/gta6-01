// Seeded random numbers (mulberry32) so a screenshot seed always stages the same city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

/** Clamp a value into [min, max]; NaN falls through to min so a bad number can never escape. */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}
