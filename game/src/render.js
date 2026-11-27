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
  // Resolusi adaptif: di browser otomatis (webdriver/headless, mis. SwiftShader)
  // present canvas 1280x720 per frame menelan ~80 ms di luar render() — turunkan
  // backing store ke 0,5 supaya sim jalan real-time; di desktop GPU tetap 1.
  const headless = navigator.webdriver === true;
  renderer.setPixelRatio(headless ? 0.5 : 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ZONES[0].sky);
  scene.fog = new THREE.Fog(ZONES[0].fog, 55, 110);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xfff2d0, 0x5d8a3a, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8b0, 1.6);
  sun.position.set(6, 12, 6);
  scene.add(sun);

  // ---- trek: segmen tanah yang didaur ulang (bergerak maju, lompat ke belakang)
  const groundMat = new THREE.MeshStandardMaterial({ color: ZONES[0].ground, roughness: 1 });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 1 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const segments = [];
  for (let i = 0; i < SEG_COUNT; i += 1) {
    const group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, SEG_LEN), groundMat);
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
    const track = new THREE.Mesh(new THREE.PlaneGeometry(7.6, SEG_LEN), trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.02;
    group.add(track);
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
  const clusterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
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
    const tree = (x, z, s) => {
      add(cyl(0.14 * s, 1.1 * s), 0x6b4a2f, x, 0.55 * s, z);
      add(cone(0.85 * s, 1.7 * s), 0x2f7a2a, x, 1.8 * s, z);
      add(cone(0.6 * s, 1.3 * s), 0x3a8a33, x, 2.7 * s, z);
      add(cone(0.38 * s, 0.9 * s), 0x2a6b25, x, 3.4 * s, z);
    };
    const bush = (x, z, s) => { add(ball(0.55 * s), 0x3a7a2e, x, 0.35 * s, z, 0, 1, 0.65, 1); };
    const flower = (x, z, hex) => {
      add(cyl(0.03, 0.5), 0x2f7a2a, x, 0.25, z);
      add(ball(0.14), hex, x, 0.55, z);
    };
    const rock = (x, z, s) => { add(ball(0.4 * s), 0x8a8a84, x, 0.12 * s, z, 0, 1, 0.55, 0.8); };
    const grassTuft = (x, z) => { add(cone(0.16, 0.55, 6), 0x4a8a35, x, 0.27, z); };
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
    const barnWall = (side) => {
      const x = side * 5.6;
      add(box(0.3, 6.0, 30), 0x8a6b42, x, 3.0, -9);
      for (let z = -24; z <= 6; z += 3) add(box(0.34, 5.9, 0.18), 0x6b4a2f, x, 3.0, z);
      add(box(0.36, 0.3, 30), 0x5d4028, x, 5.8, -9);
      add(box(0.36, 0.3, 30), 0x5d4028, x, 0.25, -9);
      // Pintu lumbung (satu per segmen, sisi bergantian) + jendela hangat.
      const doorZ = side < 0 ? -18 : -4;
      add(box(0.4, 3.4, 2.2), 0x5d4028, x, 1.7, doorZ);
      add(box(0.42, 0.18, 2.4), 0x3a2a18, x, 3.5, doorZ);
      add(box(0.42, 1.0, 1.2), 0xffc861, x, 4.4, -doorZ);
      // Lentera di tiang di depan dinding.
      add(cyl(0.06, 1.6), 0x3a2a18, side * 4.9, 0.8, doorZ + 3);
      add(box(0.3, 0.35, 0.3), 0xffc861, side * 4.9, 1.75, doorZ + 3);
    };
    const brickWall = (side) => {
      const x = side * 5.6;
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
      if (rnd() < 0.8) cloud(side * (6 + rnd() * 14), 15 + rnd() * 7, -8 - rnd() * 14, 1.2 + rnd() * 1.2);
    }
    const merged = mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(merged, clusterMat);
    mesh.frustumCulled = false;
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
  function applyZone(zoneIndex) {
    const zone = ZONES[zoneIndex];
    groundMat.color.setHex(zone.ground);
    scene.background.setHex(zone.sky);
    scene.fog.color.setHex(zone.fog);
    hemi.groundColor.setHex(zone.side);
    applyClusters(zoneIndex);
  }

  // ---- blob shadow (murah, tanpa shadow map)
  const blobGeo = new THREE.CircleGeometry(1, 20);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
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
  scene.add(turkey);
  const turkeyParts = {
    wingL: turkey.getObjectByName('Turkey_Wing_L'),
    wingR: turkey.getObjectByName('Turkey_Wing_R'),
    legL: turkey.getObjectByName('Turkey_Leg_L'),
    legR: turkey.getObjectByName('Turkey_Leg_R'),
    body: turkey.getObjectByName('Turkey_Body'),
  };
  const turkeyBlob = makeBlob(0.7);
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
  // Skala 1,3: ancaman harus terbaca besar.
  const farmer = templates.farmer.clone();
  farmer.scale.setScalar(1.3);
  scene.add(farmer);
  const farmerParts = {
    armL: farmer.getObjectByName('Farmer_Arm_L'),
    armR: farmer.getObjectByName('Farmer_Arm_R'),
    legL: farmer.getObjectByName('Farmer_Leg_L'),
    legR: farmer.getObjectByName('Farmer_Leg_R'),
  };
  const farmerBlob = makeBlob(0.8);

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
      scene.add(mesh);
      pools[kind].push(mesh);
      poolBlobs[kind].push(makeBlob(kind === 'oven' ? 1.0 : 0.8));
    }
  }
  // Balok gantungan pisau (satu per pisau) + tiang penyangga di kedua ujung
  // (balok tanpa tiang tampak melayang — cacat audit di shot slide v1).
  const knifeBeams = [];
  const knifePosts = [];
  for (let i = 0; i < POOL.knife; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.18, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }),
    );
    beam.position.y = 3.05;
    beam.visible = false;
    scene.add(beam);
    knifeBeams.push(beam);
    const posts = [];
    for (const side of [-1.2, 1.2]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 3.05, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x5d4028, roughness: 0.95 }),
      );
      post.position.y = 1.52;
      post.visible = false;
      scene.add(post);
      posts.push(post);
    }
    knifePosts.push(posts);
  }

  // ---- jagung: SATU InstancedMesh (1 draw call untuk semua jagung)
  const cornGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.1, 0.55, 10).translate(0, 0, 0),
    new THREE.ConeGeometry(0.08, 0.16, 10).translate(0, 0.35, 0),
  ]);
  const cornMesh = new THREE.InstancedMesh(
    cornGeo,
    new THREE.MeshStandardMaterial({ color: 0xe8a81a, roughness: 0.7 }),
    CORN_MAX,
  );
  cornMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cornMesh.count = 0;
  cornMesh.frustumCulled = false;
  scene.add(cornMesh);

  // ---- HUD (DOM, update hanya saat nilai berubah)
  const hud = {
    score: el('hud-score'), dist: el('hud-dist'), coins: el('hud-coins'),
    hearts: el('hud-hearts'), speed: el('hud-speed'), zone: el('hud-zone'),
    farmer: el('farmer-fill'), warn: el('farmer-warn'),
  };
  const cache = {};
  function setText(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }

  const camPos = new THREE.Vector3(0, 4.5, 7.0);
  const camTarget = new THREE.Vector3(0, 4.5, 7.0);
  const lookAt = new THREE.Vector3(0, 1.0, -10);
  const dummy = new THREE.Object3D();
  let lastZone = -1;
  let trauma = 0;
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

    // Kalkun: posisi + squash & stretch + lari + slide. Skala dasar 1,2x
    // (render saja, fisika sim tetap) supaya kalkun lebih besar di frame.
    const squash = p.squash;
    turkey.position.set(p.x, p.y, 0);
    turkey.scale.set(1.2 * (1 - squash * 0.06), 1.2 * (1 + squash * 0.14), 1.2 * (1 - squash * 0.05));
    // Set SEMUA komponen rotasi tiap frame: clone() GLB mengurai quaternion
    // Y-180 menjadi Euler (pi,0,pi); mengubah .x saja membalik kalkun
    // (bug audit: kalkun terbalik di bawah tanah, hanya kaki + bayangan terlihat).
    const tilt = p.sliding ? 0.3 : (p.grounded ? 0 : -0.12);
    turkey.rotation.set(tilt, Math.PI, 0);
    if (p.sliding) {
      turkey.scale.y = 1.2 * 0.55;
    }
    // Kedip saat invulnerable.
    turkey.visible = !(p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0);
    const phase = p.runPhase;
    const flap = p.grounded && !p.sliding ? Math.sin(phase * 2.2) : 0;
    if (turkeyParts.wingL) turkeyParts.wingL.rotation.z = 0.2 + flap * 0.5;
    if (turkeyParts.wingR) turkeyParts.wingR.rotation.z = -0.2 - flap * 0.5;
    if (turkeyParts.legL) turkeyParts.legL.rotation.x = p.grounded ? Math.sin(phase * 2.2) * 0.6 : 0.4;
    if (turkeyParts.legR) turkeyParts.legR.rotation.x = p.grounded ? -Math.sin(phase * 2.2) * 0.6 : -0.3;
    turkey.position.y = p.y + (p.grounded && !p.sliding ? Math.abs(Math.sin(phase * 2.2)) * 0.05 : 0);
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
    // Dengan faktor 0,55 Bram selalu 4,5 m di depan kamera: kepala sampai
    // lutut masuk frame bawah, kalkun tetap terlihat di atas bahunya. Saat
    // tertangkap ia bergegas mendekat (visualGap -> 1,0).
    const rawGap = state.caught ? Math.max(1.2, state.farmerGap - state.caughtT * 6) : state.farmerGap;
    const visualGap = Math.max(1.0, rawGap * 0.55);
    farmer.position.set(p.x * 0.85, 0, visualGap);
    farmer.visible = true;
    const fPhase = phase * 1.15;
    if (farmerParts.armL) farmerParts.armL.rotation.x = 0.61 + Math.sin(fPhase * 2.2) * 0.5;
    if (farmerParts.armR) farmerParts.armR.rotation.x = 0.61 - Math.sin(fPhase * 2.2) * 0.5;
    if (farmerParts.legL) farmerParts.legL.rotation.x = Math.sin(fPhase * 2.2) * 0.55;
    if (farmerParts.legR) farmerParts.legR.rotation.x = -Math.sin(fPhase * 2.2) * 0.55;
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
        }
      }
    }

    // Jagung (InstancedMesh).
    let cornCount = 0;
    for (const corn of state.corns) {
      if (!corn.active || cornCount >= CORN_MAX) continue;
      dummy.position.set(corn.x, corn.y, corn.z);
      dummy.rotation.set(0, state.time * 1.5, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cornMesh.setMatrixAt(cornCount, dummy.matrix);
      cornCount += 1;
    }
    cornMesh.count = cornCount;
    cornMesh.instanceMatrix.needsUpdate = true;

    // Kamera: follow eksponensial + deadzone + look-ahead, LATE update.
    // Chase-cam TINGGI (y 4,8) dan MENGEKOR Bram: kamera 4,5 m di belakang
    // Bram (z = visualGap + 4,5). y 3,2 (percobaan kedua) SALAH: Bram lebih
    // tinggi dari kalkun dan menutupi kalkun sepenuhnya; y 5,5 (percobaan
    // ketiga) membuat kalkun terlihat tapi Bram hanya topi + bahu. Geometri:
    // kepala kalkun hanya di atas kepala Bram bila camY > 3,57 (dihitung dari
    // tinggi kalkun 1,64 m, Bram 2,65 m, jarak 9,45/4,5 m). Dengan y 4,8
    // kalkun utuh di atas kepala Bram DAN kepala + torso + lengan Bram masuk
    // frame (kepala 25,5 derajat ke bawah, tepi bawah 37 derajat). Saat
    // bahaya naik kamera mendekat + menunduk: semua membesar. FOV 52 (dari
    // 58) supaya kalkun lebih besar tanpa memotong HUD.
    const danger = Math.max(0, Math.min(1, (6 - state.farmerGap) / (6 - 4.2)));
    camTarget.set(p.x * 0.55, 4.8 - danger * 0.3, visualGap + 4.5);
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

    // HUD.
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      setText(hud.score, 'score', `SKOR ${state.score}`);
      setText(hud.dist, 'dist', `${Math.floor(state.distance)} m`);
      setText(hud.coins, 'coins', `🌽 ${state.coins}`);
      setText(hud.hearts, 'hearts', '♥'.repeat(Math.max(0, state.lives)) + '♡'.repeat(Math.max(0, 3 - state.lives)));
      setText(hud.speed, 'speed', `${speed.toFixed(1)} m/s`);
      setText(hud.zone, 'zone', ZONES[state.zoneIndex].name);
      const barDanger = Math.max(0, Math.min(1, (FARMER_GAP_MAX - state.farmerGap) / (FARMER_GAP_MAX - 4.2)));
      hud.farmer.style.width = `${Math.round(barDanger * 100)}%`;
      hud.warn.style.display = state.farmerGap < 6 ? 'block' : 'none';
    }
    if (screen === SCREEN_OVER) {
      setText(el('over-score'), 'oscore', `Skor: ${state.score}`);
      setText(el('over-best'), 'obest', `Terbaik: ${best}`);
      setText(el('over-stats'), 'ostats', `${Math.floor(state.distance)} m  •  🌽 ${state.coins} jagung`);
    }
    if (screen === SCREEN_TITLE) {
      setText(el('title-best'), 'tbest', best > 0 ? `Skor terbaik: ${best}` : '');
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
