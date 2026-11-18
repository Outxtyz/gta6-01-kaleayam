// Synthesized sound: every effect and the music loop are built with the
// WebAudio API, so the game ships no audio files and makes no requests.
// Audio starts only after the player's first key or click (browsers require
// a gesture before an AudioContext may run).
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;
  let started = false;

  // A lazy, laid-back bass line over a warm pad: one bar, eight steps.
  const BASS_NOTES = [55, 0, 55, 65.41, 55, 0, 49, 58.27];
  const PAD_NOTES = [220, 261.63, 329.63];

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function startEngine() {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 28;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
  }

  function startSiren() {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  }

  function note(frequency, time, duration, type, volume) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  function noiseBurst(duration, volume, filterFreq) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function musicTick() {
    if (!ctx || muted) return;
    const now = ctx.currentTime + 0.05;
    const bass = BASS_NOTES[musicStep % BASS_NOTES.length];
    if (bass > 0) note(bass, now, 0.42, 'triangle', 0.16);
    if (musicStep % 4 === 0) {
      for (const freq of PAD_NOTES) note(freq, now, 1.7, 'sine', 0.035);
    }
    if (musicStep % 2 === 1) noiseBurst(0.05, 0.05, 6000);
    musicStep += 1;
  }

  return {
    /** Call on the first user gesture; safe to call repeatedly. */
    unlock() {
      if (started) {
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        return;
      }
      if (!ensure()) return;
      started = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startEngine();
      startSiren();
      musicTimer = window.setInterval(musicTick, 460);
    },
    get ready() { return started; },
    get isMuted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Engine hum follows the player's speed (0..1) and whether driving. */
    setEngine(speedRatio, driving) {
      if (!ctx || !engineOsc) return;
      const target = driving ? 0.05 + speedRatio * 0.075 : 0.0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const freq = 52 + speedRatio * 130;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(380 + speedRatio * 900, ctx.currentTime, 0.1);
    },
    /** Two-tone siren while police are close; quiet otherwise. */
    setSiren(active, dt) {
      if (!ctx || !sirenOsc) return;
      sirenTimer += dt;
      if (!active) {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        return;
      }
      sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 660, ctx.currentTime, 0.05);
      }
    },
    gunshot() {
      if (!ctx) return;
      noiseBurst(0.14, 0.5, 2400);
      note(160, ctx.currentTime, 0.1, 'square', 0.18);
    },
    punch() {
      if (!ctx) return;
      noiseBurst(0.09, 0.35, 900);
    },
    crash(strength) {
      if (!ctx) return;
      noiseBurst(0.22, Math.min(0.6, 0.2 + strength * 0.4), 700);
      note(70, ctx.currentTime, 0.18, 'sine', 0.3);
    },
    pickup() {
      if (!ctx) return;
      const now = ctx.currentTime;
      note(660, now, 0.09, 'sine', 0.22);
      note(880, now + 0.08, 0.12, 'sine', 0.22);
    },
    horn() {
      if (!ctx) return;
      note(370, ctx.currentTime, 0.28, 'square', 0.12);
      note(466, ctx.currentTime, 0.28, 'square', 0.1);
    },
    jingle() {
      if (!ctx) return;
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => note(freq, now + i * 0.11, 0.22, 'triangle', 0.2));
    },
    busted() {
      if (!ctx) return;
      const now = ctx.currentTime;
      [392, 311, 233].forEach((freq, i) => note(freq, now + i * 0.16, 0.3, 'sawtooth', 0.14));
    },
  };
}
