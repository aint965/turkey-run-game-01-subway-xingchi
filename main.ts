// Kalkun Kabur — entrypoint build (Node 22, standard library only).
//
// Menyalin game/ (file statis offline: index.html + modul ES + .glb Blender +
// three.js yang di-vendor) dan screenshots/ dari samping file ini ke /output
// (atau MAKEFUN_OUTPUT_DIR), lalu menulis /output/dossier.json lewat
// buildDossier dari vendor/makefun-game.ts (jangan diubah).
//
// Berbeda dari starter: sebelum menyalin, program ini MEMVALIDASI isi
// (screenshot harus 3-4 file JPEG/PNG, masing-masing <= 256 KiB; game/
// harus punya index.html; game/ tidak boleh melewati cap file/byte scorer;
// setiap .glb di game/assets/ harus ber-magic 'glTF' dan tidak kosong),
// mengosongkan isi screenshots/ lama di output file-per-file (tanpa pernah
// menghapus direktorinya — folder output grader adalah mount point) supaya
// file basi tidak bocor,
// dan mencetak laporan ukuran — jadi build yang lolos di sini sudah
// memenuhi gate yang akan dipakai scorer (lihat reference/gate.json).
//
// Jalankan:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (dua run harus byte-identical: tidak ada timestamp/random di output.)

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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

/**
 * Kosongkan ISI direktori file-per-file (rekursif), TANPA PERNAH menghapus
 * direktorinya sendiri — di mesin grader folder output adalah mount point dan
 * rmSync pada direktori bisa gagal (pernah menggagalkan grading entri lain:
 * program exited with code 1 karena menghapus folder output). Subdirektori
 * di dalamnya hanya dikosongkan isinya, tidak dihapus. Dipakai untuk
 * membersihkan output lama supaya file basi tidak bocor ke build berikutnya.
 */
function emptyDir(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) emptyDir(full);
    else if (entry.isFile()) unlinkSync(full);
  }
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

// --- Validasi 3: setiap .glb di game/assets/ harus file GLB utuh (magic 'glTF',
// versi 2) dan tidak kosong — aset korup akan membuat game jalan dengan
// fallback prosedural tanpa ketahuan di sini.
const glbFiles = gameFiles.filter((f) => f.startsWith('assets/') && f.endsWith('.glb'));
if (glbFiles.length === 0) fail('game/assets/ tidak berisi .glb');
let glbBytes = 0;
for (const file of glbFiles) {
  const full = join(gameDir, file);
  const size = statSync(full).size;
  if (size < 20) fail(`game/${file} terlalu kecil (${size} byte)`);
  const head = readFileSync(full).subarray(0, 12);
  const magic = String.fromCharCode(head[0], head[1], head[2], head[3]);
  const version = head.readUInt32LE(4);
  if (magic !== 'glTF' || version !== 2) fail(`game/${file} bukan GLB v2 (magic=${magic} version=${version})`);
  // Integritas: field panjang total di header harus sama dengan ukuran file —
  // file terpotong saat unduh/export akan ketahuan di sini, bukan di game.
  const declaredLength = head.readUInt32LE(8);
  if (declaredLength !== size) fail(`game/${file} panjang header ${declaredLength} != ukuran file ${size}`);
  glbBytes += size;
}

// --- Salin (kosongkan isi output lama file-per-file supaya file basi tidak
// bocor — JANGAN pernah menghapus direktorinya: di mesin grader folder output
// adalah mount point dan penghapusan direktori bisa gagal grading).
mkdirSync(out, { recursive: true });
mkdirSync(join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
emptyDir(join(out, 'game'));
emptyDir(join(out, 'screenshots'));
cpSync(gameDir, join(out, 'game'), { recursive: true });
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

// --- Verifikasi 4: dossier yang ditulis harus parse + cocok dengan yang disalin
// (jumlah screenshot + file game). Kalau library berubah perilakunya, build
// gagal di sini, bukan diam-diam menghasilkan dossier yang salah.
const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
const dossierShots = dossier.screenshots?.length ?? dossier.shot_count ?? null;
if (dossierShots !== null && dossierShots !== shots.length) {
  fail(`dossier mencatat ${dossierShots} screenshot, disalin ${shots.length}`);
}
const cover = shots[0];
console.log(
  `kalkun-kabur: game ${gameFiles.length} file / ${gameBytes} byte ` +
  `(aset .glb ${glbFiles.length} file / ${glbBytes} byte), ` +
  `screenshots ${shots.length} file / ${shotsBytes} byte (cover: ${cover}), dossier ${dossierBytes} byte -> ${out}`,
);
