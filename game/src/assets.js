// Muat aset .glb Blender (GLTFLoader, vendor offline). Bila satu .glb gagal
// dimuat, bangun pengganti prosedural Three.js dengan warna/bentuk yang sama
// supaya game tetap jalan — fallback dilaporkan di window.__game.assets.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const FILES = {
  turkey: 'assets/turkey.glb',
  farmer: 'assets/farmer.glb',
  oven: 'assets/oven.glb',
  fence: 'assets/fence.glb',
  knife: 'assets/knife.glb',
  haystack: 'assets/haystack.glb',
  corn: 'assets/corn.glb',
  pumpkin: 'assets/pumpkin.glb',
  barrel: 'assets/barrel.glb',
};

// Karakter Blender menghadap -Y (depan Blender) -> di glTF menghadap +Z;
// di game mereka berlari ke -Z, jadi putar 180 derajat.
const FACE_TRAVEL = Math.PI;

function std(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function ball(group, name, color, pos, scale, roughness = 0.85) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), std(color, roughness));
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

function box(group, name, color, pos, scale, roughness = 0.85) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(color, roughness));
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

function cyl(group, name, color, pos, scale, roughness = 0.85) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), std(color, roughness));
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

function cone(group, name, color, pos, scale, roughness = 0.85) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 12), std(color, roughness));
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

/** Kalkun prosedural (fallback): bentuk + nama part sama seperti .glb. */
export function buildTurkeyFallback() {
  const g = new THREE.Group();
  g.name = 'Turkey_Fallback';
  ball(g, 'Turkey_Body', 0x73451e, [0, 0.62, 0], [0.42, 0.5, 0.55]);
  ball(g, 'Turkey_Belly', 0x9e6b33, [0, 0.52, -0.22], [0.3, 0.3, 0.38]);
  cyl(g, 'Turkey_Neck', 0xe8dcc8, [0, 0.98, -0.24], [0.13, 0.3, 0.13]);
  ball(g, 'Turkey_Head', 0xe8dcc8, [0, 1.2, -0.3], [0.17, 0.16, 0.17]);
  cone(g, 'Turkey_Beak', 0xe8862e, [0, 1.18, -0.52], [0.07, 0.16, 0.07]).rotation.x = Math.PI / 2;
  ball(g, 'Turkey_Wattle', 0xd93a2b, [0, 1.06, -0.44], [0.05, 0.05, 0.09]);
  ball(g, 'Turkey_Eye_L', 0x1a1a1a, [-0.11, 1.26, -0.4], [0.035, 0.035, 0.035]);
  ball(g, 'Turkey_Eye_R', 0x1a1a1a, [0.11, 1.26, -0.4], [0.035, 0.035, 0.035]);
  for (let i = 0; i < 5; i += 1) {
    const ang = [-0.55, -0.28, 0, 0.28, 0.55][i];
    const tail = ball(g, `Turkey_Tail_${i + 1}`, i % 2 ? 0xe8a33c : 0xa0522d,
      [Math.sin(ang) * 0.34, 0.95, 0.42 + Math.cos(ang) * 0.1], [0.16, 0.07, 0.46]);
    tail.rotation.x = -0.49;
    tail.rotation.z = -ang * 0.7;
  }
  ball(g, 'Turkey_Wing_L', 0x52301a, [-0.4, 0.66, 0.02], [0.12, 0.3, 0.4]);
  ball(g, 'Turkey_Wing_R', 0x52301a, [0.4, 0.66, 0.02], [0.12, 0.3, 0.4]);
  cyl(g, 'Turkey_Leg_L', 0xe8862e, [-0.13, 0.14, 0], [0.035, 0.28, 0.035]);
  cyl(g, 'Turkey_Leg_R', 0xe8862e, [0.13, 0.14, 0], [0.035, 0.28, 0.035]);
  box(g, 'Turkey_Foot_L', 0xe8862e, [-0.13, 0.03, -0.03], [0.16, 0.05, 0.22]);
  box(g, 'Turkey_Foot_R', 0xe8862e, [0.13, 0.03, -0.03], [0.16, 0.05, 0.22]);
  return g;
}

/** Petani Bram prosedural (fallback). */
export function buildFarmerFallback() {
  const g = new THREE.Group();
  g.name = 'Farmer_Fallback';
  cyl(g, 'Farmer_Leg_L', 0x3b5b8c, [-0.17, 0.3, 0], [0.11, 0.6, 0.11]);
  cyl(g, 'Farmer_Leg_R', 0x3b5b8c, [0.17, 0.3, 0], [0.11, 0.6, 0.11]);
  box(g, 'Farmer_Boot_L', 0x5c3a1e, [-0.17, 0.07, -0.05], [0.17, 0.13, 0.3]);
  box(g, 'Farmer_Boot_R', 0x5c3a1e, [0.17, 0.07, -0.05], [0.17, 0.13, 0.3]);
  ball(g, 'Farmer_Body', 0x4a7c59, [0, 1.02, 0], [0.44, 0.36, 0.52]);
  box(g, 'Farmer_Apron', 0x3b5b8c, [0, 0.95, -0.33], [0.48, 0.62, 0.06]);
  ball(g, 'Farmer_Head', 0xe8b88a, [0, 1.66, -0.02], [0.23, 0.22, 0.23]);
  ball(g, 'Farmer_Beard', 0xe8dcc8, [0, 1.52, -0.16], [0.16, 0.1, 0.14]);
  ball(g, 'Farmer_Nose', 0xe8b88a, [0, 1.66, -0.24], [0.05, 0.05, 0.05]);
  // Mata besar (putih + pupil) — seirama .glb supaya wajah terbaca dari
  // kamera chase yang tinggi, juga saat fallback dipakai.
  ball(g, 'Farmer_EyeWhite_L', 0xffffff, [-0.09, 1.72, -0.215], [0.065, 0.05, 0.065]);
  ball(g, 'Farmer_EyeWhite_R', 0xffffff, [0.09, 1.72, -0.215], [0.065, 0.05, 0.065]);
  ball(g, 'Farmer_Eye_L', 0x1a1a1a, [-0.09, 1.72, -0.26], [0.032, 0.032, 0.032]);
  ball(g, 'Farmer_Eye_R', 0x1a1a1a, [0.09, 1.72, -0.26], [0.032, 0.032, 0.032]);
  cyl(g, 'Farmer_HatBrim', 0xd9b45b, [0, 1.86, -0.02], [0.44, 0.04, 0.44]);
  ball(g, 'Farmer_HatTop', 0xd9b45b, [0, 1.88, -0.02], [0.24, 0.16, 0.24]);
  const armL = cyl(g, 'Farmer_Arm_L', 0x4a7c59, [-0.46, 1.18, -0.1], [0.1, 0.55, 0.1]);
  armL.rotation.x = 0.61;
  const armR = cyl(g, 'Farmer_Arm_R', 0x4a7c59, [0.46, 1.18, -0.1], [0.1, 0.55, 0.1]);
  armR.rotation.x = 0.61;
  ball(g, 'Farmer_Hand_L', 0xe8b88a, [-0.46, 0.93, 0.06], [0.09, 0.09, 0.09]);
  ball(g, 'Farmer_Hand_R', 0xe8b88a, [0.46, 0.93, 0.06], [0.09, 0.09, 0.09]);
  return g;
}

function buildPropFallback(kind) {
  const g = new THREE.Group();
  g.name = `${kind}_Fallback`;
  if (kind === 'oven') {
    box(g, 'Oven_Body', 0x3a3a40, [0, 0.95, 0], [1.6, 1.9, 1.2]);
    box(g, 'Oven_Door', 0x6b4a2f, [0, 0.85, -0.62], [1.1, 1.0, 0.06]);
    box(g, 'Oven_Fire', 0xff6a00, [0, 0.38, -0.63], [0.7, 0.28, 0.05]);
    box(g, 'Oven_Chimney', 0x3a3a40, [0.45, 2.15, 0.2], [0.3, 0.55, 0.3]);
  } else if (kind === 'fence') {
    for (const x of [-1.1, 0, 1.1]) box(g, 'Fence_Post', 0x8a6b42, [x, 0.5, 0], [0.12, 1.0, 0.12]);
    box(g, 'Fence_Rail_Top', 0x7a5c36, [0, 0.78, 0], [2.4, 0.12, 0.08]);
    box(g, 'Fence_Rail_Bottom', 0x7a5c36, [0, 0.38, 0], [2.4, 0.12, 0.08]);
  } else if (kind === 'knife') {
    box(g, 'Knife_Handle', 0x7a4a26, [0, -0.35, 0], [0.13, 0.5, 0.17]);
    box(g, 'Knife_Blade', 0xc9ced6, [0, -1.15, 0], [0.36, 1.3, 0.05]);
    cone(g, 'Knife_Tip', 0xc9ced6, [0, -1.95, 0], [0.18, 0.3, 0.05]).rotation.x = Math.PI;
  } else if (kind === 'haystack') {
    cone(g, 'Hay_Base', 0xd9a441, [0, 0.75, 0], [0.95, 1.5, 0.95]);
    cone(g, 'Hay_Top', 0xb8862e, [0, 1.45, 0], [0.55, 0.9, 0.55]);
  } else if (kind === 'corn') {
    cyl(g, 'Corn_Cob', 0xe8a81a, [0, 0.45, 0], [0.1, 0.55, 0.1]);
    cone(g, 'Corn_Tip', 0xe8a33c, [0, 0.78, 0], [0.08, 0.14, 0.08]);
  } else if (kind === 'pumpkin') {
    ball(g, 'Pumpkin_Body', 0xe8862e, [0, 0.38, 0], [0.46, 0.38, 0.46]);
    cyl(g, 'Pumpkin_Stem', 0x4a7c3f, [0, 0.74, 0], [0.05, 0.14, 0.05]);
  } else if (kind === 'barrel') {
    cyl(g, 'Barrel_Body', 0x8a6b42, [0, 0.36, 0], [0.36, 0.72, 0.36]);
  }
  return g;
}

const FALLBACKS = {
  turkey: buildTurkeyFallback,
  farmer: buildFarmerFallback,
  oven: () => buildPropFallback('oven'),
  fence: () => buildPropFallback('fence'),
  knife: () => buildPropFallback('knife'),
  haystack: () => buildPropFallback('haystack'),
  corn: () => buildPropFallback('corn'),
  pumpkin: () => buildPropFallback('pumpkin'),
  barrel: () => buildPropFallback('barrel'),
};

/**
 * Muat semua .glb (paralel, timeout 8 detik per file). Kembalikan
 * { templates: {kind: THREE.Group}, sources: {kind: 'glb'|'procedural'} }.
 * Template dipakai sebagai pola clone() per instance di render.
 */
export async function loadAssets(baseUrl = './') {
  const loader = new GLTFLoader();
  const templates = {};
  const sources = {};
  const jobs = Object.entries(FILES).map(async ([kind, file]) => {
    try {
      // fetch() polos + parseAsync: FileLoader three.js membungkus body lewat
      // ReadableStream manual — di headless Chromium itu dilaporkan sebagai
      // net::ERR_ABORTED padahal byte sampai (200). fetch polos bersih.
      const response = await Promise.race([
        fetch(baseUrl + file),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const gltf = await loader.parseAsync(buffer, baseUrl);
      const group = gltf.scene;
      group.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      if (kind === 'turkey' || kind === 'farmer') group.rotation.y = FACE_TRAVEL;
      templates[kind] = group;
      sources[kind] = 'glb';
    } catch {
      templates[kind] = FALLBACKS[kind]();
      if (kind === 'turkey' || kind === 'farmer') templates[kind].rotation.y = FACE_TRAVEL;
      sources[kind] = 'procedural';
    }
  });
  await Promise.all(jobs);
  return { templates, sources };
}
