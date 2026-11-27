// Aksi bernama + edge-trigger + action buffer (input-systems).
// Aksi: moveLeft, moveRight, jump, slide, pause, restart, mute, confirm.
// Lompat edge-triggered (just-pressed); input 0,15 detik sebelum landing tetap
// dieksekusi (buffer) — tidak ada input yang hilang karena timing frame.
export const BUFFER_SECONDS = 0.15;

const KEYMAP = {
  ArrowLeft: 'moveLeft', KeyA: 'moveLeft',
  ArrowRight: 'moveRight', KeyD: 'moveRight',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'slide', KeyS: 'slide',
  KeyP: 'pause', Escape: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
  Enter: 'confirm',
};

export function createInput(target) {
  // Antrian aksi just-pressed: { action, at } dengan `at` = performance.now().
  const queue = [];
  // Buffer untuk aksi yang datang saat kondisi belum memungkinkan (mis. lompat di udara).
  let buffered = null;

  function enqueue(action) {
    queue.push({ action, at: performance.now() });
  }

  window.addEventListener('keydown', (event) => {
    const action = KEYMAP[event.code];
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    enqueue(action);
  });
  window.addEventListener('blur', () => {
    queue.length = 0;
    buffered = null;
  });
  // Sentuh/klik: kiri/kanan layar = pindah jalur, tengah = lompat, bawah = slide.
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (y > 0.72) enqueue('slide');
    else if (x < 0.33) enqueue('moveLeft');
    else if (x > 0.67) enqueue('moveRight');
    else enqueue('jump');
  });

  return {
    /** Ambil semua aksi just-pressed sejak panggilan terakhir. */
    takeActions() {
      if (queue.length === 0) return [];
      const taken = queue.splice(0, queue.length);
      return taken.map((item) => item.action);
    },
    /** Simpan aksi ke buffer; kembalikan true bila buffer terisi. */
    bufferAction(action) {
      buffered = { action, at: performance.now() };
      return true;
    },
    /** Ambil aksi buffer yang masih segar (<= BUFFER_SECONDS), atau null. */
    takeBuffered(now) {
      if (!buffered) return null;
      if ((now - buffered.at) / 1000 > BUFFER_SECONDS) {
        buffered = null;
        return null;
      }
      const action = buffered.action;
      buffered = null;
      return action;
    },
    /** Untuk tes/driver: masukkan aksi seolah dari keyboard. */
    inject(action) {
      enqueue(action);
    },
  };
}
