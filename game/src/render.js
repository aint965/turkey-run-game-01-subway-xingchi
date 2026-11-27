// Gambar saja: scene Three.js, kamera chase, juice visual, HUD DOM.
// Juice (squash & stretch, hit-stop, trauma-shake, ghost trail) HANYA visual —
// tidak pernah mengubah simulasi di world.js.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { LANES, ZONES } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const SEG_LEN = 30;
const SEG_COUNT = 4;
const POOL = { fence: 4, hay: 3, oven: 3, knife: 3 };
const CORN_MAX = 48;

function el(id) {
  return document.getElementById(id);
}

export function createRenderer(canvas, templates) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // TONE MAPPING — DIUKUR: ACESFilmic (run 1-2 ronde ini) menaikkan renderMs
  // 15,69 -> 36,47 ms di SwiftShader VM ini (kurva ACES per-fragmen di
  // rasterizer CPU terlalu mahal; di GPU asli biayanya ~0). Ambang driver
  // 16 ms keras, jadi ACES dimatikan (NoToneMapping) — tampilan PBR tetap
  // hidup dari envMap logam + roughness/metalness .glb + sRGB output.
  // Bila suatu hari driver diukur di GPU, ACES bisa dihidupkan lagi.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Resolusi adaptif: di browser otomatis (webdriver/headless, mis. SwiftShader)
  // present canvas 1280x720 per frame menelan ~80 ms di luar render() — turunkan
  // backing store ke 0,5 supaya sim jalan real-time; di desktop GPU tetap 1.
  const headless = navigator.webdriver === true;
  renderer.setPixelRatio(headless ? 0.5 : 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ZONES[0].sky);
  scene.fog = new THREE.Fog(ZONES[0].fog, 55, 110);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xfff2d0, 0x5d8a3a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8b0, 1.75);
  sun.position.set(6, 12, 6);
  scene.add(sun);
  // ENVIRONMENT PBR (tanpa file eksternal): gradien langit game (biru atas,
  // horizon hangat, tanah bawah) + blob matahari, di-PMREM jadi environment
  // map — logam (pisau metallic 1,0, besi oven 0,8) punya sesuatu untuk
  // dipantulkan. Tanpa ini metalness tinggi = hitam (cacat lama bilah pisau).
  // Kanvas kecil (128x64): env hanya butuh arah + warna kasar, bukan detail.
  // TRADE-OFF PERFORMA (diukur driver run 1: scene.environment di SEMUA
  // material menaikkan renderMs 15,69 -> 44,82 ms di SwiftShader VM ini —
  // env sampling per-fragmen di seluruh layar terlalu mahal). Karena itu env
  // TIDAK dipasang sebagai scene.environment; hanya material LOGAM yang
  // diberi envMap langsung (lihat blok "Env HANYA untuk logam" di bawah) —
  // pisau tetap berkilau, renderMs kembali ke ambang.
  const envTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#7fb8d8');
    grad.addColorStop(0.45, '#cfe8f0');
    grad.addColorStop(0.55, '#e8d9a8');
    grad.addColorStop(1, '#5d7a3a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 64);
    const sunBlob = g.createRadialGradient(96, 20, 2, 96, 20, 14);
    sunBlob.addColorStop(0, 'rgba(255,244,200,1)');
    sunBlob.addColorStop(1, 'rgba(255,244,200,0)');
    g.fillStyle = sunBlob;
    g.fillRect(0, 0, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(tex);
    tex.dispose();
    pmrem.dispose();
    return rt.texture;
  })();
  // Bayangan NYATA (satu directional light, resep skill materials-lighting):
  // shadow map 512 mengikuti pemain, bias + normalBias melawan acne.
  // Ini yang paling mengubah kesan "plastik" jadi nyata — kalkun, Bram,
  // pohon, dan rintangan kini melempar bayangan searah matahari.
  // (1024 diukur: renderMs 16,85 ms > ambang 16 ms di SwiftShader VM ini —
  //  512 cukup untuk bayangan lembut low-poly dan jauh lebih murah.)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.5;
  scene.add(sun.target);

  // Kubah langit bergradasi (bukan warna datar): atas lebih dalam, horizon
  // pucat hangat — kedalaman atmosfer. Tekstur digambar ulang per zona.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(160, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  skyDome.renderOrder = -1;
  scene.add(skyDome);
  function paintSky(zone) {
    const top = new THREE.Color(zone.sky).multiplyScalar(0.78);
    const horizon = new THREE.Color(zone.fog).lerp(new THREE.Color(0xffffff), 0.4);
    const g = skyCtx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(0.55, `#${horizon.getHexString()}`);
    g.addColorStop(1, `#${horizon.getHexString()}`);
    skyCtx.fillStyle = g;
    skyCtx.fillRect(0, 0, 4, 256);
    skyTex.needsUpdate = true;
  }

  // ---- trek: segmen tanah yang didaur ulang (bergerak maju, lompat ke belakang)
  // PBR eksplisit: tanah/jalur tanah roughness 1, metallic 0 (bukan Lambert).
  const groundMat = new THREE.MeshStandardMaterial({ color: ZONES[0].ground, roughness: 1, metalness: 0 });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 1, metalness: 0 });
  const wornMat = new THREE.MeshStandardMaterial({ color: 0xa8845a, roughness: 1, metalness: 0 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const segments = [];
  for (let i = 0; i < SEG_COUNT; i += 1) {
    const group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, SEG_LEN), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
    const track = new THREE.Mesh(new THREE.PlaneGeometry(7.6, SEG_LEN), trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.02;
    track.receiveShadow = true;
    group.add(track);
    // Jalur tengah terinjak (lebih terang, tanah terpadatkan) — trek bukan
    // lagi bidang cokelat datar; jejak lari kalkun terbaca.
    const worn = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, SEG_LEN), wornMat);
    worn.position.y = 0.03;
    worn.receiveShadow = true;
    group.add(worn);
    for (const x of [-1.1, 1.1]) {
      for (let d = 0; d < 3; d += 1) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 1.6), dashMat);
        dash.position.set(x, 0.04, -SEG_LEN / 2 + 5 + d * 10);
        group.add(dash);
      }
    }
    group.position.z = -i * SEG_LEN + 12;
    scene.add(group);
    segments.push(group);
  }

  // ---- prop sisi PADAT: cluster merged per segmen x zona (vertex color,
  // 1 draw call per cluster; hanya zona aktif yang terlihat = 4 draw call).
  // Menggantikan sistem lama (1 prop per holder — hamparan kosong di mana-mana).
  // Deterministik per segmen (mulberry32 dari nomor segmen + zona) supaya daur
  // ulang segmen tidak mengacak tata letak.
  const clusterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  // Awan: material BASIC (tanpa cahaya) supaya tidak gelap saat dilihat dari
  // bawah — sisi bawah awan diterangi warna tanah hemisphere (gelap di zona
  // lumbung) bila pakai Standard. Mesh terpisah per segmen, tetap 1 draw call.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function paint(geo, hex) {
    const color = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  function place(geo, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    geo.applyMatrix4(m);
    return geo;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cone = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);
  const cyl = (r, h, s = 10) => new THREE.CylinderGeometry(r, r, h, s);
  const ball = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

  function buildCluster(zoneIndex, segIndex) {
    const rnd = mulberry32(segIndex * 131 + zoneIndex * 17 + 7);
    const parts = [];
    const cloudParts = [];
    const add = (geo, hex, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => {
      parts.push(place(paint(geo, hex), x, y, z, ry, sx, sy, sz));
    };
    const GREENS = [0x2f7a2a, 0x3a8a33, 0x2a6b25, 0x357a2e, 0x2e6b28];
    const tree = (x, z, s) => {
      // Pinus berlapis 2-4 tingkat + batang, lebar/tinggi/warna bervariasi
      // (bukan kerucut seragam); 30% berdaun lebar (tajuk bulat) supaya
      // siluet pepohonan bervariasi.
      add(cyl(0.14 * s, 1.1 * s), 0x6b4a2f, x, 0.55 * s, z);
      if (rnd() < 0.3) {
        const g1 = GREENS[Math.floor(rnd() * GREENS.length)];
        const g2 = GREENS[Math.floor(rnd() * GREENS.length)];
        add(ball(0.85 * s), g1, x, 2.1 * s, z, 0, 1, 0.85, 1);
        add(ball(0.6 * s), g2, x + 0.3 * s, 2.7 * s, z, 0, 1, 0.8, 1);
        add(ball(0.45 * s), g1, x - 0.25 * s, 2.6 * s, z, 0, 1, 0.8, 1);
        return;
      }
      const widths = [0.95, 0.72, 0.52, 0.36];
      const heights = [1.8, 1.4, 1.1, 0.85];
      let y = 1.15;
      const layers = 2 + Math.floor(rnd() * 3); // 2-4 tingkat
      for (let li = 0; li < layers; li += 1) {
        const w = widths[li] * s * (0.9 + rnd() * 0.25);
        const h = heights[li] * s * (0.9 + rnd() * 0.2);
        const g = GREENS[Math.floor(rnd() * GREENS.length)];
        add(cone(w, h), g, x + (rnd() - 0.5) * 0.16 * s, y + h / 2 - 0.15, z);
        y += h * 0.55;
      }
    };
    const bush = (x, z, s) => { add(ball(0.55 * s), 0x3a7a2e, x, 0.35 * s, z, 0, 1, 0.65, 1); };
    const flower = (x, z, hex) => {
      add(cyl(0.03, 0.5), 0x2f7a2a, x, 0.25, z);
      add(ball(0.14), hex, x, 0.55, z);
    };
    const rock = (x, z, s) => { add(ball(0.4 * s), 0x8a8a84, x, 0.12 * s, z, 0, 1, 0.55, 0.8); };
    const grassTuft = (x, z, hex = 0x4a8a35) => { add(cone(0.16, 0.55, 6), hex, x, 0.27, z); };
    // Bercak tanah: gundukan cokelat pipih di tepi trek.
    const dirtPatch = (x, z, s) => { add(ball(0.9 * s), 0x8a6b42, x, 0.02, z, 0, 1, 0.12, 1); };
    const fenceRun = (x, z, ry) => {
      for (const dx of [-1.1, 0, 1.1]) add(box(0.12, 1.0, 0.12), 0x8a6b42, x + dx * Math.cos(ry), 0.5, z - dx * Math.sin(ry));
      add(box(2.4, 0.12, 0.08), 0x7a5c36, x, 0.78, z, ry);
      add(box(2.4, 0.12, 0.08), 0x7a5c36, x, 0.38, z, ry);
    };
    const pumpkin = (x, z, s) => {
      add(ball(0.46 * s), 0xe8862e, x, 0.34 * s, z, 0, 1, 0.82, 1);
      add(cyl(0.05, 0.14), 0x4a7c3f, x, 0.72 * s, z);
    };
    const barrel = (x, z) => {
      add(cyl(0.36, 0.72), 0x8a6b42, x, 0.36, z);
      add(cyl(0.37, 0.05), 0x3a3a40, x, 0.58, z);
    };
    const hayBale = (x, z, s) => {
      add(cyl(0.55 * s, 0.8 * s), 0xd9a441, x, 0.4 * s, z, 0, 1, 1, 1);
      add(cyl(0.56 * s, 0.1 * s), 0xb8862e, x, 0.75 * s, z);
    };
    // Dinding lumbung: papan kayu tinggi di kedua sisi + pintu + jendela
    // hayloft hangat + lentera — zona terbaca sebagai LUMBUNG, bukan gurun.
    // Dinding lumbung LEBIH TERANG + LEBIH LAPANG (dulu ±5,6 m, kayu gelap —
    // koridor terbaca gelap/sempit): dinding digeser ke ±6,4 m, papan kayu
    // lebih cerah, trim lebih hangat.
    const barnWall = (side) => {
      const x = side * 6.4;
      add(box(0.3, 6.0, 30), 0xa8824e, x, 3.0, -9);
      for (let z = -24; z <= 6; z += 3) add(box(0.34, 5.9, 0.18), 0x8a6b42, x, 3.0, z);
      add(box(0.36, 0.3, 30), 0x7a5c36, x, 5.8, -9);
      add(box(0.36, 0.3, 30), 0x7a5c36, x, 0.25, -9);
      // Pintu lumbung (satu per segmen, sisi bergantian) + jendela hangat.
      const doorZ = side < 0 ? -18 : -4;
      add(box(0.4, 3.4, 2.2), 0x7a5c36, x, 1.7, doorZ);
      add(box(0.42, 0.18, 2.4), 0x3a2a18, x, 3.5, doorZ);
      // Jendela hayloft: bingkai kayu + ambang supaya tidak mengambang.
      // wx menonjol sedikit dari permukaan dinding ke arah trek.
      const wx = x - side * 0.18;
      add(box(0.1, 1.0, 1.2), 0xffc861, wx, 4.4, -doorZ);
      add(box(0.12, 0.14, 1.5), 0x5d4028, wx, 5.0, -doorZ);
      add(box(0.12, 0.14, 1.5), 0x5d4028, wx, 3.8, -doorZ);
      add(box(0.12, 1.2, 0.14), 0x5d4028, wx, 4.4, -doorZ - 0.68);
      add(box(0.12, 1.2, 0.14), 0x5d4028, wx, 4.4, -doorZ + 0.68);
      add(box(0.16, 0.1, 1.6), 0x5d4028, wx, 3.68, -doorZ);
      // Lentera di tiang di depan dinding (ikut dinding yang digeser keluar).
      add(cyl(0.06, 1.6), 0x3a2a18, side * 5.7, 0.8, doorZ + 3);
      add(box(0.3, 0.35, 0.3), 0xffc861, side * 5.7, 1.75, doorZ + 3);
    };
    // Dinding dapur ikut digeser keluar (±6,4 m) supaya koridor sama lapangnya.
    const brickWall = (side) => {
      const x = side * 6.4;
      add(box(0.3, 3.2, 30), 0x9a5a44, x, 1.6, -9);
      for (let z = -24; z <= 6; z += 2) add(box(0.32, 0.5, 0.12), 0xb88a6a, x, 2.6, z);
      add(box(0.36, 0.25, 30), 0x7a4a38, x, 3.25, -9);
    };
    const crate = (x, z, s = 1) => {
      add(box(0.7 * s, 0.7 * s, 0.7 * s), 0xa8824e, x, 0.35 * s, z, rnd() * 0.8);
      add(box(0.74 * s, 0.1 * s, 0.74 * s), 0x8a6b42, x, 0.68 * s, z, rnd() * 0.8);
    };
    const clayPot = (x, z) => {
      add(cyl(0.32, 0.55), 0xb5653a, x, 0.28, z);
      add(ball(0.3), 0x3a7a2e, x, 0.62, z, 0, 1, 0.7, 1);
    };
    const cloud = (x, y, z, s) => {
      // Awan tanpa vertex color (material Basic putih) — kumpulkan terpisah.
      const puff = (dx, dy, r) => {
        cloudParts.push(place(ball(r), x + dx, y + dy, z, 0, 1, 0.45, 1));
      };
      puff(0, 0, 1.6 * s);
      puff(1.4 * s, 0.2, 1.1 * s);
      puff(-1.3 * s, 0.1, 1.0 * s);
    };

    for (const side of [-1, 1]) {
      if (zoneIndex === 1) barnWall(side);
      if (zoneIndex === 2) brickWall(side);
      // Deret prop sepanjang segmen (z lokal +8..-26), x 5,6..11,5.
      for (let z = 8; z > -26; z -= 3 + rnd() * 2) {
        const x = side * (5.8 + rnd() * 5.5);
        const r = rnd();
        if (zoneIndex === 0) {
          if (r < 0.22) tree(x, z, 0.8 + rnd() * 0.7);
          else if (r < 0.42) bush(x, z, 0.8 + rnd() * 0.6);
          else if (r < 0.58) flower(x, z, [0xffd23e, 0xff6b81, 0xffffff][Math.floor(rnd() * 3)]);
          else if (r < 0.68) rock(x, z, 0.7 + rnd() * 0.7);
          else if (r < 0.78) pumpkin(x, z, 0.8 + rnd() * 0.5);
          else if (r < 0.88) fenceRun(x, z, (rnd() - 0.5) * 0.4);
          else grassTuft(x, z);
        } else if (zoneIndex === 1) {
          if (r < 0.3) hayBale(x, z, 0.9 + rnd() * 0.5);
          else if (r < 0.55) barrel(x, z);
          else if (r < 0.72) fenceRun(x, z, (rnd() - 0.5) * 0.4);
          else if (r < 0.86) bush(x, z, 0.7 + rnd() * 0.5);
          else crate(x, z, 0.9 + rnd() * 0.4);
        } else {
          if (r < 0.28) crate(x, z, 0.9 + rnd() * 0.5);
          else if (r < 0.52) clayPot(x, z);
          else if (r < 0.7) bush(x, z, 0.7 + rnd() * 0.5);
          else if (r < 0.85) barrel(x, z);
          else hayBale(x, z, 0.8 + rnd() * 0.4);
        }
      }
      // Awan: 1-2 gumpal per sisi per segmen (langit tidak kosong).
      const nCloud = 1 + (rnd() < 0.6 ? 1 : 0);
      for (let ci = 0; ci < nCloud; ci += 1) {
        if (rnd() < 0.85) cloud(side * (6 + rnd() * 14), 14 + rnd() * 9, -8 - rnd() * 14, 1.0 + rnd() * 1.6);
      }
      // Variasi tanah di semua zona: bercak tanah + rumpun rumput.
      const dx = side * (5.8 + rnd() * 5.5);
      const dz = 8 - rnd() * 34;
      if (rnd() < 0.3) dirtPatch(dx, dz, 0.7 + rnd() * 0.9);
      if (rnd() < 0.4) grassTuft(dx + (rnd() - 0.5) * 2, dz + (rnd() - 0.5) * 2, zoneIndex === 1 ? 0xc2a24a : 0x4a8a35);
    }
    const merged = mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(merged, clusterMat);
    mesh.frustumCulled = false;
    mesh.castShadow = true; // pohon/pagar/lumbung melempar bayangan
    mesh.receiveShadow = true;
    const cloudMesh = cloudParts.length > 0
      ? new THREE.Mesh(mergeGeometries(cloudParts, false), cloudMat)
      : null;
    if (cloudMesh) cloudMesh.frustumCulled = false;
    return { mesh, cloudMesh };
  }
  const clusters = []; // [segmen][zona] = { mesh, cloudMesh }
  for (let i = 0; i < SEG_COUNT; i += 1) {
    clusters.push([]);
    for (let z = 0; z < ZONES.length; z += 1) {
      const { mesh, cloudMesh } = buildCluster(z, i);
      segments[i].add(mesh);
      if (cloudMesh) segments[i].add(cloudMesh);
      clusters[i].push({ mesh, cloudMesh });
    }
  }
  function applyClusters(zoneIndex) {
    for (let i = 0; i < SEG_COUNT; i += 1) {
      clusters[i].forEach((c, z) => {
        c.mesh.visible = z === zoneIndex;
        if (c.cloudMesh) c.cloudMesh.visible = z === zoneIndex;
      });
    }
  }
  // Cahaya per zona: lumbung paling terang (dulu koridor gelap) — hemi 1,6
  // + matahari 2,0 mengangkat dinding kayu; halaman 1,25 / dapur 1,35.
  const ZONE_LIGHT = [
    { hemi: 1.25, sun: 1.75 },
    { hemi: 1.6, sun: 2.0 },
    { hemi: 1.35, sun: 1.85 },
  ];
  function applyZone(zoneIndex) {
    const zone = ZONES[zoneIndex];
    groundMat.color.setHex(zone.ground);
    scene.background.setHex(zone.sky);
    scene.fog.color.setHex(zone.fog);
    hemi.groundColor.setHex(zone.side);
    hemi.intensity = ZONE_LIGHT[zoneIndex].hemi;
    sun.intensity = ZONE_LIGHT[zoneIndex].sun;
    paintSky(zone);
    applyClusters(zoneIndex);
  }

  // Matahari hangat: cakram Basic (tanpa fog) yang mengikuti kamera — langit
  // tidak pernah kosong dan cahaya terasa hangat di semua zona.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
  );
  scene.add(sunDisc);
  // Halo matahari: cakram tembus pandang yang lebih besar di belakang
  // matahari — cahaya terasa hangat dan menyebar, bukan titik datar.
  const sunHalo = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.22, fog: false, depthWrite: false }),
  );
  scene.add(sunHalo);
  const haloDir = new THREE.Vector3();

  // ---- blob shadow (murah, tanpa shadow map) — kini hanya penguat kontak
  // (bayangan nyata sudah ada): opasitas diturunkan 0,28 -> 0,18 supaya
  // tidak dobel-gelap.
  const blobGeo = new THREE.CircleGeometry(1, 20);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
  function makeBlob(scale) {
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.scale.setScalar(scale);
    blob.position.y = 0.03;
    scene.add(blob);
    return blob;
  }

  // ---- kalkun pemain + hantu trail (motion-blur equivalent)
  const turkey = templates.turkey.clone();
  turkey.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(turkey);
  const turkeyParts = {
    wingL: turkey.getObjectByName('Turkey_Wing_L'),
    wingR: turkey.getObjectByName('Turkey_Wing_R'),
    legL: turkey.getObjectByName('Turkey_Leg_L'),
    legR: turkey.getObjectByName('Turkey_Leg_R'),
    body: turkey.getObjectByName('Turkey_Body'),
    head: turkey.getObjectByName('Turkey_Head'),
  };
  const turkeyBlob = makeBlob(0.85);
  const ghosts = [];
  // Ghost trail = 3 ellipsoid murah (1 draw call tiap hantu), BUKAN clone kalkun
  // utuh (19 mesh × 3 = 57 draw call — bottleneck terbesar di SwiftShader).
  const ghostGeo = new THREE.SphereGeometry(1, 10, 8);
  const ghostOpacities = [0.13, 0.09, 0.05];
  for (let i = 0; i < 3; i += 1) {
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x8a5a2b, transparent: true, opacity: ghostOpacities[i], depthWrite: false,
    });
    const ghost = new THREE.Mesh(ghostGeo, ghostMat);
    ghost.scale.set(0.42, 0.55, 0.5);
    ghost.visible = false;
    scene.add(ghost);
    ghosts.push(ghost);
  }
  const trail = []; // riwayat posisi (x, y, z) untuk ghost trail

  // ---- petani Bram (mengejar dari belakang, di antara kamera dan kalkun)
  // Skala 1,05 (dulu 1,15): ancaman tetap terbaca, tapi topi jerami tidak
  // lagi mendominasi foreground — kamera juga dimundurkan (lihat bawah).
  const farmer = templates.farmer.clone();
  farmer.scale.setScalar(1.05);
  farmer.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(farmer);
  const farmerParts = {
    armL: farmer.getObjectByName('Farmer_Arm_L'),
    armR: farmer.getObjectByName('Farmer_Arm_R'),
    legL: farmer.getObjectByName('Farmer_Leg_L'),
    legR: farmer.getObjectByName('Farmer_Leg_R'),
    handL: farmer.getObjectByName('Farmer_Hand_L'),
    handR: farmer.getObjectByName('Farmer_Hand_R'),
    // Pivot leher dari GLB remodel (Farmer_HeadPivot): kepala + mata +
    // jenggot + topi satu grup — baru di ronde ini kepala bisa menoleh.
    headPivot: farmer.getObjectByName('Farmer_HeadPivot'),
  };
  const farmerBlob = makeBlob(0.8);
  // Posisi tangan istirahat (lokal grup petani): ujung bawah lengan.
  const HAND_REST = { L: [-0.46, 0.93, -0.06], R: [0.46, 0.93, -0.06] };
  // Tangan terangkat (lengan rotation.x = 1.15): ujung lengan yang terangkat.
  const HAND_UP = { L: [-0.46, 1.07, -0.15], R: [0.46, 1.07, -0.15] };
  function setHands(pose) {
    const map = pose === 'up' ? HAND_UP : HAND_REST;
    if (farmerParts.handL) farmerParts.handL.position.set(...map.L);
    if (farmerParts.handR) farmerParts.handR.position.set(...map.R);
  }

  // Kilau tepi pisau: dua strip putih terang di sepanjang sisi bilah (anak
  // dari template pisau — ikut ter-clone ke pool). Bilah .glb: 0,36 lebar (x),
  // 1,30 tinggi (y), pusat y -1,15 dari pivot. Tanpa ini bilah terbaca
  // seperti pelat abu-abu (cacat audit).
  {
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-0.17, 0.17]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.28, 0.07), edgeMat);
      edge.position.set(sx, -1.15, 0);
      templates.knife.add(edge);
    }
  }
  // Material PBR NYATA kini tinggal di .glb (Blender Principled -> glTF):
  // bilah pisau metallic 1,0 / roughness 0,25, besi oven 0,8 / 0,5, api
  // oven emissive — JANGAN di-override di sini lagi (override lama adalah
  // alasan bilah sempat gelap: metalness tanpa env-map). Yang tersisa di
  // bawah ini hanya geometri (strip kilau tepi pisau), bukan material.
  {
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-0.17, 0.17]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.28, 0.07), edgeMat);
      edge.position.set(sx, -1.15, 0);
      templates.knife.add(edge);
    }
  }
  // Env HANYA untuk logam: bilah + ujung pisau + badan/gagang oven mendapat
  // envMap langsung (material yang sama dipakai semua clone pool). Material
  // organik (metalness 0) tidak butuh env — ini yang menjaga renderMs di
  // bawah ambang setelah scene.environment penuh terbukti terlalu mahal.
  for (const [template, names] of [
    [templates.knife, ['Knife_Blade', 'Knife_Tip']],
    [templates.oven, ['Oven_Body', 'Oven_Handle']],
  ]) {
    for (const name of names) {
      const mesh = template.getObjectByName(name);
      if (mesh && mesh.material) {
        mesh.material.envMap = envTex;
        mesh.material.envMapIntensity = 1.0;
      }
    }
  }

  // ---- pool rintangan (clone template .glb)
  // Nama kind world ('hay') vs nama file aset ('haystack') dipetakan di sini.
  const TEMPLATE_FOR = { fence: 'fence', hay: 'haystack', oven: 'oven', knife: 'knife' };
  const pools = {};
  const poolBlobs = {};
  for (const [kind, count] of Object.entries(POOL)) {
    pools[kind] = [];
    poolBlobs[kind] = [];
    for (let i = 0; i < count; i += 1) {
      const mesh = templates[TEMPLATE_FOR[kind]].clone();
      mesh.visible = false;
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(mesh);
      pools[kind].push(mesh);
      poolBlobs[kind].push(makeBlob(kind === 'oven' ? 1.0 : 0.8));
    }
  }
  // Balok gantungan pisau (satu per pisau) + tiang penyangga di kedua ujung
  // (balok tanpa tiang tampak melayang — cacat audit di shot slide v1).
  // Balok lebih tebal + gelap + penopang diagonal: dari jauh tidak lagi
  // terbaca seperti gawang kecil. PBR: kayu roughness 0,7, metallic 0.
  const knifeBeams = [];
  const knifePosts = [];
  const knifeBraces = [];
  const knifeArcs = [];
  for (let i = 0; i < POOL.knife; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.32, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.7, metalness: 0 }),
    );
    beam.position.y = 3.05;
    beam.visible = false;
    beam.castShadow = true;
    scene.add(beam);
    knifeBeams.push(beam);
    const posts = [];
    for (const side of [-1.2, 1.2]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 3.05, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x5d4028, roughness: 0.7, metalness: 0 }),
      );
      post.position.y = 1.52;
      post.visible = false;
      post.castShadow = true;
      scene.add(post);
      posts.push(post);
    }
    knifePosts.push(posts);
    // Penopang diagonal balok->tiang (memecah siluet gawang).
    const braces = [];
    for (const s of [-1, 1]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.85, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x5d4028, roughness: 0.7, metalness: 0 }),
      );
      brace.rotation.z = -s * 0.6;
      brace.visible = false;
      brace.castShadow = true;
      scene.add(brace);
      braces.push(brace);
    }
    knifeBraces.push(braces);
    // Busur ayun (motion-blur): sektor tembus pandang yang disapu bilah
    // (bilah menggantung ke -Y, mengayun +-0,55 rad -> sektor 238,5-301,5°).
    // Busur ayun LEBIH TERLIHAT dari jauh (dulu opacity 0,16, nyaris hilang):
    // cincin lebih lebar + lebih pekat supaya pisau terbaca dari kejauhan.
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 2.05, 24, 1, Math.PI * 1.325, Math.PI * 0.35),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    arc.visible = false;
    scene.add(arc);
    knifeArcs.push(arc);
  }

  // ---- jagung: SATU InstancedMesh (1 draw call untuk semua jagung)
  // Warna per-instance: jagung biasa kuning, jagung EMAS langka lebih besar
  // + emas terang (material putih supaya setColorAt tampil murni).
  const CORN_COLOR = new THREE.Color(0xe8a81a);
  const GOLD_COLOR = new THREE.Color(0xffd700);
  const cornGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.1, 0.55, 10).translate(0, 0, 0),
    new THREE.ConeGeometry(0.08, 0.16, 10).translate(0, 0.35, 0),
  ]);
  const cornMesh = new THREE.InstancedMesh(
    cornGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 }),
    CORN_MAX,
  );
  cornMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cornMesh.count = 0;
  cornMesh.frustumCulled = false;
  cornMesh.castShadow = true;
  scene.add(cornMesh);

  // ---- HUD (DOM, update hanya saat nilai berubah)
  // Bar menu kayu-peternakan: skor + kecepatan (kiri), jarak (tengah),
  // jagung/kombo + nyawa (kanan); zona kiri-bawah, meter kejar Bram kanan-bawah.
  const hud = {
    scoreVal: el('hud-score-val'), distVal: el('hud-dist-val'), coinsVal: el('hud-coins-val'),
    combo: el('hud-combo'), hearts: el('hud-hearts'), speed: el('hud-speed'), zone: el('hud-zone'),
    farmer: el('farmer-fill'), marker: el('farmer-marker'), warn: el('farmer-warn'),
  };
  const ZONE_LABEL = ['🌾 HALAMAN PETERNAKAN', '🏠 LUMBUNG', '🍳 DAPUR'];
  // Format Indonesia: 112916 -> "112.916" (angka besar terbaca masuk akal).
  function fmt(n) { return Math.floor(n).toLocaleString('id-ID'); }
  let prevCombo = 1;
  let prevLives = 3;
  const cache = {};
  function setText(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }

  const camPos = new THREE.Vector3(0, 5.3, 10.35);
  const camTarget = new THREE.Vector3(0, 5.3, 10.35);
  const lookAt = new THREE.Vector3(0, 1.0, -10);
  const dummy = new THREE.Object3D();
  let lastZone = -1;
  let trauma = 0;
  // Sudut menoleh kepala Bram (radian) — di-ease tiap frame menuju target.
  let headYaw = 0;
  let renderMsTotal = 0;
  let renderMsCount = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function showScreen(screen) {
    for (const [id, name] of [['screen-title', SCREEN_TITLE], ['screen-pause', SCREEN_PAUSED], ['screen-over', SCREEN_OVER]]) {
      el(id).style.display = screen === name ? 'flex' : 'none';
    }
    el('hud').style.display = screen === SCREEN_PLAY || screen === SCREEN_PAUSED ? 'block' : 'none';
  }

  /**
   * Gambar satu frame. `dt` detik real; kamera di-update SETELAH kalkun bergerak
   * (late update), follow eksponensial 1-exp(-rate*dt), rate ~7.
   */
  function draw(state, screen, best, dt, events) {
    const p = state.player;
    const speed = state.speed;

    // Trauma shake: trauma^2, decay real-time.
    if (events && events.hit) trauma = Math.min(1, trauma + 0.55);
    if (state.caught) trauma = 1;
    trauma = Math.max(0, trauma - dt * 1.6);
    const shake = trauma * trauma;

    // Segmen tanah: geser mengikuti jarak, daur ulang ke belakang.
    const offset = (state.distance % SEG_LEN);
    for (let i = 0; i < SEG_COUNT; i += 1) {
      let z = 12 - i * SEG_LEN + offset;
      if (z > 12 + SEG_LEN) z -= SEG_COUNT * SEG_LEN;
      segments[i].position.z = z;
    }

    // Zona.
    if (state.zoneIndex !== lastZone) {
      lastZone = state.zoneIndex;
      applyZone(state.zoneIndex);
    }

    // Kalkun: posisi + squash & stretch + lari + slide. Skala dasar 1,6x
    // (render saja, fisika sim tetap) supaya kalkun >=25% tinggi frame.
    const squash = p.squash;
    turkey.position.set(p.x, p.y, 0);
    turkey.scale.set(1.6 * (1 - squash * 0.06), 1.6 * (1 + squash * 0.14), 1.6 * (1 - squash * 0.05));
    // Set SEMUA komponen rotasi tiap frame: clone() GLB mengurai quaternion
    // Y-180 menjadi Euler (pi,0,pi); mengubah .x saja membalik kalkun
    // (bug audit: kalkun terbalik di bawah tanah, hanya kaki + bayangan terlihat).
    const tilt = p.sliding ? 0.3 : (p.grounded ? 0 : -0.12);
    turkey.rotation.set(tilt, Math.PI, 0);
    if (p.sliding) {
      turkey.scale.y = 1.6 * 0.55;
    }
    // Kedip saat invulnerable.
    turkey.visible = !(p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0);
    const phase = p.runPhase;
    const flap = p.grounded && !p.sliding ? Math.sin(phase * 2.2) : 0;
    if (turkeyParts.wingL) turkeyParts.wingL.rotation.z = 0.2 + flap * 0.5;
    if (turkeyParts.wingR) turkeyParts.wingR.rotation.z = -0.2 - flap * 0.5;
    if (turkeyParts.legL) turkeyParts.legL.rotation.x = p.grounded ? Math.sin(phase * 2.2) * 0.6 : 0.4;
    if (turkeyParts.legR) turkeyParts.legR.rotation.x = p.grounded ? -Math.sin(phase * 2.2) * 0.6 : -0.3;
    // Kepala mengangguk pelan mengikuti langkah (hidup, bukan boneka kaku).
    if (turkeyParts.head) turkeyParts.head.rotation.x = p.grounded && !p.sliding ? Math.sin(phase * 2.2) * 0.07 : 0;
    // Saat slide, angkat sedikit (+0,1) supaya kaki tidak bertumpuk dengan
    // topi Bram di belakang (nit audit) — bayangan blob tetap di tanah.
    turkey.position.y = p.y + (p.sliding ? 0.1 : 0) + (p.grounded && !p.sliding ? Math.abs(Math.sin(phase * 2.2)) * 0.05 : 0);
    turkeyBlob.position.set(p.x, 0.03, 0);
    turkeyBlob.material.opacity = p.y > 0.1 ? Math.max(0.05, 0.28 - p.y * 0.1) : 0.28;

    // Ghost trail: jejak posisi 0.12 dtk ke belakang, hanya saat cepat / slide.
    trail.unshift({ x: p.x, y: turkey.position.y, z: 0 });
    if (trail.length > 12) trail.pop();
    const showGhosts = speed > 19 || p.sliding || !p.grounded;
    ghosts.forEach((ghost, i) => {
      const past = trail[Math.min(trail.length - 1, (i + 1) * 4)];
      ghost.visible = showGhosts && !!past;
      if (past) {
        ghost.position.set(past.x, past.y + 0.6, past.z + 0.3 + i * 0.35);
        ghost.scale.set(0.42 * turkey.scale.x, 0.55 * turkey.scale.y, 0.5 * turkey.scale.z);
      }
    });

    // Petani: JARAK VISUAL = 0,55 x gap sim (render saja — gap sim, HUD, dan
    // skor tidak berubah). Gap sim 9 m menaruh Bram DI BELAKANG kamera
    // (kamera z 7) sehingga ia tak pernah terlihat — cacat terbesar v1.
    // Dengan faktor 0,55 Bram selalu ~5 m di depan kamera: kepala sampai
    // lutut masuk frame bawah, kalkun tetap terlihat di atas bahunya. Saat
    // tertangkap ia bergegas mendekat (visualGap -> 1,0).
    const rawGap = state.caught ? Math.max(1.2, state.farmerGap - state.caughtT * 6) : state.farmerGap;
    const visualGap = Math.max(1.0, rawGap * 0.55);
    farmer.position.set(p.x * 0.85, 0, visualGap);
    farmer.visible = true;
    // WAJAH BRAM: kamera selalu di belakangnya sehingga wajah tak pernah
    // terlihat (cacat terbesar, penahan nilai). Saat tertangkap ia BERBALIK
    // menghadap kamera, lengan terangkat meraih kalkun; saat taunt di title
    // ia menghadap kamera dan melambai sambil lari di tempat. Lean-back
    // -0,12 mengangkat wajah melewati tepi topi jerami dari kamera tinggi.
    const facingCam = state.caught || state.farmerTaunt;
    // Condong ke depan saat berlari (postur mengejar yang nyata); saat
    // menghadap kamera ia menegak + lean-back -0,12 seperti sebelumnya.
    farmer.rotation.set(facingCam ? -0.12 : 0.06, facingCam ? 0 : Math.PI, 0);
    // Bram MELIRIK ke belakang saat bahaya tinggi (gap < 6 m): kepala
    // menoleh ±46° perlahan (sinus 0,9 rad/dtk, di-ease rate 3/dtk) + miring
    // sedikit mengikuti arah tolehan (0,25×) — "dia mengawasimu". Badan tetap
    // lari. Saat tertangkap/taunt target 0 (badan sudah menghadap kamera).
    // REVISI probe: ±31° TANPA miring tidak terbaca dari kamera chase —
    // belakang kepala + topi terlalu simetris. ±46° + miring baru membuat
    // profil wajah (hidung/jenggot) mengintip dari sisi kepala.
    // Aman: murni visual, sim tidak berubah.
    const glanceTarget = (state.farmerGap < 6.0 && !state.caught && !state.farmerTaunt)
      ? Math.sin(state.time * 0.9) * 0.8 : 0;
    headYaw += (glanceTarget - headYaw) * (1 - Math.exp(-3 * dt));
    if (farmerParts.headPivot) {
      farmerParts.headPivot.rotation.y = headYaw;
      farmerParts.headPivot.rotation.z = headYaw * 0.25;
    }
    const fPhase = phase * 1.15;
    if (state.caught) {
      // Pose menang: diam, kedua lengan terangkat meraih kalkun.
      if (farmerParts.armL) farmerParts.armL.rotation.x = 1.15;
      if (farmerParts.armR) farmerParts.armR.rotation.x = 1.15;
      if (farmerParts.legL) farmerParts.legL.rotation.x = 0;
      if (farmerParts.legR) farmerParts.legR.rotation.x = 0;
      setHands('up');
    } else if (state.farmerTaunt) {
      // Melambai ke kamera sambil lari di tempat (kaki tetap mengayun).
      if (farmerParts.armL) farmerParts.armL.rotation.x = 0.61 + Math.sin(fPhase * 2.2) * 0.5;
      if (farmerParts.armR) farmerParts.armR.rotation.x = 1.35 + Math.sin(state.time * 6) * 0.25;
      if (farmerParts.legL) farmerParts.legL.rotation.x = Math.sin(fPhase * 2.2) * 0.55;
      if (farmerParts.legR) farmerParts.legR.rotation.x = -Math.sin(fPhase * 2.2) * 0.55;
      setHands('rest');
      if (farmerParts.handR) farmerParts.handR.position.set(...HAND_UP.R);
    } else {
      if (farmerParts.armL) farmerParts.armL.rotation.x = 0.61 + Math.sin(fPhase * 2.2) * 0.5;
      if (farmerParts.armR) farmerParts.armR.rotation.x = 0.61 - Math.sin(fPhase * 2.2) * 0.5;
      if (farmerParts.legL) farmerParts.legL.rotation.x = Math.sin(fPhase * 2.2) * 0.55;
      if (farmerParts.legR) farmerParts.legR.rotation.x = -Math.sin(fPhase * 2.2) * 0.55;
      setHands('rest');
    }
    farmerBlob.position.set(farmer.position.x, 0.03, visualGap);
    farmerBlob.visible = farmer.visible;

    // Rintangan dari pool (cocokkan dengan state; slot kosong disembunyikan).
    const used = { fence: 0, hay: 0, oven: 0, knife: 0 };
    for (const ob of state.obstacles) {
      if (!ob.active) continue;
      const kind = ob.kind;
      const slot = used[kind];
      used[kind] += 1;
      if (slot >= POOL[kind]) continue;
      const mesh = pools[kind][slot];
      const blob = poolBlobs[kind][slot];
      mesh.visible = true;
      blob.visible = true;
      if (kind === 'knife') {
        mesh.position.set(ob.x, 3.0, ob.z);
        mesh.rotation.z = Math.sin(state.time * 2.4 + ob.phase) * 0.55;
        knifeBeams[slot].visible = true;
        knifeBeams[slot].position.set(ob.x, 3.05, ob.z);
        for (let pi = 0; pi < 2; pi += 1) {
          const post = knifePosts[slot][pi];
          post.visible = true;
          post.position.set(ob.x + (pi === 0 ? -1.2 : 1.2), 1.52, ob.z);
        }
        for (let bi = 0; bi < 2; bi += 1) {
          const brace = knifeBraces[slot][bi];
          brace.visible = true;
          brace.position.set(ob.x + (bi === 0 ? -0.98 : 0.98), 2.62, ob.z);
        }
        knifeArcs[slot].visible = true;
        knifeArcs[slot].position.set(ob.x, 3.0, ob.z + 0.08);
        blob.visible = false;
      } else {
        mesh.position.set(ob.x, 0, ob.z);
        mesh.rotation.z = 0;
        blob.position.set(ob.x, 0.03, ob.z);
      }
    }
    for (const [kind, count] of Object.entries(POOL)) {
      for (let i = used[kind]; i < count; i += 1) {
        pools[kind][i].visible = false;
        poolBlobs[kind][i].visible = false;
        if (kind === 'knife') {
          knifeBeams[i].visible = false;
          knifePosts[i].forEach((post) => { post.visible = false; });
          knifeBraces[i].forEach((brace) => { brace.visible = false; });
          knifeArcs[i].visible = false;
        }
      }
    }

    // Jagung (InstancedMesh). Emas: lebih besar + warna emas terang.
    let cornCount = 0;
    for (const corn of state.corns) {
      if (!corn.active || cornCount >= CORN_MAX) continue;
      dummy.position.set(corn.x, corn.y, corn.z);
      dummy.rotation.set(0, state.time * 1.5, 0);
      dummy.scale.setScalar(corn.golden ? 1.35 : 1);
      dummy.updateMatrix();
      cornMesh.setMatrixAt(cornCount, dummy.matrix);
      cornMesh.setColorAt(cornCount, corn.golden ? GOLD_COLOR : CORN_COLOR);
      cornCount += 1;
    }
    cornMesh.count = cornCount;
    cornMesh.instanceMatrix.needsUpdate = true;
    if (cornMesh.instanceColor) cornMesh.instanceColor.needsUpdate = true;

    // Kamera: follow eksponensial + deadzone + look-ahead, LATE update.
    // Chase-cam TINGGI (y 5,3) dan MENGEKOR Bram: kamera 5,7 m di belakang
    // Bram (z = visualGap + 5,7; dulu 5,4). Mundur lagi: topi Bram mengecil
    // (dominasi topi = cacat fix round) sementara kalkun diperbesar lewat
    // skala 1,6x + FOV 46 — kalkun >=25% tinggi frame, kaki kalkun bersih
    // dari topi Bram (garis pandang kaki melewati topi dengan jarak aman).
    // Saat bahaya naik kamera mendekat + menunduk: semua membesar.
    const danger = Math.max(0, Math.min(1, (6 - state.farmerGap) / (6 - 4.2)));
    camTarget.set(p.x * 0.55, 5.3 - danger * 0.3, visualGap + 5.7);
    const rate = 7;
    const k = 1 - Math.exp(-rate * dt);
    camPos.lerp(camTarget, k);
    lookAt.set(p.x * 0.8, 1.0 - danger * 0.2, -10);
    camera.position.copy(camPos);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.9;
      camera.position.y += (Math.random() - 0.5) * shake * 0.7;
    }
    camera.lookAt(lookAt);
    // Matahari mengikuti kamera (langit tidak pernah kosong). Posisi dihitung
    // supaya cakram masuk frame: kamera menunduk ~12 derajat, jadi matahari
    // di y 12 (bukan 27 — itu di atas tepi frame) dan 65 m di depan, 16 m
    // ke kanan. Di atas atap lumbung (6 m) dari garis pandang kamera.
    sunDisc.position.set(camPos.x + 16, 12, camPos.z - 65);
    sunDisc.lookAt(camera.position);
    // Halo mengikuti matahari, 0,5 m lebih jauh dari kamera (tanpa z-fight).
    haloDir.copy(sunDisc.position).sub(camera.position).normalize();
    sunHalo.position.copy(sunDisc.position).addScaledVector(haloDir, 0.5);
    sunHalo.lookAt(camera.position);
    // Matahari bayangan mengikuti kamera (arah cahaya konsisten dengan
    // cakram matahari di langit: dari kanan-depan-atas, bayangan jatuh
    // ke kiri-belakang): posisi + target dihitung dari kamera tiap frame.
    sun.position.set(camPos.x + 16, 26, camPos.z - 40);
    sun.target.position.set(camPos.x, 0, camPos.z - 10);
    sun.target.updateMatrixWorld();
    // Kubah langit mengikuti kamera (tidak pernah sampai ke tepinya).
    skyDome.position.set(camera.position.x, 0, camera.position.z - 20);

    // HUD (bar menu): angka diformat Indonesia; badge kombo berdenyut tiap
    // kali pengali NAIK; hati bergoyang saat nyawa berkurang; marker Bram
    // di lintasan kejar bergerak mengikuti bahaya (animasi CSS, bukan sim).
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      setText(hud.scoreVal, 'score', fmt(state.score));
      setText(hud.distVal, 'dist', `${fmt(state.distance)} m`);
      setText(hud.coinsVal, 'coins', String(state.coins));
      const mult = state.comboMult;
      hud.combo.classList.toggle('hot', mult > 1);
      if (mult !== prevCombo) {
        setText(hud.combo, 'combo', `×${mult}`);
        if (mult > prevCombo) {
          hud.combo.classList.remove('pop');
          void hud.combo.offsetWidth;
          hud.combo.classList.add('pop');
        }
      }
      prevCombo = mult;
      if (state.lives < prevLives) {
        hud.hearts.classList.remove('hurt');
        void hud.hearts.offsetWidth;
        hud.hearts.classList.add('hurt');
      }
      prevLives = state.lives;
      setText(hud.hearts, 'hearts', '♥'.repeat(Math.max(0, state.lives)) + '♡'.repeat(Math.max(0, 3 - state.lives)));
      setText(hud.speed, 'speed', `${speed.toFixed(1).replace('.', ',')} m/dtk`);
      setText(hud.zone, 'zone', ZONE_LABEL[state.zoneIndex]);
      const barDanger = Math.max(0, Math.min(1, (FARMER_GAP_MAX - state.farmerGap) / (FARMER_GAP_MAX - 4.2)));
      hud.farmer.style.width = `${Math.round(barDanger * 100)}%`;
      // Marker Bram mulai di ujung KANAN (jauh dari kalkun) dan mendekat ke
      // kiri menuju kalkun saat bahaya naik — dulu mulai di 8% (menumpuk
      // dengan kalkun di ujung kiri saat bahaya 0, jadi blob).
      hud.marker.style.left = `${88 - barDanger * 80}%`;
      hud.warn.classList.toggle('show', state.farmerGap < 6);
    }
    if (screen === SCREEN_OVER) {
      // Skor besar dijelaskan: jarak + bonus jagung (bukan angka inflated).
      setText(el('over-score'), 'oscore', `Skor: ${fmt(state.score)}`);
      setText(el('over-best'), 'obest', `Terbaik: ${fmt(best)}`);
      setText(el('over-stats'), 'ostats', `${fmt(state.distance)} m  •  🌽 ${state.coins} jagung  •  bonus ${fmt(state.bonus)}`);
    }
    if (screen === SCREEN_TITLE) {
      setText(el('title-best'), 'tbest', best > 0 ? `Skor terbaik: ${fmt(best)}` : '');
    }

    showScreen(screen);
    const renderStart = performance.now();
    renderer.render(scene, camera);
    renderMsTotal += performance.now() - renderStart;
    renderMsCount += 1;
  }

  const FARMER_GAP_MAX = 9.0;

  return {
    draw,
    setPixelRatio(r) { renderer.setPixelRatio(r); resize(); },
    addTrauma(amount) { trauma = Math.min(1, trauma + amount); },
    get drawCalls() { return renderer.info.render.calls; },
    get triangles() { return renderer.info.render.triangles; },
    get renderMs() { return renderMsCount === 0 ? 0 : +(renderMsTotal / renderMsCount).toFixed(2); },
  };
}
