// Kalkun Kabur — boot + satu loop: input dibaca tiap frame, world maju dalam
// fixed step 1/60 detik, renderer menggambar. Layar: title, play, paused, over.
// ?seed=N = seed tetap. ?shot=start|play|slide|end (+&seed=N) men-stage scene itu
// lalu set window.__shotReady untuk screenshot. ?bot=1 = autopilot memainkan
// game lewat jalur aksi yang sama seperti keyboard (untuk verifikasi driver).
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CORN, EVENT_HIT, EVENT_LAND, EVENT_OVER, EVENT_ZONE } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { loadAssets } from './assets.js';
import { stageShot, autopilotAction, HORIZON_GOOD } from './shots.js';
import { sweepSeeds } from './patterns.js';

const MAX_FRAME = 0.25;
const PERF_SAMPLES = 120;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const botMode = params.get('bot') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage mati (private window): skor terbaik hanya bertahan kunjungan ini.
  }
}

function snapshot(world, screen) {
  const s = world.state;
  const p = s.player;
  return {
    screen, seed, time: +s.time.toFixed(2), distance: Math.floor(s.distance),
    speed: +s.speed.toFixed(2), score: s.score, coins: s.coins, lives: s.lives,
    farmerGap: +s.farmerGap.toFixed(2), zoneIndex: s.zoneIndex, caught: s.caught,
    player: {
      lane: p.lane, x: +p.x.toFixed(2), y: +p.y.toFixed(2),
      grounded: p.grounded, sliding: p.sliding, invulnerable: +Math.max(0, p.invulnerable).toFixed(2),
    },
    obstacles: s.obstacles.filter((o) => o.active).length,
    corns: s.corns.filter((c) => c.active).length,
    patternsSpawned: s.patternsSpawned, patternsRejected: s.patternsRejected,
  };
}

async function boot() {
  const { templates, sources } = await loadAssets('./');
  const world = createWorld(createRandom(seed));
  const renderer = createRenderer(canvas, templates);
  const frameTimes = [];
  let bodyMsTotal = 0;
  let bodyMsCount = 0;
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let painted = 0;
  let stepCount = 0;

  function perf() {
    if (frameTimes.length === 0) return { avg: 0, p95: 0, n: 0, drawCalls: 0, triangles: 0 };
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return {
      avg: +avg.toFixed(2), p95: +p95.toFixed(2), n: frameTimes.length,
      drawCalls: renderer.drawCalls, triangles: renderer.triangles,
      renderMs: renderer.renderMs, bodyMs: bodyMsCount === 0 ? 0 : +(bodyMsTotal / bodyMsCount).toFixed(2),
    };
  }

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.click();
    announce(`Bermain. ${world.state.lives} nyawa.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.caught();
    announce(`Tertangkap. Skor ${world.state.score}. Terbaik ${best}.`);
  }

  function applyStepInput(actions) {
    // Aksi bernama -> satu input step. Lompat yang ditekan di udara masuk
    // buffer world (0,15 dtk) lewat jump=true berulang? Tidak: world menyimpan
    // buffer sendiri saat jump=true sekali; main hanya meneruskan just-pressed.
    const move = actions.includes('moveLeft') ? -1 : actions.includes('moveRight') ? 1 : 0;
    return {
      move,
      jump: actions.includes('jump'),
      slide: actions.includes('slide'),
    };
  }

  function stepWorld(stepInput, allowOver = true) {
    // Hit-stop (juice): bekukan sim sebentar saat tabrakan; render tetap jalan.
    if (world.state.hitStop > 0) {
      world.state.hitStop -= STEP;
      return;
    }
    const events = world.step(STEP, stepInput);
    stepCount += 1;
    if (events & EVENT_HIT) {
      audio.hit();
      renderer.addTrauma(0.55);
      announce(world.state.lives === 1 ? 'Kena! 1 nyawa tersisa.' : `Kena! ${world.state.lives} nyawa tersisa.`);
    }
    if (events & EVENT_CORN) audio.coin();
    if (events & EVENT_LAND) audio.land();
    if (events & EVENT_ZONE) audio.zone();
    if (events & EVENT_OVER && allowOver) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const bodyStart = performance.now();
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    frameTimes.push(dt * 1000);
    if (frameTimes.length > PERF_SAMPLES) frameTimes.shift();
    // SATU takeActions per frame: aksi just-pressed tidak hilang, tidak ganda.
    const actions = input.takeActions();
    if (actions.includes('mute')) {
      const muted = audio.toggleMute();
      announce(muted ? 'Suara mati.' : 'Suara hidup.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions.includes('confirm') || actions.includes('jump')) {
        startGame();
      } else {
        // Attract mode: kalkun lari sendiri di belakang judul.
        accumulator += dt;
        let guard = 0;
        while (accumulator >= STEP && guard < 8) {
          stepWorld(autopilotAction(world.state, 0.7), false);
          accumulator -= STEP;
          guard += 1;
        }
        if (guard >= 8) accumulator = 0;
        if (world.state.lives <= 0) world.reset(); // attract tidak pernah game over
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions.includes('pause')) {
        screen = SCREEN_PAUSED;
        announce('Jeda.');
      } else if (actions.includes('restart')) {
        startGame();
      } else {
        accumulator += dt;
        let guard = 0;
        let first = true;
        while (accumulator >= STEP && guard < 8) {
          const stepInput = botMode
            ? autopilotAction(world.state, HORIZON_GOOD)
            : first ? applyStepInput(actions) : { move: 0, jump: false, slide: false };
          stepWorld(stepInput);
          accumulator -= STEP;
          guard += 1;
          first = false;
        }
        if (guard >= 8) accumulator = 0;
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions.includes('pause') || actions.includes('confirm')) {
        screen = SCREEN_PLAY;
        announce('Bermain.');
      } else if (actions.includes('restart')) {
        startGame();
      }
    } else if (screen === SCREEN_OVER) {
      if (actions.includes('confirm') || actions.includes('jump') || actions.includes('restart')) {
        startGame();
      }
    }
    renderer.draw(world.state, screen, best, dt, null);
    painted += 1;
    bodyMsTotal += performance.now() - bodyStart;
    bodyMsCount += 1;
  }

  function runShot(name) {
    const scene = stageShot(name, world);
    screen = scene.screen;
    best = Math.max(best, scene.best);
    renderer.setPixelRatio(1); // dossier tajam 1280x720 (game biasa pakai 0,5 di headless)
    // Kamera chase mengejar target secara eksponensial (rate 7) — butuh ~40
    // frame untuk konvergen dari posisi awal (0, 4.5, 7.0) ke target
    // (visualGap + 4,5). Dengan 3 frame (v1) kamera masih di posisi awal dan
    // Bram tampak hanya topinya di tepi bawah. World diam selama staging.
    function paint() {
      renderer.draw(world.state, screen, best, STEP, null);
      painted += 1;
      if (painted < 40) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paint);
  }

  // API untuk driver verifikasi + debug (bukan cheat gameplay: spawn dipakai tes tabrakan).
  window.__game = {
    get ready() { return painted > 0; },
    get assets() { return sources; },
    state: () => snapshot(world, screen),
    screen: () => screen,
    start: () => startGame(),
    restart: () => startGame(),
    press: (action) => input.inject(action),
    perf,
    sweepSeeds: (n, per) => sweepSeeds(n, per || 60),
    /**
     * Sim murni tanpa render: jalankan autopilot `seconds` detik sim dari seed
     * tertentu, kembalikan hasil. Untuk tuning pilot + verifikasi kelangsungan.
     */
    simulate: (simSeed, seconds, horizon) => {
      const simWorld = createWorld(createRandom(simSeed));
      const steps = Math.floor(seconds / STEP);
      const hits = [];
      const seenHit = new Set();
      for (let i = 0; i < steps; i += 1) {
        const events = simWorld.step(STEP, autopilotAction(simWorld.state, horizon ?? HORIZON_GOOD));
        if (events & EVENT_HIT) {
          for (const ob of simWorld.state.obstacles) {
            if (ob.hit && !seenHit.has(ob)) {
              seenHit.add(ob);
              hits.push({
                kind: ob.kind, lane: ob.lane, dist: Math.floor(simWorld.state.distance),
                playerLane: simWorld.state.player.lane, playerY: +simWorld.state.player.y.toFixed(2),
                sliding: simWorld.state.player.sliding,
              });
            }
          }
        }
        if (events & EVENT_OVER) break;
      }
      const s = simWorld.state;
      return {
        seed: simSeed, distance: Math.floor(s.distance), score: s.score,
        coins: s.coins, lives: s.lives, time: +s.time.toFixed(1),
        patternsSpawned: s.patternsSpawned, patternsRejected: s.patternsRejected,
        hits,
      };
    },
    spawnObstacle: (kind, lane, z) => world.spawnObstacle(kind, lane, z),
    setMuted: (m) => { if (audio.isMuted() !== m) audio.toggleMute(); },
    isMuted: () => audio.isMuted(),
    stepCount: () => stepCount,
  };

  if (shot) runShot(shot);
  else {
    if (botMode) {
      // Bot: mulai langsung agar driver bisa mengukur permainan penuh.
      startGame();
    }
    announce('Kalkun Kabur. Tekan Spasi atau klik untuk lari dari Bram.');
    requestAnimationFrame(frame);
  }
}

boot().catch((error) => {
  document.getElementById('status').textContent = `Gagal memuat: ${error.message}`;
  throw error;
});
