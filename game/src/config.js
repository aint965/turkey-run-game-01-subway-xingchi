// Kalkun Kabur — endless runner 3 jalur: semua angka tuning + palet di satu tempat.
// Satuan meter/detik; sumbu z: pemain di z=0, rintangan datang dari z negatif.
export const STEP = 1 / 60;

export const LANES = [-2.2, 0, 2.2];
export const LANE_COUNT = 3;
export const SPAWN_Z = -95;
export const KILL_Z = 12;

export const PLAYER = {
  halfWidth: 0.45,
  height: 1.37,
  slideHeight: 0.62,
  laneSpeed: 14, // meter/detik geser antar jalur (eased, bukan teleport)
  jumpVelocity: 11.5,
  gravity: 30,
  invulnerable: 1.5,
};

export const RUN = {
  startSpeed: 12,
  maxSpeed: 26,
  accelPerMeter: 0.0045, // kecepatan naik per meter jarak
  slideTime: 0.7,
};

export const FARMER = {
  gapStart: 9.0, // jarak awal petani di belakang kalkun (meter)
  gapMin: 4.2, // jarak terdekat sebelum tertangkap
  gapMax: 9.0,
  hitCloser: 1.6, // tiap tabrakan petani makin dekat
  recoverPerSecond: 0.3, // petani menjauh lagi perlahan saat aman
};

export const LIVES = 3;

export const OBSTACLE = {
  fence: { height: 1.0, halfWidth: 1.0, jumpable: true, slidable: false },
  hay: { height: 1.9, halfWidth: 0.95, jumpable: true, slidable: false },
  oven: { height: 2.42, halfWidth: 0.85, jumpable: false, slidable: false },
  knife: { height: 1.9, halfWidth: 0.5, jumpable: false, slidable: true },
};

export const CORN_POINTS = 25;

/** Zona makin sulit: halaman peternakan -> lumbung -> dapur. */
export const ZONES = [
  { until: 300, name: 'HALAMAN PETERNAKAN', ground: 0x7fae4e, side: 0x5d8a3a, sky: 0x9fd4e8, fog: 0xa8d8ea },
  { until: 700, name: 'LUMBUNG', ground: 0xc2a15e, side: 0x8a6b3a, sky: 0xe8c98f, fog: 0xe0c188 },
  { until: Infinity, name: 'DAPUR', ground: 0xb8b0a4, side: 0x7a6a58, sky: 0xf2d8a0, fog: 0xe8d5a8 },
];

export const PALETTE = {
  backdrop: '#1a1210',
  text: '#fff6e0',
  muted: '#d8c8a8',
  accent: '#f2c94c',
  danger: '#e5534b',
  panel: 'rgba(26, 18, 16, 0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const BEST_KEY = 'kalkun-kabur.best';
