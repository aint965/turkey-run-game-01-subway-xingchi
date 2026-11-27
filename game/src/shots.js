// Scene screenshot (?shot=): mainkan aturan asli maju dari world baru dengan
// autopilot sederhana, jadi frame adalah tampilan game sungguhan dan seed yang
// sama selalu memberi frame yang sama.
import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;
const START_SECONDS = 4;
const PLAY_SECONDS = 20; // 20 dtk = ~240 m, masih di zona hijau halaman (lebih terbaca)
const SLIDE_LIMIT_SECONDS = 90;
const END_LIMIT_SECONDS = 600;
/** Horizon pilot yang bagus: diukur via simulate() 20 seed — 2,2 dtk selamat 11/20, 1,4 dtk hanya 5/20. */
export const HORIZON_GOOD = 2.2;
const HORIZON_END = 0.25;

/** Autopilot: lihat ke depan, hindari rintangan, kejar jagung terdekat bila aman. */
export function autopilotAction(state, horizonSeconds) {
  const p = state.player;
  const speed = state.speed;
  const ahead = horizonSeconds * speed;
  const lanes = [0, 1, 2];

  // Rintangan terdekat di tiap jalur (z negatif = di depan, mendekat).
  const nearest = [null, null, null];
  for (const ob of state.obstacles) {
    if (!ob.active || ob.hit || ob.z > 0 || ob.z < -ahead - 12) continue;
    if (nearest[ob.lane] === null || ob.z > nearest[ob.lane].z) nearest[ob.lane] = ob;
  }
  // Jagung terdekat per jalur.
  const cornLane = [null, null, null];
  for (const corn of state.corns) {
    if (!corn.active || corn.z > 0 || corn.z < -26) continue;
    if (cornLane[corn.lane] === null || corn.z > cornLane[corn.lane]) cornLane[corn.lane] = corn.z;
  }

  const threat = nearest[p.lane];
  const threatDist = threat ? -threat.z : Infinity;

  // Daftar rintangan per jalur, terurut dari terdekat (untuk melihat melewati
  // rintangan pertama — mis. oven yang bersembunyi di belakang pagar).
  const byLane = [[], [], []];
  for (const ob of state.obstacles) {
    if (!ob.active || ob.hit || ob.z > 0 || ob.z < -45) continue;
    byLane[ob.lane].push(ob);
  }
  for (const lane of lanes) byLane[lane].sort((a, b) => b.z - a.z);
  /** Jarak ke oven terdekat di jalur (99 bila tak ada); dan ke rintangan apa pun. */
  function ovenDist(lane) {
    for (const ob of byLane[lane]) if (ob.kind === 'oven') return -ob.z;
    return 99;
  }
  function anyDist(lane) {
    return byLane[lane].length === 0 ? 99 : -byLane[lane][0].z;
  }
  /** Skor keamanan jalur: oven jauh lebih penting daripada pagar/pisau. */
  function laneScore(lane) {
    return ovenDist(lane) * 2 + anyDist(lane);
  }

  // 1) Ancaman di jalur sendiri: lompat / slide / pindah jalur.
  // TIMING (diukur dari fisika lompat: airtime 0,77 dtk, y>1 m pada 0,10–0,67 dtk,
  // y>1,9 m hanya pada 0,28–0,48 dtk; rintangan selebar 2,2 m lewat dalam 0,17 dtk):
  // pagar picu saat jarak < speed*0,55, JERAMI (1,9 m) lebih mepet: < speed*0,38
  // — lompat terlalu dini = mendarat sebelum rintangan tiba. Slide 0,7 dtk: picu
  // saat jarak < speed*0,45. Tekan lompat juga saat di udara supaya buffer world
  // (0,15 dtk) mengeksekusinya tepat saat landing (bukan lompat ganda).
  if (threat) {
    if (threat.kind === 'oven') {
      // Pindah ke jalur dengan skor keamanan tertinggi (oven terjauh).
      let bestLane = -1;
      let bestScore = -Infinity;
      for (const lane of lanes) {
        if (lane === p.lane) continue;
        const score = laneScore(lane);
        if (score > bestScore) { bestScore = score; bestLane = lane; }
      }
      if (bestLane >= 0) return { move: Math.sign(bestLane - p.lane), jump: false, slide: false };
      return { move: 0, jump: false, slide: false };
    }
    if (threat.kind === 'fence' || threat.kind === 'hay') {
      // Ada oven di belakang pagar ini? Kalau ya, pindah jalur lebih awal
      // daripada melompat tepat ke depan oven.
      if (ovenDist(p.lane) < 30 && p.grounded && threatDist > speed * 0.55) {
        let bestLane = -1;
        let bestScore = -Infinity;
        for (const lane of lanes) {
          if (lane === p.lane) continue;
          if (ovenDist(lane) < 25) continue;
          const score = laneScore(lane);
          if (score > bestScore) { bestScore = score; bestLane = lane; }
        }
        if (bestLane >= 0) return { move: Math.sign(bestLane - p.lane), jump: false, slide: false };
      }
      // Lompat HANYA saat grounded di sini; lompat udara ditangani buffer di bawah.
      if (p.grounded && threatDist < (threat.kind === 'hay' ? speed * 0.38 : speed * 0.55) && threatDist > 0.5) {
        return { move: 0, jump: true, slide: false };
      }
      // Di udara + ancaman sudah dekat: tekan lompat terus supaya buffer world
      // (0,15 dtk) mengeksekusinya tepat saat landing.
      if (!p.grounded && threatDist < speed * 0.55 && threatDist > 0.5) {
        return { move: 0, jump: true, slide: false };
      }
    }
    if (threat.kind === 'knife' && threatDist < speed * 0.45) {
      return { move: 0, jump: false, slide: true };
    }
    // Ancaman masih jauh: bila jalur lain bebas + ada jagung, pindah lebih awal.
    if (threatDist < ahead) {
      for (const lane of lanes) {
        if (lane === p.lane) continue;
        const other = nearest[lane];
        if ((!other || -other.z > ahead + 6) && cornLane[lane] !== null) {
          return { move: Math.sign(lane - p.lane), jump: false, slide: false };
        }
      }
    }
  }

  // 2) Tanpa ancaman: kejar jagung terdekat bila jalurnya aman.
  let bestLane = -1;
  let bestZ = -Infinity;
  for (const lane of lanes) {
    if (cornLane[lane] === null || cornLane[lane] <= bestZ) continue;
    const other = nearest[lane];
    if (other && -other.z < ahead) continue;
    bestLane = lane;
    bestZ = cornLane[lane];
  }
  if (bestLane >= 0 && bestLane !== p.lane) {
    return { move: Math.sign(bestLane - p.lane), jump: false, slide: false };
  }
  return { move: 0, jump: false, slide: false };
}

function runSeconds(world, seconds, horizon, stopWhen) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(SAMPLE, autopilotAction(world.state, horizon));
    if (stopWhen && stopWhen(world.state, events)) return true;
    if (events & EVENT_OVER) return false;
  }
  return false;
}

/** Set world ke scene bernama; kembalikan screen + skor terbaik untuk HUD. */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'slide' && name !== 'end') {
    runSeconds(world, START_SECONDS, HORIZON_GOOD, null);
    // Kalkun tetap di tengah, tapi panel judul dipindah ke ATAS (CSS) supaya
    // kalkun + trek terlihat di bawahnya.
    world.state.player.invulnerable = 0;
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Ulangi dengan horizon makin panjang sampai pilot selamat (maks 3x).
    for (const horizon of [HORIZON_GOOD, 1.7, 2.0]) {
      world.reset();
      runSeconds(world, PLAY_SECONDS, horizon, null);
      if (world.state.lives > 0) break;
    }
    world.state.player.invulnerable = 0; // jangan sampai kalkun berkedip tak terlihat
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'slide') {
    const caught = runSeconds(world, SLIDE_LIMIT_SECONDS, HORIZON_GOOD, (state) => {
      if (!state.player.sliding) return false;
      for (const ob of state.obstacles) {
        if (ob.active && ob.kind === 'knife' && ob.z > -10 && ob.z < 2) return true;
      }
      return false;
    });
    if (!caught) {
      // Fallback: paksa pose slide di depan pisau (tetap render state asli).
      const ob = world.spawnObstacle('knife', world.state.player.lane, -6);
      if (ob) {
        world.state.player.sliding = true;
        world.state.player.slideT = 0.5;
      }
    }
    world.state.player.invulnerable = 0;
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // end: pilot buruk (horizon pendek) sampai tertangkap.
  runSeconds(world, END_LIMIT_SECONDS, HORIZON_END, null);
  world.state.player.invulnerable = 0;
  return { screen: SCREEN_OVER, best: world.state.score };
}
