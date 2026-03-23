/**
 * Deterministic hash from a string → integer.
 * Used so the same word always produces the same swarm.
 */
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash;
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces values in [0, 1).
 */
export function createRng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple 2D Perlin-ish noise using sine harmonics.
 * Good enough for smooth organic motion without extra libs.
 */
export function fbmNoise(x, y, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  for (let i = 0; i < octaves; i++) {
    value +=
      amplitude *
      (Math.sin(x * frequency * 1.7 + Math.cos(y * frequency * 0.9)) *
        Math.cos(y * frequency * 1.3 - Math.sin(x * frequency * 1.1)));
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return value; // roughly [-1, 1]
}

/**
 * Linear interpolation
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp value between min and max
 */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Map a value from one range to another
 */
export function mapRange(v, inMin, inMax, outMin, outMax) {
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}