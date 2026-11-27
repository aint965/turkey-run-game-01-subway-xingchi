// Simulasi murni (tanpa Three.js / tanpa browser): kalkun 3 jalur, rintangan,
// jagung, petani Bram yang mengejar, nyawa, skor, zona. step() maju satu fixed
// step dan mengembalikan event sebagai bit flag. Tidak ada alokasi setelah
// createWorld — obstacle + jagung dari pool yang dipakai ulang.
import {
  CORN_POINTS, FARMER, LANES, LANE_COUNT, LIVES, OBSTACLE, PLAYER, RUN,
  SPAWN_Z, KILL_Z, STEP, ZONES,
} from './config.js';
import { generateCornLine, generateRow } from './patterns.js';
import { randomInt } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_CORN = 2;
export const EVENT_OVER = 4;
export const EVENT_ZONE = 8;
export const EVENT_LAND = 16;

const OBSTACLE_POOL = 24;
const CORN_POOL = 48;
const JUMP_BUFFER = 0.15;

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function createWorld(random) {
  const player = {
    lane: 1, x: 0, targetX: 0, y: 0, vy: 0, grounded: true,
    sliding: false, slideT: 0, invulnerable: 0, runPhase: 0,
    squash: 0, // juice visual (render saja): 1 = regang lompat, -1 = gepeng landing
  };
  const obstacles = [];
  for (let i = 0; i < OBSTACLE_POOL; i += 1) {
    obstacles.push({ active: false, kind: 'fence', lane: 1, x: 0, z: 0, phase: 0, hit: false });
  }
  const corns = [];
  for (let i = 0; i < CORN_POOL; i += 1) {
    corns.push({ active: false, lane: 1, x: 0, y: 0.7, z: 0, golden: false });
  }
  const state = {
    player, obstacles, corns,
    time: 0, distance: 0, speed: RUN.startSpeed,
    score: 0, coins: 0, lives: LIVES,
    farmerGap: FARMER.gapStart, timeSinceHit: 99,
    zoneIndex: 0, hitStop: 0, caught: false, caughtT: 0,
    patternsSpawned: 0, patternsRejected: 0,
    // Kombo jagung: beruntun tanpa kena hit -> pengali (8+ = x2, 16+ = x3).
    // bonus = poin jagung terkumpul (skor = jarak + bonus).
    combo: 0, comboMult: 1, bonus: 0,
  };

  let jumpBuffer = 0;
  let nextPatternAt = 55;
  let nextCornAt = 30;

  function reset() {
    player.lane = 1;
    player.x = 0;
    player.targetX = 0;
    player.y = 0;
    player.vy = 0;
    player.grounded = true;
    player.sliding = false;
    player.slideT = 0;
    player.invulnerable = 0;
    player.runPhase = 0;
    player.squash = 0;
    for (const ob of obstacles) { ob.active = false; ob.hit = false; }
    for (const corn of corns) { corn.active = false; corn.golden = false; }
    state.time = 0;
    state.distance = 0;
    state.speed = RUN.startSpeed;
    state.score = 0;
    state.coins = 0;
    state.combo = 0;
    state.comboMult = 1;
    state.bonus = 0;
    state.lives = LIVES;
    state.farmerGap = FARMER.gapStart;
    state.timeSinceHit = 99;
    state.zoneIndex = 0;
    state.hitStop = 0;
    state.caught = false;
    state.caughtT = 0;
    state.patternsSpawned = 0;
    state.patternsRejected = 0;
    jumpBuffer = 0;
    nextPatternAt = 55;
    nextCornAt = 30;
  }

  function freeObstacle() {
    for (const ob of obstacles) if (!ob.active) return ob;
    return null;
  }

  function freeCorn() {
    for (const corn of corns) if (!corn.active) return corn;
    return null;
  }

  function spawnRow() {
    const difficulty = Math.min(1, state.distance / 900);
    const stats = { generated: 0, rejected: 0 };
    const row = generateRow(random, difficulty, stats);
    state.patternsSpawned += stats.generated;
    state.patternsRejected += stats.rejected;
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const cell = row[lane];
      if (!cell) continue;
      const ob = freeObstacle();
      if (!ob) return;
      ob.active = true;
      ob.kind = cell.kind;
      ob.lane = lane;
      ob.x = LANES[lane];
      ob.z = SPAWN_Z;
      ob.phase = random() * Math.PI * 2;
      ob.hit = false;
    }
  }

  function spawnCornLine() {
    const line = generateCornLine(random, SPAWN_Z, 2.2);
    for (const c of line) {
      const corn = freeCorn();
      if (!corn) return;
      corn.active = true;
      corn.lane = c.lane;
      corn.x = LANES[c.lane];
      corn.y = c.y;
      corn.z = c.z;
      corn.golden = !!c.golden;
    }
  }

  /** Untuk driver tes: taruh rintangan persis di jalur pemain (tabrakan nyata). */
  function spawnObstacle(kind, lane, z) {
    const ob = freeObstacle();
    if (!ob) return null;
    ob.active = true;
    ob.kind = kind;
    ob.lane = lane;
    ob.x = LANES[lane];
    ob.z = z;
    ob.phase = 0;
    ob.hit = false;
    return ob;
  }

  function knifeHits(ob) {
    // Pisau pendulum: pivot di (x, 3.0), bilah 1.9 m. Jarak pemain ke segmen bilah.
    const angle = Math.sin(state.time * 2.4 + ob.phase) * 0.55;
    const tipX = ob.x + Math.sin(angle) * 1.9;
    const tipY = 3.0 - Math.cos(angle) * 1.9;
    const centerY = player.y + (player.sliding ? 0.31 : 0.68);
    return distToSegment(player.x, centerY, ob.x, 3.0, tipX, tipY) < 0.5;
  }

  function obstacleHits(ob) {
    const dx = Math.abs(player.x - ob.x);
    if (ob.kind === 'fence') return dx < 1.05 && player.y < OBSTACLE.fence.height;
    if (ob.kind === 'oven') return dx < 1.2;
    if (ob.kind === 'hay') {
      if (player.y >= OBSTACLE.hay.height) return false;
      const half = 0.95 * (1 - player.y / OBSTACLE.hay.height);
      return dx < half + 0.35;
    }
    if (ob.kind === 'knife') return knifeHits(ob);
    return false;
  }

  /**
   * Satu fixed step. `input` = { move: -1|0|1, jump: bool, slide: bool } —
   * jump/slide adalah just-pressed di frame ini. Buffer lompat 0,15 dtk hidup
   * di dalam world: lompat sesaat sebelum landing tetap dieksekusi.
   */
  function step(dt, input) {
    let events = 0;
    state.time += dt;
    state.timeSinceHit += dt;
    state.distance += state.speed * dt;
    state.speed = Math.min(RUN.maxSpeed, RUN.startSpeed + state.distance * RUN.accelPerMeter);
    state.score = Math.floor(state.distance) + state.bonus;

    const zoneIndex = state.distance < ZONES[0].until ? 0
      : state.distance < ZONES[1].until ? 1 : 2;
    if (zoneIndex !== state.zoneIndex) {
      state.zoneIndex = zoneIndex;
      events |= EVENT_ZONE;
    }

    // Pindah jalur: target berubah, x mendekat eksponensial (eased, bukan teleport).
    if (input.move !== 0) {
      const next = Math.max(0, Math.min(LANE_COUNT - 1, player.lane + input.move));
      if (next !== player.lane) {
        player.lane = next;
        player.targetX = LANES[next];
      }
    }
    const ease = 1 - Math.exp(-12 * dt);
    player.x += (player.targetX - player.x) * ease;

    // Lompat + buffer.
    if (input.jump) jumpBuffer = JUMP_BUFFER;
    else if (jumpBuffer > 0) jumpBuffer -= dt;
    if (jumpBuffer > 0 && player.grounded) {
      player.vy = PLAYER.jumpVelocity;
      player.grounded = false;
      player.sliding = false;
      player.slideT = 0;
      player.squash = 1; // regang saat lompat
      jumpBuffer = 0;
    }
    if (input.slide) {
      if (player.grounded) {
        player.sliding = true;
        player.slideT = RUN.slideTime;
      } else {
        player.vy = Math.min(player.vy, -14); // jatuh cepat
      }
    }
    if (player.sliding) {
      player.slideT -= dt;
      if (player.slideT <= 0) player.sliding = false;
    }

    // Gravitasi + landing.
    if (!player.grounded) {
      player.vy -= PLAYER.gravity * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        player.grounded = true;
        player.squash = -1; // gepeng saat landing
        events |= EVENT_LAND;
      }
    }
    player.squash *= Math.exp(-8 * dt);
    if (Math.abs(player.squash) < 0.02) player.squash = 0;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    player.runPhase += dt * state.speed * 0.9;

    // Petani pulih perlahan saat aman.
    if (state.timeSinceHit > 2 && state.farmerGap < FARMER.gapMax) {
      state.farmerGap = Math.min(FARMER.gapMax, state.farmerGap + FARMER.recoverPerSecond * dt);
    }

    // Spawn pola + jagung berbasis jarak.
    if (state.distance >= nextPatternAt) {
      spawnRow();
      const gap = Math.max(18, Math.min(30, 16 + state.speed * 0.45));
      nextPatternAt = state.distance + gap + random() * 8;
    }
    if (state.distance >= nextCornAt) {
      spawnCornLine();
      nextCornAt = state.distance + 26 + random() * 22;
    }

    // Gerakkan + tabrakan rintangan.
    for (const ob of obstacles) {
      if (!ob.active) continue;
      ob.z += state.speed * dt;
      if (ob.z > KILL_Z) { ob.active = false; continue; }
      if (ob.hit || state.caught) continue;
      if (Math.abs(ob.z) > 1.1) continue;
      if (player.invulnerable > 0) continue;
      if (!obstacleHits(ob)) continue;
      ob.hit = true;
      state.lives -= 1;
      state.combo = 0; // kombo putus saat kena tabrakan
      state.comboMult = 1;
      state.timeSinceHit = 0;
      state.farmerGap = Math.max(FARMER.gapMin, state.farmerGap - FARMER.hitCloser);
      state.hitStop = 0.09;
      player.invulnerable = PLAYER.invulnerable;
      events |= EVENT_HIT;
      if (state.lives <= 0) {
        state.caught = true;
        state.caughtT = 0;
        events |= EVENT_OVER;
      }
    }

    // Jagung.
    for (const corn of corns) {
      if (!corn.active) continue;
      corn.z += state.speed * dt;
      if (corn.z > KILL_Z) { corn.active = false; continue; }
      if (Math.abs(corn.z) > 0.9) continue;
      if (Math.abs(corn.x - player.x) > 0.75) continue;
      if (Math.abs(corn.y - (player.y + 0.7)) > 1.0) continue;
      corn.active = false;
      state.coins += 1;
      // Kombo: jagung beruntun tanpa kena hit menaikkan pengali (8+ = x2,
      // 16+ = x3). Jagung emas langka = 5x nilai jagung biasa.
      state.combo += 1;
      state.comboMult = state.combo >= 16 ? 3 : state.combo >= 8 ? 2 : 1;
      state.bonus += (corn.golden ? 5 * CORN_POINTS : CORN_POINTS) * state.comboMult;
      state.score = Math.floor(state.distance) + state.bonus;
      events |= EVENT_CORN;
    }

    if (state.caught) state.caughtT += dt;
    return events;
  }

  reset();
  return { state, reset, step, spawnObstacle };
}

// Re-export untuk sweep dari main/driver.
export { STEP };
