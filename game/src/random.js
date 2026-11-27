// SATU seeded RNG (mulberry32) untuk semua pola — seed yang sama memberi game yang sama,
// yang membuat screenshot scene bisa diulang dan seed sweep bisa diuji.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bilangan bulat 0..n-1 dari rng. */
export function randomInt(random, n) {
  return Math.floor(random() * n);
}

/** Satu elemen acak dari array. */
export function randomPick(random, array) {
  return array[Math.floor(random() * array.length)];
}
