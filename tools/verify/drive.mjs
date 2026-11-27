// Driver verifikasi Kalkun Kabur: CDP langsung ke Chromium (WebSocket bawaan Node 24).
// - mode shots: buka tiap ?shot= dari shots.json, tunggu __shotReady, screenshot JPEG.
// - mode bot: mainkan game end-to-end (keyboard asli + autopilot), cek tabrakan,
//   3x hit = game over, restart, koin, petani, seed sweep, frame time, 0 error.
// Pemakaian: node drive.mjs --base http://127.0.0.1:8080 --mode all --out screenshots
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME
  || `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell`;
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = getArg('--base', 'http://127.0.0.1:8080');
const MODE = getArg('--mode', 'all');
const OUT = getArg('--out', 'screenshots');
const PORT = Number(getArg('--port', '9333'));

const errors = [];
const logs = [];
const requestUrls = {};
let ws = null;
let msgId = 0;
const pending = new Map();

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails).slice(0, 400)}`);
  return res.result.value;
}

async function key(type, code, keyName, vk) {
  await cdp('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: vk });
}

async function press(code, keyName, vk) {
  await key('keyDown', code, keyName, vk);
  await sleep(60);
  await key('keyUp', code, keyName, vk);
}

async function shot(name) {
  const res = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  writeFileSync(`${OUT}/${name}`, Buffer.from(res.data, 'base64'));
  return `${OUT}/${name}`;
}

async function waitFor(expression, timeoutMs = 30000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evaluate(expression)) return true;
    } catch { /* belum siap */ }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}: ${expression}`);
}

async function navigate(url) {
  await cdp('Page.navigate', { url });
  await sleep(500);
}

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

let failures = 0;
function expect(name, ok, detail = '') {
  if (!check(name, ok, detail)) failures += 1;
}

async function runShots() {
  mkdirSync(OUT, { recursive: true });
  const shots = JSON.parse(readFileSync('shots.json', 'utf8'));
  for (const s of shots) {
    await navigate(`${BASE}/${s.query}`);
    await waitFor('window.__shotReady === true', 60000, `shot ${s.name}`);
    await sleep(400);
    await shot(s.name);
    const state = await evaluate('window.__game ? window.__game.state() : null');
    console.log(`SHOT ${s.name}: screen=${state?.screen} score=${state?.score} dist=${state?.distance}`);
  }
}

async function runBot() {
  // --- 1. Keyboard asli: lane / lompat / slide / pause / restart
  await navigate(`${BASE}/?seed=11`);
  await waitFor('window.__game && window.__game.ready', 30000, 'game ready');
  let st = await evaluate('window.__game.state()');
  expect('title screen awal', st.screen === 'title', st.screen);
  expect('semua aset .glb termuat', Object.values(await evaluate('window.__game.assets')).every((v) => v === 'glb'),
    JSON.stringify(await evaluate('window.__game.assets')));
  await press('Enter', 'Enter', 13);
  await sleep(600);
  st = await evaluate('window.__game.state()');
  expect('Enter memulai permainan', st.screen === 'play', st.screen);
  await press('ArrowLeft', 'ArrowLeft', 37);
  await sleep(700);
  st = await evaluate('window.__game.state()');
  expect('ArrowLeft pindah jalur 1 -> 0', st.player.lane === 0, `lane=${st.player.lane} x=${st.player.x}`);
  await press('ArrowRight', 'ArrowRight', 39);
  await sleep(700);
  st = await evaluate('window.__game.state()');
  expect('ArrowRight pindah jalur 0 -> 1', st.player.lane === 1, `lane=${st.player.lane}`);
  await press('Space', ' ', 32);
  await sleep(250);
  st = await evaluate('window.__game.state()');
  expect('Space melompat (y > 0)', st.player.y > 0.3, `y=${st.player.y}`);
  await waitFor('window.__game.state().player.grounded === true', 15000, 'landing setelah lompat');
  await press('ArrowDown', 'ArrowDown', 40);
  // Polling berbasis state (bukan sleep tetap): sim bisa lebih lambat dari real-time.
  let slid = false;
  for (let i = 0; i < 15; i += 1) {
    await sleep(150);
    st = await evaluate('window.__game.state()');
    if (st.player.sliding) { slid = true; break; }
  }
  expect('ArrowDown slide', slid, `sliding=${st.player.sliding}`);
  await press('KeyP', 'p', 80);
  await waitFor(`window.__game.state().screen === 'paused'`, 10000, 'pause');
  st = await evaluate('window.__game.state()');
  expect('P pause', st.screen === 'paused', st.screen);
  await press('KeyP', 'p', 80);
  await waitFor(`window.__game.state().screen === 'play'`, 10000, 'resume');
  st = await evaluate('window.__game.state()');
  expect('P resume', st.screen === 'play', st.screen);

  // --- 2. Tabrakan nyata: oven di jalur pemain -> nyawa berkurang, Bram mendekat
  // Tunggu berbasis state: sim bisa lebih lambat dari real-time di SwiftShader.
  const before = await evaluate('window.__game.state()');
  await evaluate(`window.__game.spawnObstacle('oven', ${before.player.lane}, -6)`);
  await waitFor(`window.__game.state().lives < ${before.lives}`, 15000, 'tabrakan oven');
  const after = await evaluate('window.__game.state()');
  expect('tabrakan oven: nyawa 3 -> 2', after.lives === before.lives - 1, `lives ${before.lives} -> ${after.lives}`);
  expect('tabrakan: petani mendekat', after.farmerGap < before.farmerGap, `gap ${before.farmerGap} -> ${after.farmerGap}`);

  // --- 3. Dua tabrakan lagi -> tertangkap (game over), lalu restart
  for (let i = 0; i < 2; i += 1) {
    // Tunggu invulnerable habis dulu, kalau tidak oven lewat tanpa hit.
    await waitFor('window.__game.state().player.invulnerable <= 0', 15000, 'invulnerable habis');
    const cur = await evaluate('window.__game.state()');
    await evaluate(`window.__game.spawnObstacle('oven', ${cur.player.lane}, -6)`);
    await waitFor(`window.__game.state().lives < ${cur.lives}`, 15000, 'tabrakan berikutnya');
  }
  st = await evaluate('window.__game.state()');
  expect('3x tabrakan = tertangkap', st.screen === 'over' && st.lives === 0, `screen=${st.screen} lives=${st.lives}`);
  await press('KeyR', 'r', 82);
  await sleep(500);
  st = await evaluate('window.__game.state()');
  expect('R restart instan', st.screen === 'play' && st.lives === 3 && st.distance < 50, `screen=${st.screen} lives=${st.lives}`);

  // --- 4. Autopilot 45 detik: jarak jauh, koin, kecepatan naik
  await navigate(`${BASE}/?bot=1&seed=42`);
  await waitFor('window.__game && window.__game.ready', 30000, 'bot ready');
  const t0 = Date.now();
  let maxDist = 0;
  let maxCoins = 0;
  while (Date.now() - t0 < 45000) {
    const s = await evaluate('window.__game.state()');
    maxDist = Math.max(maxDist, s.distance);
    maxCoins = Math.max(maxCoins, s.coins);
    if (s.screen === 'over') break;
    await sleep(1000);
  }
  const end = await evaluate('window.__game.state()');
  expect('bot: jarak > 400 m', maxDist > 400, `${maxDist} m`);
  expect('bot: koin terkumpul', maxCoins > 0, `${maxCoins} koin`);
  expect('bot: kecepatan naik dari 12', end.speed > 13, `${end.speed} m/s`);
  console.log(`BOT final: screen=${end.screen} dist=${end.distance} score=${end.score} coins=${end.coins} lives=${end.lives}`);

  // --- 5. Seed sweep 200 + frame time + mute
  const sweep = await evaluate('window.__game.sweepSeeds(200, 60)');
  console.log(`SWEEP seeds=${sweep.seeds} generated=${sweep.generated} rejected=${sweep.rejected}`);
  expect('seed sweep 200 seed jalan', sweep.generated === 12000, `generated=${sweep.generated}`);
  const perf = await evaluate('window.__game.perf()');
  console.log(`PERF avg=${perf.avg}ms p95=${perf.p95}ms n=${perf.n} renderMs=${perf.renderMs} drawCalls=${perf.drawCalls} triangles=${perf.triangles}`);
  expect('biaya render game sendiri (renderMs) < 16ms', perf.renderMs < 16, `renderMs=${perf.renderMs}ms`);
  expect('frame time headless (avg) < 200ms', perf.avg < 200, `avg=${perf.avg}ms (present-bound di SwiftShader + CPU berbagi VM; antar-run 60-185ms; renderMs=${perf.renderMs}ms)`);
  await evaluate('window.__game.setMuted(true)');
  expect('mute M bekerja', (await evaluate('window.__game.isMuted()')) === true);
  await evaluate('window.__game.setMuted(false)');
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader',
    `--remote-debugging-port=${PORT}`, '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });
  const chromePid = chrome.pid;
  try {
    // Tunggu DevTools.
    let targets = null;
    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch { /* belum naik */ }
    }
    if (!targets || targets.length === 0) throw new Error('DevTools tidak naik');
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        errors.push(`console.error: ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        errors.push(`exception: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ''}`);
      } else if (msg.method === 'Network.loadingFailed') {
        errors.push(`network failed: ${msg.params.errorText} ${requestUrls[msg.params.requestId] || ''}`);
      } else if (msg.method === 'Network.requestWillBeSent') {
        requestUrls[msg.params.requestId] = msg.params.request.url;
      }
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Log.enable');
    await cdp('Network.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

    if (MODE === 'shots' || MODE === 'all') await runShots();
    if (MODE === 'bot' || MODE === 'all') await runBot();

    console.log(`ERRORS console/page/network: ${errors.length}`);
    for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
    expect('0 console/page/network error', errors.length === 0);
  } finally {
    try { ws?.close(); } catch { /* abaikan */ }
    try { process.kill(chromePid, 'SIGKILL'); } catch { /* abaikan */ }
  }
  console.log(failures === 0 ? 'DRIVER ALL PASS' : `DRIVER FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`DRIVER ERROR: ${err.message}`);
  process.exit(2);
});
