/**
 * Procedural ambient score (Web Audio, no files).
 * Layers: low drone pad (detuned saws → lowpass), wind (filtered noise),
 * water shimmer (band-passed noise with slow LFO) and a soft bell when chapters change.
 * Mix follows the film: space = drone + air; river = water + wind; night = warmer pad.
 */
export function createAmbience() {
  let ac = null, master = null, nodes = null, on = false;

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);

    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(master);
    const verbIn = ac.createGain(); verbIn.gain.value = 0.6;
    const verb = ac.createConvolver(); verb.buffer = impulse(ac, 4.5, 2.4);
    verbIn.connect(verb); verb.connect(comp);

    // Drone pad
    const pad = ac.createGain(); pad.gain.value = 0.0;
    const padFilter = ac.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 420; padFilter.Q.value = 0.6;
    pad.connect(padFilter); padFilter.connect(comp); padFilter.connect(verbIn);
    const freqs = [55, 82.41, 110.0, 164.81, 220.0];
    const oscs = freqs.map((f, i) => {
      const o = ac.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle';
      o.frequency.value = f; o.detune.value = (i - 2) * 6;
      const g = ac.createGain(); g.gain.value = 0.06 / (1 + i * 0.4);
      o.connect(g); g.connect(pad); o.start();
      return o;
    });
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.05;
    const lfoGain = ac.createGain(); lfoGain.gain.value = 140; lfo.connect(lfoGain); lfoGain.connect(padFilter.frequency); lfo.start();

    // Noise source
    const noise = ac.createBufferSource(); noise.buffer = pinkNoise(ac, 6); noise.loop = true; noise.start();

    // Wind
    const wind = ac.createGain(); wind.gain.value = 0;
    const windF = ac.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.7;
    noise.connect(windF); windF.connect(wind); wind.connect(comp); wind.connect(verbIn);
    const wlfo = ac.createOscillator(); wlfo.frequency.value = 0.09;
    const wlfoG = ac.createGain(); wlfoG.gain.value = 300; wlfo.connect(wlfoG); wlfoG.connect(windF.frequency); wlfo.start();

    // Water shimmer
    const water = ac.createGain(); water.gain.value = 0;
    const waterF = ac.createBiquadFilter(); waterF.type = 'highpass'; waterF.frequency.value = 2200;
    const waterF2 = ac.createBiquadFilter(); waterF2.type = 'lowpass'; waterF2.frequency.value = 6500;
    noise.connect(waterF); waterF.connect(waterF2); waterF2.connect(water); water.connect(comp);
    const trem = ac.createOscillator(); trem.frequency.value = 0.35;
    const tremG = ac.createGain(); tremG.gain.value = 0.015; trem.connect(tremG); tremG.connect(water.gain); trem.start();

    nodes = { pad, padFilter, wind, water, oscs, verbIn };
  }

  function bell(freq = 660) {
    if (!on || !ac) return;
    const t = ac.currentTime;
    [1, 2.01, 3.02].forEach((m, i) => {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 / (i + 1), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      o.connect(g); g.connect(nodes.verbIn); g.connect(master);
      o.start(t); o.stop(t + 3.6);
    });
  }

  return {
    get on() { return on; },
    async toggle() {
      if (!ac) build();
      if (ac.state === 'suspended') await ac.resume();
      on = !on;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(on ? 0.85 : 0, t, on ? 1.2 : 0.4);
      if (on) bell(523.25);
      return on;
    },
    /** f: film progress 0..1 (or >1 after the film) */
    update(f) {
      if (!ac || !nodes) return;
      const t = ac.currentTime;
      const space = Math.max(0, 1 - f / 0.42);
      const river = Math.min(1, Math.max(0, (f - 0.4) / 0.2)) * Math.max(0, 1 - Math.max(0, f - 1) * 2);
      const night = Math.min(1, Math.max(0, (f - 0.7) / 0.25));
      nodes.pad.gain.setTargetAtTime(0.55 + 0.25 * space + 0.2 * night, t, 0.8);
      nodes.padFilter.frequency.setTargetAtTime(300 + 500 * space + 250 * night, t, 1.2);
      nodes.wind.gain.setTargetAtTime(0.05 + 0.18 * space * 0.5 + 0.12 * river, t, 1.0);
      nodes.water.gain.setTargetAtTime(0.06 * river, t, 1.0);
    },
    chime(i) { bell([523.25, 587.33, 659.25, 783.99, 880][i % 5]); },
  };
}

function pinkNoise(ac, seconds) {
  const len = ac.sampleRate * seconds;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return buf;
}

function impulse(ac, seconds, decay) {
  const len = ac.sampleRate * seconds;
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
