// All sound is synthesized with WebAudio — no audio files. Everything is a
// no-op until start() runs from a user gesture, so headless screenshots stay silent.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicStep = 0;

  function start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (error) {
      ctx = null;
    }
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.value = value ? 0 : 0.5;
  }

  function isMuted() {
    return muted;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    gain.gain.setValueAtTime(vol || 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
  }

  function gunshot() {
    noiseBurst(0.14, 0.5, 2600);
    tone(180, 0.08, 'square', 0.12, 60);
  }

  function punch() {
    noiseBurst(0.09, 0.25, 700);
  }

  function pickup() {
    tone(660, 0.09, 'sine', 0.2);
    setTimeout(() => tone(990, 0.12, 'sine', 0.2), 70);
  }

  function missionDone() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.22, 'triangle', 0.22), i * 110);
    });
  }

  function missionFail() {
    [392, 330, 262].forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.3, 'sawtooth', 0.14), i * 140);
    });
  }

  function crash() {
    noiseBurst(0.25, 0.4, 500);
  }

  function setEngine(speed01, on) {
    if (!ctx || !master) return;
    if (!on) {
      if (engineOsc) {
        try {
          engineOsc.stop();
        } catch (error) {}
        engineOsc = null;
        engineGain = null;
      }
      return;
    }
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.05;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    engineOsc.frequency.value = 55 + speed01 * 130;
    engineGain.gain.value = 0.03 + speed01 * 0.05;
  }

  function setSiren(on) {
    if (!ctx || !master) return;
    if (!on) {
      if (sirenOsc) {
        try {
          sirenOsc.stop();
        } catch (error) {}
        sirenOsc = null;
        sirenGain = null;
      }
      return;
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.frequency.value = 750;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      lfo.start();
    }
  }

  // A laid-back synthwave loop: minor-key bass + sparse arpeggio, 8 steps a bar.
  const BASS = [55, 0, 55, 65.4, 55, 0, 49, 58.3];
  const ARP = [220, 261.6, 329.6, 392, 329.6, 261.6, 196, 246.9];
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      const bass = BASS[musicStep % BASS.length];
      if (bass) tone(bass, 0.42, 'triangle', 0.16);
      if (musicStep % 2 === 0) tone(ARP[musicStep % ARP.length], 0.2, 'square', 0.035);
      musicStep += 1;
    }, 240);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    start,
    setMuted,
    isMuted,
    gunshot,
    punch,
    pickup,
    missionDone,
    missionFail,
    crash,
    setEngine,
    setSiren,
    startMusic,
    stopMusic,
  };
}
