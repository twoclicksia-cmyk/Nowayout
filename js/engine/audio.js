// Sonido: ambiente procedural de temporal, radio, teléfono, música y voces.
export class AudioEngine {
  constructor(base = '.') {
    this.base = base;
    this.ctx = null;
    this.muted = false;
    this.buffers = {};
    this.floor = 'f2';
    this.manifest = null;
    this.intensity = 0;
  }

  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    // todo lo que no es narrador pasa por aquí para poder bajarlo mientras habla
    this.duck = ctx.createGain(); this.duck.gain.value = 1; this.duck.connect(this.master);
    this.narrBus = ctx.createGain(); this.narrBus.gain.value = 1.0; this.narrBus.connect(this.master);
    this.noiseBuf = this._noise(4, 'white');
    this.brownBuf = this._noise(6, 'brown');
    // bus exterior filtrado según planta
    this.extFilter = ctx.createBiquadFilter(); this.extFilter.type = 'lowpass'; this.extFilter.frequency.value = 2500;
    this.extGain = ctx.createGain(); this.extGain.gain.value = 0.8;
    this.extFilter.connect(this.extGain); this.extGain.connect(this.duck);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.voiceBus = ctx.createGain(); this.voiceBus.gain.value = 1.0; this.voiceBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.duck);
    this._ambience();
    this._radioChain();
    this._music();
    try { this.manifest = await (await fetch(`${this.base}/assets/audio/vo/manifest.json`)).json(); } catch (e) { this.manifest = {}; }
    if (ctx.state === 'suspended') await ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  _noise(sec, kind) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
    }
    return b;
  }

  _src(buf, loop = true) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  _lfo(freq, depth, target, offset = 0) {
    const o = this.ctx.createOscillator(); o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(target); o.start();
    if (offset) target.value = offset;
    return o;
  }

  _ambience() {
    const ctx = this.ctx;
    // lluvia
    const rain = this._src(this.noiseBuf);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    const rg = ctx.createGain(); rg.gain.value = 0.16;
    rain.connect(hp); hp.connect(lp); lp.connect(rg); rg.connect(this.extFilter);
    // viento con rachas
    const wind = this._src(this.noiseBuf);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.9;
    this._lfo(0.07, 260, bp.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0.22;
    this._lfo(0.11, 0.14, wg.gain);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    wind.connect(bp); bp.connect(wg);
    if (pan) { this._lfo(0.05, 0.7, pan.pan); wg.connect(pan); pan.connect(this.extFilter); } else wg.connect(this.extFilter);
    // silbido en la cristalera (solo audible arriba)
    const whistle = this._src(this.noiseBuf);
    const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 1400; wbp.Q.value = 14;
    this._lfo(0.09, 300, wbp.frequency);
    this.whistleGain = ctx.createGain(); this.whistleGain.gain.value = 0.0;
    whistle.connect(wbp); wbp.connect(this.whistleGain); this.whistleGain.connect(this.extFilter);
    // mar
    const sea = this._src(this.brownBuf);
    const slp = ctx.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 380;
    const sg = ctx.createGain(); sg.gain.value = 0.55;
    this._lfo(0.085, 0.3, sg.gain);
    sea.connect(slp); slp.connect(sg); sg.connect(this.extFilter);
    // golpes de mar periódicos
    const surf = () => {
      if (!this.ctx) return;
      this._burst({ dur: 3.2, f0: 1400, f1: 180, gain: 0.35 + Math.random() * 0.25, dest: this.extFilter, attack: 0.25 });
      setTimeout(surf, 6500 + Math.random() * 7000);
    };
    setTimeout(surf, 3000);
    // goteo de lluvia
    const drip = () => {
      if (!this.ctx) return;
      this._click(2500 + Math.random() * 4500, 0.02 + Math.random() * 0.03, this.extFilter, 0.01);
      setTimeout(drip, 40 + Math.random() * 180);
    };
    drip();
    // zumbido interior
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 50;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0.0;
    hum.connect(this.humGain); this.humGain.connect(this.master); hum.start();
    this.setFloor(this.floor);
  }

  setFloor(f) {
    this.floor = f;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cfg = { f3: [12000, 1.0, 0.05], f2: [2600, 0.75, 0.0], f1: [1800, 0.62, 0.0], f0: [1300, 0.7, 0.0] }[f] || [2500, 0.7, 0];
    this.extFilter.frequency.setTargetAtTime(cfg[0], t, 0.4);
    this.extGain.gain.setTargetAtTime(cfg[1], t, 0.4);
    this.whistleGain.gain.setTargetAtTime(cfg[2], t, 0.4);
    if (this.radioOut) this.radioOut.gain.setTargetAtTime(f === 'f2' ? 1 : 0.18, t, 0.3);
    if (this.vhfOut) this.vhfOut.gain.setTargetAtTime(f === 'f2' || f === 'f3' ? 1 : 0.2, t, 0.3);
  }

  _burst({ dur, f0, f1, gain, dest, attack = 0.02 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f0, t); lp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp); lp.connect(g); g.connect(dest || this.sfxBus);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
  }

  _click(freq, dur, dest, gain = 0.05) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(dest || this.sfxBus);
    s.start(t, Math.random() * 3); s.stop(t + dur + 0.02);
  }

  thunder(delay = 2, strength = 0.8) {
    if (!this.ctx) return;
    setTimeout(() => {
      if (!this.ctx) return;
      this._burst({ dur: 5 + strength * 2, f0: 900, f1: 60, gain: 0.5 * strength, dest: this.extFilter, attack: 0.08 });
      this._burst({ dur: 6, f0: 160, f1: 40, gain: 0.7 * strength, dest: this.master, attack: 0.3 });
    }, delay * 1000);
  }

  // ------------------------------------------------------------ radio
  _radioChain() {
    const ctx = this.ctx;
    this.radioOut = ctx.createGain(); this.radioOut.gain.value = 1; this.radioOut.connect(this.duck);
    this.vhfOut = ctx.createGain(); this.vhfOut.gain.value = 1; this.vhfOut.connect(this.duck);
    const st = this._src(this.noiseBuf);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.6;
    this.staticGain = ctx.createGain(); this.staticGain.gain.value = 0;
    st.connect(bp); bp.connect(this.staticGain); this.staticGain.connect(this.radioOut);
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 900;
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain); this.whineGain.connect(this.radioOut); this.whine.start();
    this.carrierGain = ctx.createGain(); this.carrierGain.gain.value = 0;
    const murmur = this._src(this.noiseBuf);
    const mbp = ctx.createBiquadFilter(); mbp.type = 'bandpass'; mbp.frequency.value = 700; mbp.Q.value = 2.5;
    this._lfo(3.3, 300, mbp.frequency);
    const mg = ctx.createGain(); mg.gain.value = 0.5;
    this._lfo(4.1, 0.4, mg.gain);
    murmur.connect(mbp); mbp.connect(mg); mg.connect(this.carrierGain); this.carrierGain.connect(this.radioOut);
    this.radio = { power: 0, prox: 0, interference: 0 };
  }

  // prox: 0..1 cercanía a una emisora; power: receptor encendido; interference: ráfagas del balasto activas
  setRadio({ power, prox, interference, voice }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.radio = { power, prox, interference, voice };
    this.staticGain.gain.setTargetAtTime(power ? 0.05 + 0.05 * (1 - prox) : 0, t, 0.08);
    this.whineGain.gain.setTargetAtTime(power && prox > 0.2 && prox < 0.97 ? 0.012 * prox : 0, t, 0.08);
    this.whine.frequency.setTargetAtTime(400 + (1 - prox) * 2200, t, 0.05);
    this.carrierGain.gain.setTargetAtTime(power && prox > 0.5 && !voice ? 0.07 * prox : 0, t, 0.2);
  }

  // ráfaga del balasto (llamar en cada destello cuando haya interferencia)
  zap() {
    if (!this.ctx || !this.radio.power || !this.radio.interference) return;
    this._burst({ dur: 0.35, f0: 6000, f1: 800, gain: 0.5, dest: this.radioOut, attack: 0.005 });
    this._click(180, 0.2, this.radioOut, 0.25);
  }

  // ------------------------------------------------------------ voces
  async _buf(id) {
    if (this.buffers[id]) return this.buffers[id];
    const r = await fetch(`${this.base}/assets/audio/vo/${id}.mp3`);
    const ab = await r.arrayBuffer();
    const b = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
    this.buffers[id] = b;
    return b;
  }
  preload(ids) { if (this.ctx) ids.forEach(id => this._buf(id).catch(() => {})); }

  info(id) { return (this.manifest && this.manifest[id]) || { dur: 3, sub: '' }; }

  async playVoice(id, { bus = 'mf', noisy = false, mask = null, gain = 1 } = {}) {
    if (!this.ctx) return { dur: this.info(id).dur, ended: new Promise(r => setTimeout(r, this.info(id).dur * 1000)) };
    const ctx = this.ctx;
    let b;
    try { b = await this._buf(id); } catch (e) { return { dur: 2, ended: Promise.resolve() }; }
    const s = ctx.createBufferSource(); s.buffer = b;
    const g = ctx.createGain(); g.gain.value = gain;
    let out = bus === 'mf' ? this.radioOut : bus === 'vhf' ? this.vhfOut : bus === 'narr' ? this.narrBus : this.voiceBus;
    if (noisy) {
      const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 1100; lp.Q.value = 1.4;
      s.connect(lp); lp.connect(g);
      this._burst({ dur: b.duration, f0: 4000, f1: 2500, gain: 0.25, dest: out, attack: 0.05 });
    } else s.connect(g);
    g.connect(out);
    s.start();
    if (bus === 'mf') this.radio.voice = true;
    const ended = new Promise(res => { s.onended = () => { if (bus === 'mf') this.radio.voice = false; res(); }; });
    return { dur: b.duration, ended, stop: () => { try { s.stop(); } catch (e) {} } };
  }

  // narrador: baja el resto del sonido mientras habla
  async narrate(id) {
    if (!this.ctx) { const d = this.info(id).dur; return { dur: d, ended: new Promise(r => setTimeout(r, d * 1000)), stop() {} }; }
    this._narrN = (this._narrN || 0) + 1;
    this.duck.gain.setTargetAtTime(0.4, this.ctx.currentTime, 0.25);
    const p = await this.playVoice(id, { bus: 'narr' });
    let done = false;
    const release = () => { if (done) return; done = true; this._narrN = Math.max(0, this._narrN - 1); if (!this._narrN) this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.9); };
    p.ended.then(release);
    const stop = p.stop;
    p.stop = () => { stop && stop(); release(); };
    return p;
  }

  // ------------------------------------------------------------ teléfono
  ring(style = 'android') {
    if (!this.ctx) return;
    this.stopRing();
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0.55; out.connect(this.master);
    this.ringOut = out;
    // melodías originales (no son las de ningún fabricante)
    const ios = [[76, 0.0], [83, 0.18], [79, 0.36], [88, 0.54], [86, 0.9], [79, 1.08], [83, 1.26], [76, 1.44]];
    const android = [[72, 0.0], [79, 0.16], [84, 0.32], [76, 0.64], [79, 0.8], [83, 0.96], [79, 1.28], [74, 1.44]];
    const notes = style === 'ios' ? ios : android;
    const loopLen = 2.6;
    let n = 0;
    const play = () => {
      if (!this.ringOut) return;
      const t0 = ctx.currentTime + 0.05;
      for (const [midi, at] of notes) this._tone(midi, t0 + at, style, out);
      this._buzz(t0, 0.9, out);
      if (navigator.vibrate) { try { navigator.vibrate([700, 300, 700]); } catch (e) {} }
      n++;
      this._ringTimer = setTimeout(play, loopLen * 1000);
    };
    play();
  }
  stopRing() {
    clearTimeout(this._ringTimer);
    if (this.ringOut) { try { this.ringOut.disconnect(); } catch (e) {} this.ringOut = null; }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }
  _tone(midi, t, style, out) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(style === 'ios' ? 0.35 : 0.25, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (style === 'ios' ? 0.5 : 0.35));
    const o1 = ctx.createOscillator(); o1.type = style === 'ios' ? 'sine' : 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * (style === 'ios' ? 4.0 : 2.0);
    const g2 = ctx.createGain(); g2.gain.value = style === 'ios' ? 0.25 : 0.18;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o1.start(t); o2.start(t); o1.stop(t + 0.6); o2.stop(t + 0.6);
  }
  _buzz(t, dur, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 170;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  // fondo de la línea telefónica de 1996 (tormenta, siseo, zumbido)
  lineBed(on) {
    if (!this.ctx) return;
    if (on && !this._line) {
      const ctx = this.ctx;
      const s = this._src(this.noiseBuf);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0.05;
      this._lfo(0.4, 0.02, g.gain);
      s.connect(bp); bp.connect(g); g.connect(this.voiceBus);
      const hum = ctx.createOscillator(); hum.frequency.value = 50; const hg = ctx.createGain(); hg.gain.value = 0.015; hum.connect(hg); hg.connect(this.voiceBus); hum.start();
      this._line = { s, g, hum, hg };
      this._lineCrackle = setInterval(() => this._click(800 + Math.random() * 2000, 0.05, this.voiceBus, 0.08), 260);
    } else if (!on && this._line) {
      try { this._line.s.stop(); this._line.hum.stop(); } catch (e) {}
      clearInterval(this._lineCrackle);
      this._line = null;
    }
  }
  dropout(ms) { // trozo perdido de la llamada
    if (!this.ctx) return;
    this._burst({ dur: ms / 1000, f0: 3400, f1: 2000, gain: 0.22, dest: this.voiceBus, attack: 0.01 });
  }
  breath(ms = 2000) {
    if (!this.ctx) return;
    this._burst({ dur: ms / 1000, f0: 900, f1: 300, gain: 0.05, dest: this.voiceBus, attack: 0.6 });
  }

  // ------------------------------------------------------------ efectos
  sfx(name) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    switch (name) {
      case 'click': this._click(2600, 0.04, this.sfxBus, 0.12); break;
      case 'knob': this._click(4200, 0.02, this.sfxBus, 0.06); break;
      case 'switch': this._click(1200, 0.08, this.sfxBus, 0.35); this._burst({ dur: 0.15, f0: 900, f1: 200, gain: 0.2 }); break;
      case 'breaker': this._click(500, 0.15, this.sfxBus, 0.6); this._burst({ dur: 0.3, f0: 2000, f1: 100, gain: 0.3 }); break;
      case 'lever': this._burst({ dur: 0.6, f0: 600, f1: 90, gain: 0.6, attack: 0.05 }); this._click(300, 0.3, this.sfxBus, 0.6); break;
      case 'paper': this._burst({ dur: 0.4, f0: 5000, f1: 2000, gain: 0.12, attack: 0.05 }); break;
      case 'step': this._click(160 + Math.random() * 60, 0.12, this.sfxBus, 0.25); break;
      case 'pump': this._burst({ dur: 0.35, f0: 1800, f1: 400, gain: 0.25, attack: 0.1 }); break;
      case 'flare': this._burst({ dur: 1.6, f0: 3000, f1: 200, gain: 0.8, attack: 0.02 }); break;
      case 'ignite': this._burst({ dur: 1.2, f0: 1200, f1: 300, gain: 0.35, attack: 0.15 }); break;
      case 'ok': this._tone(84, t + 0.01, 'ios', this.sfxBus); this._tone(91, t + 0.12, 'ios', this.sfxBus); break;
      case 'err': this._tone(57, t + 0.01, 'android', this.sfxBus); this._tone(56, t + 0.14, 'android', this.sfxBus); break;
      case 'sting': this._burst({ dur: 4, f0: 220, f1: 40, gain: 0.7, dest: this.master, attack: 0.03 }); this._tone(45, t, 'ios', this.musicBus); break;
      case 'morse': this._tone(81, t, 'android', this.sfxBus); break;
      case 'water': this._burst({ dur: 2.5, f0: 1500, f1: 300, gain: 0.25, attack: 0.4 }); break;
    }
  }
  steps(n = 6) { for (let i = 0; i < n; i++) setTimeout(() => this.sfx('step'), i * 180); }

  // ------------------------------------------------------------ música
  _music() {
    const ctx = this.ctx;
    const pad = ctx.createGain(); pad.gain.value = 0.0; pad.connect(this.musicBus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.connect(pad);
    this._lfo(0.03, 200, lp.frequency);
    this.padOsc = [];
    for (const [midi, det] of [[45, -6], [45, 5], [52, 3], [57, -4], [60, 7]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12); o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = 0.06; o.connect(g); g.connect(lp); o.start();
      this.padOsc.push(o);
    }
    this.padLp = lp;
    this.pad = pad;
    pad.gain.setTargetAtTime(0.5, ctx.currentTime, 6);
    // capa de tensión aguda
    const ten = ctx.createGain(); ten.gain.value = 0; ten.connect(this.musicBus);
    for (const midi of [81, 82, 88]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const g = ctx.createGain(); g.gain.value = 0.035; o.connect(g); g.connect(ten); o.start();
      this._lfo(0.2 + Math.random() * 0.2, 3, o.detune);
    }
    this.tension = ten;
  }
  setIntensity(x) { // 0..1 a medida que se acerca el final
    if (!this.ctx) return;
    this.intensity = x;
    this.tension.gain.setTargetAtTime(Math.max(0, (x - 0.45) * 0.9), this.ctx.currentTime, 2);
  }
  heartbeat(on) {
    if (!this.ctx) return;
    clearInterval(this._hb);
    if (!on) return;
    const beat = () => {
      const t = this.ctx.currentTime;
      for (const [d, a] of [[0, 0.55], [0.22, 0.35]]) {
        const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(70, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.18);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(a, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
        o.connect(g); g.connect(this.master); o.start(t + d); o.stop(t + d + 0.3);
      }
    };
    beat();
    this._hb = setInterval(beat, 860);
  }
  // sirena de niebla del faro (diáfono): aviso de los minutos que quedan
  foghorn(blasts = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let b = 0; b < blasts; b++) {
      const t = ctx.currentTime + 0.05 + b * 3.1;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      o1.frequency.setValueAtTime(118, t); o1.frequency.setValueAtTime(118, t + 1.9); o1.frequency.exponentialRampToValueAtTime(86, t + 2.5);
      o2.frequency.setValueAtTime(59.3, t); o2.frequency.setValueAtTime(59.3, t + 1.9); o2.frequency.exponentialRampToValueAtTime(43, t + 2.5);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2.2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.25); g.gain.setValueAtTime(0.5, t + 1.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.7);
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.extFilter || this.master);
      o1.start(t); o2.start(t); o1.stop(t + 2.8); o2.stop(t + 2.8);
    }
  }
  tick(final = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = final ? 1320 : 990;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(final ? 0.22 : 0.12, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    o.connect(lp); lp.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.14);
  }

  // color armónico del fondo musical según el momento
  mood(name) {
    if (!this.ctx || !this.padOsc) return;
    const M = {
      dark: { notes: [45, 45, 52, 57, 60], lvl: 0.5, lp: 520 },
      dread: { notes: [45, 46, 52, 57, 58], lvl: 0.6, lp: 420 },
      sad: { notes: [38, 45, 50, 53, 57], lvl: 0.45, lp: 600 },
      hope: { notes: [45, 52, 57, 61, 64], lvl: 0.5, lp: 900 },
      dawn: { notes: [41, 48, 53, 57, 60], lvl: 0.42, lp: 1100 },
    }[name] || null;
    if (!M) return;
    const t = this.ctx.currentTime;
    M.notes.forEach((m, i) => this.padOsc[i] && this.padOsc[i].frequency.setTargetAtTime(440 * Math.pow(2, (m - 69) / 12), t, 1.2));
    this.pad.gain.setTargetAtTime(M.lvl, t, 1.5);
    this.padLp.frequency.cancelScheduledValues(t);
    this.padLp.frequency.setTargetAtTime(M.lp, t, 1.5);
    if (this.tension) this.tension.gain.setTargetAtTime(name === 'dread' ? 0.25 : 0, t, 1.5);
  }
  musicOff() { if (this.pad) this.pad.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5); if (this.tension) this.tension.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5); this.heartbeat(false); }
  ambienceDuck(x) { if (this.extGain) this.extGain.gain.setTargetAtTime(x, this.ctx.currentTime, 0.6); }
}
