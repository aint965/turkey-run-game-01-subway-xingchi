// test_combo.mjs — verifikasi kombo jagung + jagung emas di sim (tanpa browser).
// Impor hanya world/patterns/random/config (tidak menyentuh render.js/three,
// jadi bisa jalan di Node). Pemakaian: node tools/verify/test_combo.mjs
import { createRandom } from '../../game/src/random.js';
import { createWorld } from '../../game/src/world.js';
import { generateCornLine } from '../../game/src/patterns.js';
import { STEP } from '../../game/src/config.js';

const rnd = createRandom(7);
// 1. Laju jagung emas: 2000 garis.
let goldenLines = 0;
for (let i = 0; i < 2000; i += 1) {
  if (generateCornLine(rnd, -95, 2.2)[0].golden) goldenLines += 1;
}
console.log(`garis emas: ${goldenLines}/2000 = ${(goldenLines / 20).toFixed(1)}% (target ~12%)`);

// 2. Kombo: kumpulkan 20 jagung biasa beruntun (tanpa hit).
const w = createWorld(createRandom(11));
const s = w.state;
const idle = { move: 0, jump: false, slide: false };
function feedCorn(golden) {
  const corn = s.corns.find((c) => !c.active);
  corn.active = true;
  corn.lane = s.player.lane;
  corn.x = s.player.x;
  corn.y = s.player.y + 0.7;
  corn.z = 0;
  corn.golden = golden;
  w.step(STEP, idle);
}
for (let i = 0; i < 20; i += 1) feedCorn(false);
console.log(`setelah 20 jagung biasa: coins=${s.coins} combo=${s.combo} mult=x${s.comboMult} bonus=${s.bonus} (harap ${25 * 7 + 50 * 8 + 75 * 5}) skor=${s.score}`);
// 3. Jagung emas di kombo x3: 1 emas = 5*25*3 = 375.
const before = s.bonus;
feedCorn(true);
console.log(`+1 jagung emas (kombo x3): bonus +${s.bonus - before} (harap 375)`);
// 4. Kombo putus saat kena tabrakan.
w.spawnObstacle('oven', s.player.lane, 0);
w.step(STEP, idle);
console.log(`setelah tabrakan: lives=${s.lives} combo=${s.combo} mult=x${s.comboMult} (harap combo 0, mult x1)`);
