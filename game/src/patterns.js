// Pola rintangan + VALIDASI (procedural-gen): SATU seeded RNG untuk semua pola.
// Satu pola = satu baris rintangan (+ kadang garis jagung). Pola yang mustahil
// (ketiga jalur tertutup tanpa celah lompat/slide) DITOLAK + regenerate.
// Baris: tiap jalur berisi null atau { kind: 'fence' | 'hay' | 'oven' | 'knife' }.
import { LANE_COUNT, OBSTACLE } from './config.js';
import { randomInt, randomPick } from './random.js';

/**
 * Baris bisa dilewati bila ADA satu jalur yang: kosong, atau fence/hay (bisa
 * dilompati), atau knife (bisa di-slide). Oven menutup jalur sepenuhnya.
 */
export function rowIsPassable(row) {
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const cell = row[lane];
    if (cell === null) return true;
    if (OBSTACLE[cell.kind].jumpable || OBSTACLE[cell.kind].slidable) return true;
  }
  return false;
}

/** Baris kosong (hanya jagung) selalu valid. */
export function emptyRow() {
  return [null, null, null];
}

function randomObstacleKind(random, difficulty) {
  const bag = ['fence', 'fence', 'hay', 'knife'];
  if (difficulty > 0.25) bag.push('oven');
  if (difficulty > 0.5) bag.push('oven', 'knife');
  if (difficulty > 0.75) bag.push('hay', 'oven');
  return randomPick(random, bag);
}

/**
 * Hasilkan satu baris rintangan. `rejected` menghitung pola yang ditolak
 * validator (dipakai seed sweep). Dijamin mengembalikan baris yang valid.
 */
export function generateRow(random, difficulty, stats) {
  let row = null;
  let tries = 0;
  do {
    row = emptyRow();
    const blocked = 1 + (random() < 0.45 + difficulty * 0.3 ? 1 : 0)
      + (random() < difficulty * 0.35 ? 1 : 0);
    const lanes = [0, 1, 2];
    for (let i = 0; i < blocked && lanes.length > 0; i += 1) {
      const lane = lanes.splice(randomInt(random, lanes.length), 1)[0];
      row[lane] = { kind: randomObstacleKind(random, difficulty) };
    }
    tries += 1;
    if (!rowIsPassable(row)) {
      if (stats) stats.rejected += 1;
      row = null;
    }
  } while (row === null && tries < 20);
  if (row === null) {
    // Darurat (hampir mustahil): satu pagar di jalur acak — selalu bisa dilompati.
    row = emptyRow();
    row[randomInt(random, LANE_COUNT)] = { kind: 'fence' };
    if (stats) stats.rejected += 1;
  }
  if (stats) stats.generated += 1;
  return row;
}

/** Garis jagung: 4-6 jagung sebaris di satu jalur (kadang melengkung naik = ajakan lompat). */
export function generateCornLine(random, zStart, gapZ) {
  const lane = randomInt(random, LANE_COUNT);
  const arc = random() < 0.3; // 30%: garis melengkung ke atas (lompat untuk mengambil)
  const golden = random() < 0.12; // 12%: satu garis jagung EMAS langka (nilai 5x)
  const count = 4 + randomInt(random, 3);
  const corns = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const y = arc ? 0.7 + Math.sin(t * Math.PI) * 1.1 : 0.7;
    corns.push({ lane, z: zStart - i * gapZ, y, golden });
  }
  return corns;
}

/**
 * Seed sweep: hasilkan `patternsPerSeed` pola untuk tiap seed 0..seedCount-1,
 * laporkan berapa pola ditolak validator. Dipakai driver verifikasi.
 */
export function sweepSeeds(seedCount, patternsPerSeed) {
  let generated = 0;
  let rejected = 0;
  // RNG lokal per seed (mulberry32 inline agar fungsi ini murni).
  for (let seed = 0; seed < seedCount; seed += 1) {
    let a = seed | 0;
    const random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const stats = { generated: 0, rejected: 0 };
    for (let i = 0; i < patternsPerSeed; i += 1) {
      const difficulty = Math.min(1, i / patternsPerSeed);
      generateRow(random, difficulty, stats);
    }
    generated += stats.generated;
    rejected += stats.rejected;
  }
  return { seeds: seedCount, patternsPerSeed, generated, rejected };
}
