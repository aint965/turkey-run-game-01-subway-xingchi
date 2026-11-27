// Audio sintetis WebAudio — tanpa file eksternal: langkah lari, lompat, koin,
// tabrakan, tertangkap, dan musik latar sederhana (bass + hat, loop scheduler).
// Semua pemakaian dibungkus try/catch: tanpa gesture user, AudioContext boleh diam.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let stepAlternate = false;
  let nextNoteTime = 0;
  let noteIndex = 0;

  // Bass line riang (A minor pentatonik), satu not per 0.22 detik.
  const BASS = [110, 0, 130.81, 0, 98, 0, 110, 0, 164.81, 0, 130.81, 0, 98, 0, 82.41, 0];
  const HAT_EVERY = 2; // hat tiap 2 not bass

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* audio tidak boleh mematikan game */ }
  }

  function noise(dur, vol, lowFreq = 400) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch { /* abaikan */ }
  }

  function scheduleMusic() {
    if (!ctx || muted) return;
    try {
      while (nextNoteTime < ctx.currentTime + 0.35) {
        const freq = BASS[noteIndex % BASS.length];
        if (freq > 0) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.5, nextNoteTime);
          gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 0.2);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start(nextNoteTime);
          osc.stop(nextNoteTime + 0.22);
        }
        if (noteIndex % HAT_EVERY === 0) {
          const len = Math.floor(ctx.sampleRate * 0.03);
          const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.4;
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 6000;
          src.connect(hp);
          hp.connect(musicGain);
          src.start(nextNoteTime);
        }
        nextNoteTime += 0.22;
        noteIndex += 1;
      }
    } catch { /* abaikan */ }
  }

  return {
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!musicTimer) {
        nextNoteTime = ctx.currentTime + 0.05;
        musicTimer = window.setInterval(scheduleMusic, 120);
      }
    },
    step() {
      if (!ensure()) return;
      stepAlternate = !stepAlternate;
      tone(stepAlternate ? 190 : 160, 0.06, 'square', 0.08);
    },
    jump() { if (ensure()) tone(280, 0.22, 'sine', 0.22, 0, 620); },
    land() { if (ensure()) noise(0.08, 0.12, 300); },
    slide() { if (ensure()) noise(0.18, 0.14, 900); },
    coin() {
      if (!ensure()) return;
      tone(1318.5, 0.09, 'sine', 0.2);
      tone(1975.5, 0.16, 'sine', 0.2, 0.07);
    },
    hit() {
      if (!ensure()) return;
      noise(0.25, 0.5, 500);
      tone(140, 0.3, 'sawtooth', 0.25, 0, 60);
    },
    caught() {
      if (!ensure()) return;
      tone(392, 0.25, 'sawtooth', 0.25);
      tone(311, 0.25, 'sawtooth', 0.25, 0.22);
      tone(233, 0.5, 'sawtooth', 0.28, 0.44);
      noise(0.4, 0.3, 300);
    },
    click() { if (ensure()) tone(660, 0.06, 'sine', 0.15); },
    zone() {
      if (!ensure()) return;
      tone(523.25, 0.12, 'triangle', 0.18);
      tone(783.99, 0.2, 'triangle', 0.18, 0.1);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
  };
}
