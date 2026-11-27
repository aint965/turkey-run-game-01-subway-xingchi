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
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);

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

  // ---- prop sisi per zona (satu dari tiap jenis per sisi, hanya yang sesuai zona terlihat)
  const sideProps = [];
  const propKinds = ['pumpkin', 'barrel', 'haystack', 'oven'];
  for (const seg of segments) {
    for (const side of [-1, 1]) {
      const holder = new THREE.Group();
      holder.position.set(side * 6.4, 0, -6);
      for (const kind of propKinds) {
        const prop = templates[kind].clone();
        prop.visible = false;
        if (kind === 'oven') prop.scale.setScalar(0.7);
        if (kind === 'haystack') prop.scale.setScalar(0.8);
        holder.add(prop);
      }
      holder.userData.kinds = propKinds;
      seg.add(holder);
      sideProps.push(holder);
    }
  }
  function applyZone(zoneIndex) {
    const zone = ZONES[zoneIndex];
    groundMat.color.setHex(zone.ground);
    scene.background.setHex(zone.sky);
    scene.fog.color.setHex(zone.fog);
    hemi.groundColor.setHex(zone.side);
    // Zona 0: labu, zona 1: jerami/tong, zona 2: oven/tong.
    const pick = zoneIndex === 0 ? 'pumpkin' : zoneIndex === 1 ? 'haystack' : 'oven';
    const pick2 = zoneIndex === 0 ? 'barrel' : zoneIndex === 1 ? 'barrel' : 'barrel';
    for (const holder of sideProps) {
      // Selang-seling: separuh holder pakai pick, separuh pick2.
      const usePick = (sideProps.indexOf(holder) % 2 === 0);
      holder.children.forEach((child, i) => {
        child.visible = holder.userData.kinds[i] === (usePick ? pick : pick2);
      });
    }
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
  const farmer = templates.farmer.clone();
  farmer.scale.setScalar(1.18);
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
  // Balok gantungan pisau (satu per pisau).
  const knifeBeams = [];
  for (let i = 0; i < POOL.knife; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.18, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }),
    );
    beam.position.y = 3.05;
    beam.visible = false;
    scene.add(beam);
    knifeBeams.push(beam);
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

    // Kalkun: posisi + squash & stretch + lari + slide.
    const squash = p.squash;
    turkey.position.set(p.x, p.y, 0);
    turkey.scale.set(1 - squash * 0.06, 1 + squash * 0.14, 1 - squash * 0.05);
    // Set SEMUA komponen rotasi tiap frame: clone() GLB mengurai quaternion
    // Y-180 menjadi Euler (pi,0,pi); mengubah .x saja membalik kalkun
    // (bug audit: kalkun terbalik di bawah tanah, hanya kaki + bayangan terlihat).
    const tilt = p.sliding ? 0.3 : (p.grounded ? 0 : -0.12);
    turkey.rotation.set(tilt, Math.PI, 0);
    if (p.sliding) {
      turkey.scale.y = 0.55;
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

    // Petani: z = gap (di belakang kalkun, ke arah kamera); makin dekat makin besar.
    const gap = state.caught ? Math.max(1.2, state.farmerGap - state.caughtT * 6) : state.farmerGap;
    farmer.position.set(p.x * 0.85, 0, gap);
    farmer.visible = gap < 9.6;
    const fPhase = phase * 1.15;
    if (farmerParts.armL) farmerParts.armL.rotation.x = 0.61 + Math.sin(fPhase * 2.2) * 0.5;
    if (farmerParts.armR) farmerParts.armR.rotation.x = 0.61 - Math.sin(fPhase * 2.2) * 0.5;
    if (farmerParts.legL) farmerParts.legL.rotation.x = Math.sin(fPhase * 2.2) * 0.55;
    if (farmerParts.legR) farmerParts.legR.rotation.x = -Math.sin(fPhase * 2.2) * 0.55;
    farmerBlob.position.set(farmer.position.x, 0.03, gap);
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
        if (kind === 'knife') knifeBeams[i].visible = false;
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
    // Bram mendekat = kamera mundur + menunduk: petani masuk frame bawah
    // (tanpa ini petani selalu di luar frame — FOV 58 derajat tak sampai).
    const danger = Math.max(0, Math.min(1, (6 - state.farmerGap) / (6 - 4.2)));
    camTarget.set(p.x * 0.55, 4.5 + danger * 1.2, 7.0 + danger * 1.3);
    const rate = 7;
    const k = 1 - Math.exp(-rate * dt);
    camPos.lerp(camTarget, k);
    lookAt.set(p.x * 0.8, 0.9 - danger * 1.4, -10);
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
      const danger = Math.max(0, Math.min(1, (FARMER_GAP_MAX - state.farmerGap) / (FARMER_GAP_MAX - 4.2)));
      hud.farmer.style.width = `${Math.round(danger * 100)}%`;
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
