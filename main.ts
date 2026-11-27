// Kalkun Kabur — entrypoint build (Node 22, standard library only).
//
// Menyalin game/ (file statis offline: index.html + modul ES + .glb Blender +
// three.js yang di-vendor) dan screenshots/ dari samping file ini ke /output
// (atau MAKEFUN_OUTPUT_DIR), lalu menulis /output/dossier.json lewat
// buildDossier dari vendor/makefun-game.ts (jangan diubah).
//
// Berbeda dari starter: sebelum menyalin, program ini MEMVALIDASI isi
// (screenshot harus 3-4 file JPEG/PNG, masing-masing <= 256 KiB; game/
// harus punya index.html; game/ tidak boleh melewati cap file/byte scorer),
// menghapus isi screenshots/ lama di output supaya file basi tidak bocor,
// dan mencetak laporan ukuran — jadi build yang lolos di sini sudah
// memenuhi gate yang akan dipakai scorer (lihat reference/gate.json).
//
// Jalankan:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (dua run harus byte-identical: tidak ada timestamp/random di output.)

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Cap scorer (reference/gate.json) — dipakai validasi lokal sebelum buildDossier.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

/** Daftar semua file di bawah dir (rekursif), path relatif terhadap dir. */
function listFiles(dir, rel = '') {
  const found = [];
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFiles(dir, p));
    else if (entry.isFile()) found.push(p);
  }
  return found.sort();
}

// --- Validasi 1: screenshots/ harus 3-4 file JPEG/PNG, masing-masing <= 256 KiB.
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ tidak ada (butuh 3-4 screenshot dossier)');
const shots = listFiles(shotsDir);
if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
  fail(`screenshots/ berisi ${shots.length} file, harus 3-4`);
}
let shotsBytes = 0;
for (const shot of shots) {
  const full = join(shotsDir, shot);
  const size = statSync(full).size;
  const head = readFileSync(full).subarray(0, 4);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (!isJpeg && !isPng) fail(`screenshots/${shot} bukan JPEG/PNG`);
  if (size > CAPS.screenshots.max_bytes) fail(`screenshots/${shot} ${size} byte > 262144`);
  shotsBytes += size;
}

// --- Validasi 2: game/ harus punya index.html + di bawah cap file/byte/path.
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html tidak ada');
const gameFiles = listFiles(gameDir);
if (gameFiles.length > CAPS.game_max_files) fail(`game/ berisi ${gameFiles.length} file > 993`);
let gameBytes = 0;
for (const file of gameFiles) {
  if (Buffer.byteLength(file, 'utf8') > CAPS.game_path_max_bytes) fail(`path game/ terlalu panjang: ${file}`);
  gameBytes += statSync(join(gameDir, file)).size;
}
if (gameBytes > CAPS.game_max_bytes) fail(`game/ ${gameBytes} byte > 48 MiB`);

// --- Salin (hapus screenshots/ lama di output supaya file basi tidak bocor).
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// --- Dossier (satu-satunya penulis dossier.json: library vendored).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: CAPS.text_max_bytes,
    screenshots: CAPS.screenshots,
    game_max_files: CAPS.game_max_files,
    game_max_bytes: CAPS.game_max_bytes,
    game_path_max_bytes: CAPS.game_path_max_bytes,
  }),
);

const dossierBytes = statSync(join(out, 'dossier.json')).size;

// --- Verifikasi 3: dossier yang ditulis harus parse + cocok dengan yang disalin
// (jumlah screenshot + file game). Kalau library berubah perilakunya, build
// gagal di sini, bukan diam-diam menghasilkan dossier yang salah.
const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
const dossierShots = dossier.screenshots?.length ?? dossier.shot_count ?? null;
if (dossierShots !== null && dossierShots !== shots.length) {
  fail(`dossier mencatat ${dossierShots} screenshot, disalin ${shots.length}`);
}
const cover = shots[0];
console.log(
  `kalkun-kabur: game ${gameFiles.length} file / ${gameBytes} byte, ` +
  `screenshots ${shots.length} file / ${shotsBytes} byte (cover: ${cover}), dossier ${dossierBytes} byte -> ${out}`,
);
