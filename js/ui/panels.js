// Paneles interactivos (hoja inferior en móvil / lateral en escritorio)
import { h, $, ICON, drag, fmtTime } from './dom.js';
import * as S from '../game/state.js';
import { DOCS, OBJECTIVES, HINTS, RADIO, ROLES } from '../game/content.js';
import { chartSVG, chartOrigins, ux, uy, W as CW, H as CH } from './chart.js';
import { toLatLon, fmtLat, fmtLon, fromLatLon, MARKS } from '../game/nav.js';

const BANDS = { LW: [150, 500], MF: [1600, 3800], HF1: [4000, 8000], HF2: [8000, 16000] };
const DECOYS = [1752.0, 2670.0, 3023.0];

export function rxSignal(rx, power) {
  if (!power) return { prox: 0, kind: 'off' };
  const ant = { 1: 0.15, 2: 1, 3: 0.45, 4: 0 }[rx.ant] ?? 0;
  if (rx.band !== 'MF') return { prox: 0.05 * ant, kind: 'noise' };
  const dT = Math.abs(rx.freq - 2182);
  let prox = Math.max(0, 1 - dT / 14) * ant, kind = dT <= 0.6 ? 'target' : dT <= 14 ? 'near' : 'noise';
  for (const d of DECOYS) {
    const p = Math.max(0, 1 - Math.abs(rx.freq - d) / 6) * ant * 0.7;
    if (p > prox) { prox = p; kind = 'decoy'; }
  }
  return { prox, kind, antOk: rx.ant === 2 };
}

function rotary({ label, value, min, max, step = 1, fmt = (v) => v, onChange, big = false, sens = 0.4, wrapAround = false }) {
  const knob = h('div', { class: 'rotary' + (big ? ' big' : ''), role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max });
  const val = h('div', { class: 'val' });
  let v = value, busy = false;
  const set = (nv, fire = true) => {
    if (wrapAround) { const span = max - min + step; nv = ((nv - min) % span + span) % span + min; }
    nv = Math.max(min, Math.min(max, Math.round(nv / step) * step));
    nv = Math.round(nv * 1000) / 1000;
    const changed = nv !== v;
    v = nv;
    knob.style.setProperty('--a', `${((v - min) / (max - min || 1)) * 300 - 150}deg`);
    knob.setAttribute('aria-valuenow', v);
    val.textContent = fmt(v);
    if (changed && fire) onChange && onChange(v);
  };
  let acc = 0;
  drag(knob, {
    onStart: () => { busy = true; acc = 0; },
    onMove: (dx, dy) => { acc += (dx - dy) * sens; const n = Math.trunc(acc); if (n) { acc -= n; set(v + n * step); } },
    onEnd: () => { busy = false; },
  });
  knob.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(v + step); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(v - step); e.preventDefault(); }
  });
  set(v, false);
  const el = h('div', { class: 'ctl' }, h('div', { class: 'lab', text: label }), knob, val,
    h('div', { class: 'row', style: { gap: '6px' } },
      h('button', { class: 'btn small ghost', 'aria-label': `${label} menos`, text: '−', onclick: () => set(v - step) }),
      h('button', { class: 'btn small ghost', 'aria-label': `${label} más`, text: '+', onclick: () => set(v + step) })));
  return { el, set: (nv) => { if (!busy) set(nv, false); }, get: () => v, busy: () => busy };
}

function throttle(fn, ms) {
  let last = 0, timer = null, lastArgs;
  return (...a) => {
    lastArgs = a;
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else { clearTimeout(timer); timer = setTimeout(() => { last = Date.now(); fn(...lastArgs); }, ms - (now - last)); }
  };
}

export class Panels {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'false' });
    this.title = h('h3');
    this.body = h('div', { class: 'sheet-body' });
    const close = h('button', { class: 'iconbtn', 'aria-label': 'Cerrar', html: ICON.close, onclick: () => this.close() });
    this.sheet.append(h('div', { class: 'sheet-head' }, this.title, close), this.body);
    root.appendChild(this.sheet);
    this.cur = null;
  }

  isOpen() { return !!this.cur; }

  open(id, arg) {
    this.close(true);
    const P = PANELS[id];
    if (!P) return;
    this.cur = { id, arg, inst: P(this.ctx, arg, this) };
    this.title.textContent = this.cur.inst.title;
    this.body.innerHTML = '';
    this.body.appendChild(this.cur.inst.el);
    this.sheet.classList.add('open');
    this.cur.inst.update && this.cur.inst.update(this.ctx.state());
    this.ctx.audio.sfx('click');
    this.ctx.onPanel && this.ctx.onPanel(id, true);
  }

  close(silent) {
    if (!this.cur) return;
    const id = this.cur.id;
    this.cur.inst.unmount && this.cur.inst.unmount();
    this.cur = null;
    this.sheet.classList.remove('open');
    if (!silent) this.ctx.onPanel && this.ctx.onPanel(id, false);
  }

  update(state) {
    if (this.cur && this.cur.inst.update) this.cur.inst.update(state);
  }
  tick(t) {
    if (this.cur && this.cur.inst.tick) this.cur.inst.tick(t);
  }
}

// ---------------------------------------------------------------- definición de paneles
const PANELS = {};

PANELS.breakers = (ctx) => {
  const st = h('div', { class: 'status' });
  const sw = h('button', { class: 'btn primary', onclick: () => { ctx.dispatch({ t: 'power', on: ctx.state().f.power ? 0 : 1 }); ctx.audio.sfx('breaker'); } });
  const el = h('div', { class: 'split' },
    h('p', { class: 'panel-note', text: 'Cuadro de reserva. Con la corriente cortada, el faro solo alimenta lo imprescindible.' }),
    h('div', { class: 'card', style: { display: 'grid', gap: '10px' } },
      h('div', { class: 'row' }, h('div', {}, h('div', { class: 'eyebrow', text: 'SALA DE RADIO' }), st), sw),
      h('div', { class: 'eyebrow', text: 'VHF · ON  ·  TRANSMISOR · RESERVA  ·  LINTERNA · BATERÍAS' }),
      h('p', { class: 'fine', text: 'El interruptor de la linterna está arriba, en el pedestal de la óptica.' })));
  return {
    title: 'Cuadro de diferenciales', el,
    update(s) { const on = s.f.power; st.textContent = on ? 'Conectado' : 'Desconectado'; st.className = 'status ' + (on ? 'ok' : 'bad'); sw.textContent = on ? 'Bajar diferencial' : 'Subir diferencial'; },
  };
};

PANELS.rx = (ctx) => {
  const s0 = ctx.state();
  const local = { ...s0.rx };
  let editAt = 0;
  const send0 = throttle((patch) => ctx.dispatch({ t: 'rx', ...patch }), 140);
  const send = (patch) => { editAt = Date.now(); send0(patch); };
  const dial = h('canvas', { width: 600, height: 140 });
  const counter = h('div', { class: 'counter mono' });
  const scope = h('canvas', { width: 600, height: 128 });
  const status = h('div', { class: 'status' });
  const smeter = h('div', { class: 'meter' }, h('i'));
  const bandSeg = h('div', { class: 'seg' });
  const antSeg = h('div', { class: 'seg' });
  for (const b of Object.keys(BANDS)) bandSeg.appendChild(h('button', { 'data-v': b, text: b, onclick: () => { if (ctx.state().f.locked) return; local.band = b; local.freq = BANDS[b][0] + 50; draw(); send({ band: b, freq: local.freq }); ctx.audio.sfx('switch'); } }));
  for (const a of [1, 2, 3, 4]) antSeg.appendChild(h('button', { 'data-v': a, text: String(a), onclick: () => { if (ctx.state().f.locked) return; local.ant = a; draw(); send({ ant: a }); ctx.audio.sfx('switch'); } }));
  const tune = rotary({ label: 'Sintonía', value: 0, min: -1e6, max: 1e6, step: 1, fmt: () => '', big: true, sens: 0.35, onChange: (v) => {
    if (ctx.state().f.locked) return;
    const d = v - (tune._last || 0); tune._last = v;
    const [a, b] = BANDS[local.band];
    local.freq = Math.max(a, Math.min(b, Math.round((local.freq + d * 2.0) * 10) / 10));
    draw(); send({ freq: local.freq }); ctx.audio.sfx('knob');
  } });
  tune._last = 0;
  const fine = (d) => { if (ctx.state().f.locked) return; const [a, b] = BANDS[local.band]; local.freq = Math.max(a, Math.min(b, Math.round((local.freq + d) * 10) / 10)); draw(); send({ freq: local.freq }); ctx.audio.sfx('knob'); };
  const fineRow = h('div', { class: 'finebtns', style: { gridTemplateColumns: 'repeat(3, minmax(0,1fr))' } },
    ...[-100, -10, -1, 1, 10, 100].map(d => h('button', { text: (d > 0 ? '+' : '') + d + ' kHz', onclick: () => fine(d) })),
    ...[-0.1, 0.1].map(d => h('button', { text: (d > 0 ? '+' : '') + d.toFixed(1), onclick: () => fine(d) })));
  const nbBtn = h('button', { class: 'btn small', onclick: () => { local.nbOn = local.nbOn ? 0 : 1; draw(); send({ nbOn: local.nbOn }); ctx.audio.sfx('switch'); } });
  const nbP = rotary({ label: 'Pulsos', value: local.nbP, min: 1, max: 5, step: 1, sens: 0.06, fmt: v => String(v), onChange: (v) => { local.nbP = v; send({ nbP: v }); ctx.audio.sfx('knob'); } });
  const nbT = rotary({ label: 'Período', value: local.nbT, min: 5, max: 30, step: 1, sens: 0.12, fmt: v => v + ' s', onChange: (v) => { local.nbT = v; send({ nbT: v }); ctx.audio.sfx('knob'); } });
  const lockBtn = h('button', { class: 'btn', text: 'Enganchar portadora', onclick: () => { ctx.dispatch({ t: 'lock' }); ctx.audio.sfx('switch'); } });
  const lockNote = h('p', { class: 'fine' });
  const logBtn = h('button', { class: 'btn small ghost', text: 'Ver registro de escucha', onclick: () => ctx.openJournal('radio') });
  const el = h('div', { class: 'split' },
    h('div', { class: 'radio-face' },
      h('div', { class: 'dialwin' }, dial),
      counter,
      h('div', { class: 'grid2' }, h('div', { class: 'ctl' }, h('div', { class: 'lab', text: 'Banda' }), bandSeg), h('div', { class: 'ctl' }, h('div', { class: 'lab', text: 'Antena' }), antSeg)),
      h('div', { class: 'grid2', style: { alignItems: 'center' } }, tune.el, h('div', { class: 'ctl' }, h('div', { class: 'lab', text: 'Señal (S)' }), smeter))),
    fineRow,
    h('div', { class: 'scope' }, scope),
    status,
    h('div', { class: 'card', style: { display: 'grid', gap: '10px' } },
      h('div', { class: 'row', style: { alignItems: 'center' } }, h('div', { class: 'eyebrow', text: 'Supresor de ruido' }), nbBtn),
      h('div', { class: 'grid2' }, nbP.el, nbT.el)),
    h('div', { class: 'card', style: { display: 'grid', gap: '8px' } }, lockBtn, lockNote),
    logBtn);

  function drawDial() {
    const g = dial.getContext('2d'), w = dial.width, hh = dial.height;
    const [a, b] = BANDS[local.band];
    g.fillStyle = '#f6c06a'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#3a2410'; g.strokeStyle = '#3a2410';
    const ticks = 40;
    g.font = '18px "IBM Plex Mono", monospace'; g.textAlign = 'center';
    for (let i = 0; i <= ticks; i++) {
      const x = 20 + i * (w - 40) / ticks;
      g.lineWidth = i % 5 ? 1.5 : 3; g.beginPath(); g.moveTo(x, 18); g.lineTo(x, i % 5 ? 38 : 52); g.stroke();
      if (i % 5 === 0) g.fillText(((a + (b - a) * i / ticks) / 1000).toFixed(2), x, 78);
    }
    g.font = 'bold 16px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.fillText(local.band + ' · MHz', 20, 120);
    const x = 20 + (local.freq - a) / (b - a) * (w - 40);
    g.strokeStyle = '#b4180e'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, 6); g.lineTo(x, hh - 6); g.stroke();
  }
  function draw() {
    drawDial();
    counter.innerHTML = `${local.freq.toFixed(1)} <small>kHz</small>`;
    [...bandSeg.children].forEach(b => b.setAttribute('aria-pressed', b.dataset.v === local.band));
    [...antSeg.children].forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.v) === local.ant));
    nbBtn.textContent = local.nbOn ? 'Supresor: ENCENDIDO' : 'Supresor: apagado';
    nbBtn.className = 'btn small' + (local.nbOn ? ' primary' : '');
  }
  let lastState = s0;
  return {
    title: 'Receptor de onda media', el,
    update(s) {
      lastState = s;
      // no pisar lo que el jugador acaba de tocar mientras su cambio viaja al estado
      const fresh = Date.now() - editAt > 900;
      if (fresh && !tune.busy()) { local.band = s.rx.band; local.ant = s.rx.ant; local.freq = s.rx.freq; }
      if (fresh) local.nbOn = s.rx.nbOn;
      if (fresh && !nbP.busy()) { local.nbP = s.rx.nbP; nbP.set(s.rx.nbP); }
      if (fresh && !nbT.busy()) { local.nbT = s.rx.nbT; nbT.set(s.rx.nbT); }
      draw();
      const f = s.f;
      const sig = rxSignal(local, f.power);
      const clear = S.clearNow({ ...s, rx: { ...s.rx, ...local } });
      smeter.firstChild.style.width = Math.round(sig.prox * 100) + '%';
      let txt, cls = 'status';
      if (!f.power) { txt = 'Sin corriente.'; cls += ' bad'; }
      else if (f.locked) { txt = 'Portadora enganchada · 2182,0 kHz · voces claras'; cls += ' ok'; }
      else if (sig.kind === 'target' && sig.antOk) { txt = clear ? 'Voces claras · 2182,0 kHz' : 'Hay voces, pero las tapan ráfagas de ruido rítmicas'; cls += clear ? ' ok' : ''; }
      else if (sig.kind === 'near' && sig.prox > 0.25) txt = sig.antOk ? 'Voces lejanas... afina más' : 'Algo muy débil. La antena no lo capta bien';
      else if (sig.kind === 'decoy') txt = 'Una portadora sin voz';
      else txt = 'Ruido de fondo';
      status.textContent = txt; status.className = cls;
      lockBtn.disabled = !(f.tuned && !f.lamp && !f.locked);
      lockNote.textContent = f.locked ? 'El receptor mantiene la señal aunque vuelva el ruido.' : (f.tuned && !f.lamp ? 'Ahora la señal está limpia: puedes engancharla.' : 'Solo se puede enganchar una señal limpia.');
    },
    tick(t) {
      const g = scope.getContext('2d'), w = scope.width, hh = scope.height;
      g.fillStyle = 'rgba(4,17,13,.55)'; g.fillRect(0, 0, w, hh);
      const s = lastState, f = s.f;
      const sig = rxSignal(local, f.power);
      const interf = f.power && f.lamp && !(s.rx.nbOn && s.rx.nbP === 3 && s.rx.nbT === 15) && !f.locked && sig.prox > 0.2;
      const ph = t % 15;
      const burst = interf ? [0, 0.86, 1.72].some(c => ph >= c && ph < c + 0.22) : false;
      g.strokeStyle = '#7ff5cf'; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x < w; x += 3) {
        const n = (Math.random() - 0.5) * (6 + 30 * (1 - sig.prox)) * (f.power ? 1 : 0.1);
        const v = ctx.audio.radio && ctx.audio.radio.voice ? Math.sin(x * 0.09 + t * 30) * Math.sin(x * 0.013 + t * 3) * 28 * sig.prox : 0;
        const b = burst ? (Math.random() - 0.5) * 110 : 0;
        const y = hh / 2 + n + v + b;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      ctx.audio.setRadio({ power: f.power, prox: sig.prox, interference: interf, voice: ctx.audio.radio && ctx.audio.radio.voice });
    },
  };
};

PANELS.vhf = (ctx) => {
  const list = h('div', { class: 'doclist' });
  const act = h('div', { class: 'split' });
  const el = h('div', { class: 'split' },
    h('div', { class: 'radio-face', style: { background: '#1b1f22', color: '#cfe', boxShadow: 'none' } },
      h('div', { class: 'counter mono', style: { color: '#8fe0c9', background: '#04110d' }, html: 'CH 16 <small style="color:#5fb39a">156,800 MHz</small>' })),
    act, h('div', { class: 'eyebrow', text: 'Últimos mensajes en el canal 16' }), list);
  let danger = null, refuge = null;
  const DANGER = [['white2', 'La blanca de dos destellos'], ['white3', 'La blanca de tres destellos'], ['red_fixed', 'La roja fija'], ['red_flash', 'Una roja con destellos']];
  const REFUGE = [['to_white2', 'Hacia la blanca de dos destellos'], ['to_white3', 'Hacia la blanca de tres destellos'], ['between', 'Entre las dos luces blancas'], ['red', 'Hacia la roja']];
  return {
    title: 'VHF · canal 16', el,
    update(s) {
      const f = s.f;
      act.innerHTML = '';
      if (f.maree === 'calling') {
        act.append(h('p', { class: 'panel-note', text: 'Un velero pide ayuda en el canal 16.' }),
          h('button', { class: 'btn primary', text: 'Responder al Marée', onclick: () => { ctx.dispatch({ t: 'mareeAnswer' }); ctx.audio.sfx('click'); } }),
          h('button', { class: 'btn ghost', text: 'No podemos atenderles ahora', onclick: () => ctx.dispatch({ t: 'mareeDecline' }) }));
      } else if (f.maree === 'talking') {
        const dSel = h('div', { class: 'opt-grid' }, ...DANGER.map(([k, l]) => h('button', { class: 'opt', 'aria-pressed': danger === k, text: l, onclick: () => { danger = k; this.update(ctx.state()); } })));
        const rSel = h('div', { class: 'opt-grid' }, ...REFUGE.map(([k, l]) => h('button', { class: 'opt', 'aria-pressed': refuge === k, text: l, onclick: () => { refuge = k; this.update(ctx.state()); } })));
        act.append(h('p', { class: 'panel-note', text: 'Diles qué luz deben evitar y hacia dónde ir. Puedes repetir si se equivocan de idea.' }),
          h('div', { class: 'eyebrow', text: 'Peligro: ¿qué luz deben evitar?' }), dSel,
          h('div', { class: 'eyebrow', text: 'Refugio: ¿hacia dónde?' }), rSel,
          h('button', { class: 'btn primary', text: 'Transmitir', disabled: !(danger && refuge), onclick: () => { ctx.dispatch({ t: 'mareeReply', danger, refuge }); ctx.audio.sfx('click'); } }),
          h('button', { class: 'btn ghost', text: 'No podemos atenderles ahora', onclick: () => ctx.dispatch({ t: 'mareeDecline' }) }));
      } else if (f.maree === 'helped') act.append(h('div', { class: 'status ok', text: 'El Marée va hacia la Enseada da Lagoa.' }));
      else if (f.maree === 'declined') act.append(h('div', { class: 'status bad', text: 'Le dijiste al Marée que no podíais atenderle.' }));
      else act.append(h('div', { class: 'status', text: f.power ? 'Escucha en el canal 16.' : 'El VHF funciona con la reserva.' }));
      list.innerHTML = '';
      const heard = ctx.heard().filter(e => RADIO[e.id] && RADIO[e.id].ch === 'vhf').slice(-6).reverse();
      if (!heard.length) list.append(h('p', { class: 'fine', text: 'Nada todavía.' }));
      for (const e of heard) list.append(h('div', { class: 'tx-line' }, h('span', { class: 'who', text: RADIO[e.id].who }), ctx.subOf(e.id)));
    },
  };
};

PANELS.tx = (ctx) => {
  const s0 = ctx.state();
  const local = { ...s0.tx };
  let editAt = 0;
  const send0 = throttle((p) => ctx.dispatch({ t: 'tx', ...p }), 160);
  const send = (p) => { editAt = Date.now(); send0(p); };
  const warmBtn = h('button', { class: 'btn', onclick: () => { ctx.dispatch({ t: 'tx', warm: 1 }); ctx.audio.sfx('switch'); } });
  const warmBar = h('div', { class: 'meter' }, h('i'));
  const plate = h('div', { class: 'meter' }, h('i'));
  const antM = h('div', { class: 'meter' }, h('i'));
  const tune = rotary({ label: 'Sintonía', value: local.tune, min: 0, max: 100, step: 1, sens: 0.25, fmt: v => String(v), onChange: v => { local.tune = v; send({ tune: v }); ctx.audio.sfx('knob'); refresh(); } });
  const load = rotary({ label: 'Carga', value: local.load, min: 0, max: 100, step: 1, sens: 0.25, fmt: v => String(v), onChange: v => { local.load = v; send({ load: v }); ctx.audio.sfx('knob'); refresh(); } });
  const st = h('div', { class: 'status' });
  let type = 'adv', light = null;
  const hdg = h('input', { class: 'input mono', type: 'number', min: '0', max: '359', inputmode: 'numeric', placeholder: '000', 'aria-label': 'Rumbo en grados' });
  const lat = h('input', { class: 'input mono', type: 'text', inputmode: 'decimal', placeholder: '06,4', 'aria-label': 'Minutos de latitud' });
  const lon = h('input', { class: 'input mono', type: 'text', inputmode: 'decimal', placeholder: '14,1', 'aria-label': 'Minutos de longitud' });
  const msgArea = h('div', { class: 'split' });
  const msgSt = h('div', { class: 'status' });
  const tabs = h('div', { class: 'seg dark-seg' },
    h('button', { 'data-t': 'adv', text: 'Advertencia al Santa Ilia', onclick: () => { type = 'adv'; renderMsg(); } }),
    h('button', { 'data-t': 'resc', text: 'Posición a Fisterra Radio', onclick: () => { type = 'resc'; renderMsg(); } }));
  const LIGHTS = [['red_fixed', 'La roja fija'], ['red_flash', 'La roja con destellos'], ['white2', 'La blanca de dos destellos'], ['white3', 'La blanca de tres destellos']];
  function renderMsg() {
    [...tabs.children].forEach(b => b.setAttribute('aria-pressed', b.dataset.t === type));
    msgArea.innerHTML = '';
    if (type === 'adv') {
      msgArea.append(h('div', { class: 'eyebrow', text: 'Luz que NO deben seguir' }),
        h('div', { class: 'opt-grid' }, ...LIGHTS.map(([k, l]) => h('button', { class: 'opt', 'aria-pressed': light === k, text: l, onclick: () => { light = k; renderMsg(); } }))),
        h('div', { class: 'field' }, h('label', { text: 'Rumbo para ganar mar (grados verdaderos)' }), hdg));
    } else {
      msgArea.append(h('div', { class: 'field' }, h('label', { text: 'Latitud: 43° … minutos N' }), lat), h('div', { class: 'field' }, h('label', { text: 'Longitud: 009° … minutos W' }), lon));
    }
    msgArea.append(h('button', { class: 'btn primary', text: 'Preparar mensaje', onclick: prepare }));
  }
  function prepare() {
    if (type === 'adv') {
      const v = parseInt(hdg.value, 10);
      if (!light || isNaN(v) || v < 0 || v > 359) { msgSt.textContent = 'Falta la luz o el rumbo (0 a 359).'; msgSt.className = 'status bad'; return; }
      ctx.dispatch({ t: 'msg', type: 'adv', light, hdg: v });
    } else {
      const a = parseFloat(String(lat.value).replace(',', '.')), b = parseFloat(String(lon.value).replace(',', '.'));
      if (isNaN(a) || isNaN(b) || a < 0 || a >= 60 || b < 0 || b >= 60) { msgSt.textContent = 'Escribe los minutos, por ejemplo 06,4 y 14,1.'; msgSt.className = 'status bad'; return; }
      ctx.dispatch({ t: 'msg', type: 'resc', lat: 43 * 60 + a, lon: 9 * 60 + b });
    }
    ctx.audio.sfx('click');
  }
  function refresh() {
    const m = S.txMeters(local);
    const s = ctx.state();
    const warm = s.f.txWarm ? 1 : 0.3;
    plate.firstChild.style.width = Math.round(m.plate * 100 * warm) + '%';
    antM.firstChild.style.width = Math.round(m.ant * 100 * warm) + '%';
  }
  renderMsg();
  const el = h('div', { class: 'split' },
    h('p', { class: 'panel-note', text: 'Transmisor de 400 W para onda media. Su chapa repite lo del manual: necesita todo el banco de baterías.' }),
    h('div', { class: 'card', style: { display: 'grid', gap: '10px' } }, h('div', { class: 'row', style: { alignItems: 'center' } }, h('div', { class: 'eyebrow', text: 'Caldeo de válvulas' }), warmBtn), warmBar),
    h('div', { class: 'grid2' }, tune.el, load.el),
    h('div', { class: 'grid2' }, h('div', { class: 'ctl' }, h('div', { class: 'lab', text: 'Corriente de placa' }), plate), h('div', { class: 'ctl' }, h('div', { class: 'lab', text: 'Corriente de antena' }), antM)),
    st,
    h('div', { class: 'card', style: { display: 'grid', gap: '10px' } }, h('div', { class: 'eyebrow', text: 'Mensaje para 2182 kHz' }), tabs, msgArea, msgSt));
  return {
    title: 'Transmisor', el,
    update(s) {
      const f = s.f;
      const fresh = Date.now() - editAt > 900;
      if (fresh && !tune.busy()) { local.tune = s.tx.tune; tune.set(s.tx.tune); }
      if (fresh && !load.busy()) { local.load = s.tx.load; load.set(s.tx.load); }
      warmBtn.textContent = f.txWarmAt ? (f.txWarm ? 'Válvulas calientes' : 'Calentando…') : 'Encender caldeo';
      warmBtn.disabled = !!f.txWarmAt;
      refresh();
      const m = S.txMeters(local);
      st.textContent = !f.txWarm ? 'Válvulas frías.' : f.txTuned ? 'Sintonizado: placa al mínimo, antena al máximo.' : (m.tunedOk ? 'Sintonía correcta. Ajusta la carga.' : 'Busca el mínimo de la corriente de placa.');
      st.className = 'status' + (f.txTuned ? ' ok' : '');
      if (f.msg) {
        const why = { light: 'Esa luz no es la que les confunde.', laxe: 'Ese rumbo los lleva contra la Laxe das Viúvas.', bajos: 'Ese rumbo cruza unos bajos.', costa: 'Ese rumbo los lleva contra la costa.', tierra: 'Esa posición cae en tierra.', lejos: `Esa posición está a ${f.msg.dist} millas de donde se hundirán.` }[f.msg.why] || '';
        msgSt.textContent = f.msg.ok ? (f.msg.type === 'adv' ? `Mensaje listo: «No sigáis la roja fija. Ganad mar al ${String(f.msg.hdg).padStart(3, '0')}».` : `Mensaje listo: posición ${fmtLat(f.msg.lat)} ${fmtLon(f.msg.lon)}.`) : `No servirá: ${why}`;
        msgSt.className = 'status ' + (f.msg.ok ? 'ok' : 'bad');
      }
    },
    tick() { const s = ctx.state(); if (s.f.txWarmAt && !s.f.txWarm) { const p = Math.min(1, (ctx.now() - s.f.txWarmAt) / 8000); warmBar.firstChild.style.width = Math.round(p * 100) + '%'; if (p >= 1) ctx.dispatch({ t: 'tx' }); } else warmBar.firstChild.style.width = s.f.txWarm ? '100%' : '0%'; },
  };
};

PANELS.lamp = (ctx) => {
  const st = h('div', { class: 'status' });
  const btn = h('button', { class: 'btn' });
  const confirm = h('div', { class: 'confirm', hidden: true },
    h('p', { style: { margin: 0 }, text: 'El faro está en servicio. Hay barcos en la mar. ¿Apagar la linterna?' }),
    h('div', { class: 'row' }, h('button', { class: 'btn danger', text: 'Apagar', onclick: () => { confirm.hidden = true; ctx.dispatch({ t: 'lamp', on: 0 }); ctx.audio.sfx('switch'); } }), h('button', { class: 'btn ghost', text: 'Cancelar', onclick: () => { confirm.hidden = true; } })));
  btn.onclick = () => { const s = ctx.state(); if (s.f.lamp) confirm.hidden = false; else { ctx.dispatch({ t: 'lamp', on: 1 }); ctx.audio.sfx('switch'); } };
  const el = h('div', { class: 'split' }, h('p', { class: 'panel-note', text: 'Interruptor de la lámpara principal (1000 W), en el pedestal de la óptica.' }), st, btn, confirm);
  return { title: 'Linterna', el, update(s) { st.textContent = s.f.lamp ? 'Lámpara encendida · en servicio' : 'Lámpara APAGADA'; st.className = 'status ' + (s.f.lamp ? 'ok' : 'bad'); btn.textContent = s.f.lamp ? 'Apagar la linterna' : 'Encender la linterna'; } };
};

PANELS.gears = (ctx) => {
  const SET = [10, 15, 20, 30, 40, 45, 60];
  let slot = 'a';
  const out = h('div', { class: 'counter mono', style: { fontSize: '22px' } });
  const prev = h('canvas', { width: 600, height: 60, style: { width: '100%', background: '#0a0d10', borderRadius: '8px' } });
  const slots = h('div', { class: 'grid2' });
  const tray = h('div', { class: 'grid3' });
  const el = h('div', { class: 'split' },
    h('p', { class: 'panel-note', text: 'Relojería de pesas: el tambor gira a 12 vueltas por minuto. Elige el engranaje del tambor (motor) y el de la óptica (conducido).' }),
    slots, h('div', { class: 'eyebrow', text: 'Caja de engranajes (dientes)' }), tray, out, prev);
  let lastState = ctx.state();
  return {
    title: 'Relojería de rotación', el,
    update(s) {
      lastState = s;
      slots.innerHTML = '';
      for (const [k, l] of [['a', 'Tambor (motor)'], ['b', 'Óptica (conducido)']]) slots.append(h('button', { class: 'opt', 'aria-pressed': slot === k, onclick: () => { slot = k; this.update(ctx.state()); } }, h('div', { class: 'eyebrow', text: l }), h('div', { class: 'val', text: s.gears[k] ? `${s.gears[k]} dientes` : '—' })));
      tray.innerHTML = '';
      for (const n of SET) tray.append(h('button', { class: 'opt', style: { textAlign: 'center' }, text: String(n), onclick: () => { ctx.dispatch({ t: 'gears', [slot]: n }); ctx.audio.sfx('knob'); if (slot === 'a') slot = 'b'; } }));
      const rpm = S.opticRpm(s.gears.a, s.gears.b);
      out.textContent = rpm ? `Óptica: ${rpm.toFixed(2).replace(/\.00$/, '')} v/min · una vuelta cada ${(60 / rpm).toFixed(1)} s` : 'Óptica: sin engranar';
      out.style.color = s.f.gears ? '#63c58f' : '#ffcc6a';
    },
    tick(t) {
      const s = lastState, g = prev.getContext('2d'), rpm = S.opticRpm(s.gears.a, s.gears.b);
      g.fillStyle = '#0a0d10'; g.fillRect(0, 0, prev.width, prev.height);
      if (!rpm) return;
      const period = 60 / rpm;
      const ph = t % period;
      const sep = period * 0.36 / (2 * Math.PI);
      const on = [0, sep, 2 * sep].some(c => ph >= c && ph < c + Math.max(0.12, sep * 0.4));
      g.fillStyle = on ? '#ffe2a0' : '#2a2a2a'; g.beginPath(); g.arc(30, 30, 18, 0, 6.3); g.fill();
      g.fillStyle = '#98a1ab'; g.font = '16px "IBM Plex Mono", monospace'; g.fillText(`Destellos: grupo de 3 cada ${period.toFixed(1)} s`, 64, 36);
    },
  };
};

PANELS.kero = (ctx) => {
  const gauge = h('canvas', { width: 300, height: 170, style: { width: '100%', maxWidth: '300px', justifySelf: 'center' } });
  const pre = h('div', { class: 'meter' }, h('i'));
  const st = h('div', { class: 'status' });
  const btn = (t, op, cls = 'btn') => h('button', { class: cls, text: t, onclick: () => { ctx.dispatch({ t: 'kero', op }); ctx.audio.sfx(op === 'pump' ? 'pump' : op === 'ignite' ? 'ignite' : 'click'); } });
  const el = h('div', { class: 'split' },
    h('p', { class: 'panel-note', text: 'Lámpara de presión de queroseno en su brazo, lista para ponerse en el foco de la óptica.' }),
    gauge,
    h('div', { class: 'grid2' }, btn('Bombear', 'pump'), btn('Purgar', 'bleed', 'btn ghost')),
    h('div', { class: 'grid2' }, btn('Precalentar con alcohol', 'preheat'), btn('Abrir válvula', 'valve')),
    h('div', { class: 'ctl' }, h('div', { class: 'lab', text: 'Vaporizador' }), pre),
    btn('Encender', 'ignite', 'btn primary'),
    st);
  let lastFlares = ctx.state().f.keroFlares, lastState = ctx.state();
  function drawGauge(p) {
    const g = gauge.getContext('2d'), w = gauge.width, hh = gauge.height;
    g.clearRect(0, 0, w, hh);
    const cx = w / 2, cy = hh - 18, R = 120;
    g.lineWidth = 14; g.strokeStyle = '#2a2f35'; g.beginPath(); g.arc(cx, cy, R, Math.PI, 0); g.stroke();
    const ang = (v) => Math.PI + (v / 3.2) * Math.PI;
    g.strokeStyle = '#2f7a52'; g.beginPath(); g.arc(cx, cy, R, ang(1.75), ang(2.5)); g.stroke();
    g.fillStyle = '#98a1ab'; g.font = '14px "IBM Plex Mono", monospace'; g.textAlign = 'center';
    for (let v = 0; v <= 3; v++) g.fillText(String(v), cx + Math.cos(ang(v)) * (R - 28), cy + Math.sin(ang(v)) * (R - 28) + 5);
    g.strokeStyle = '#ffcc6a'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang(p)) * (R - 10), cy + Math.sin(ang(p)) * (R - 10)); g.stroke();
    g.fillStyle = '#ebe5d6'; g.font = '16px "IBM Plex Mono", monospace'; g.fillText(`${p.toFixed(2)} kg/cm²`, cx, cy - 34);
  }
  return {
    title: 'Reserva de queroseno', el,
    update(s) {
      lastState = s;
      const f = s.f;
      drawGauge(f.keroP);
      if (f.keroFlares > lastFlares) { lastFlares = f.keroFlares; ctx.audio.sfx('flare'); ctx.flashScreen && ctx.flashScreen(); }
      st.textContent = f.keroLit ? 'La reserva arde: luz blanca y firme.' : f.keroValve ? 'Válvula abierta. Falta encender.' : f.keroFlares && !f.keroPreAt ? '¡Llamarada! Se apagó el alcohol: hay que volver a precalentar.' : f.keroPreAt ? 'Precalentando el vaporizador…' : 'Fría.';
      st.className = 'status' + (f.keroLit ? ' ok' : (f.keroFlares && !f.keroPreAt ? ' bad' : ''));
    },
    tick() { const f = lastState.f; const p = f.keroPreAt ? Math.min(1, (ctx.now() - f.keroPreAt) / 8000) : 0; pre.firstChild.style.width = Math.round(p * 100) + '%'; },
  };
};

PANELS.kbox = (ctx) => {
  const area = h('div', { class: 'split' });
  const el = h('div', { class: 'split' }, h('p', { class: 'panel-note', text: 'Una caja de madera con letras de plantilla: CAIXA DA RESERVA. Huele a queroseno.' }), area);
  return {
    title: 'Caja de la reserva', el,
    update(s) {
      const f = s.f;
      area.innerHTML = '';
      area.append(h('p', { style: { margin: 0, lineHeight: 1.5 }, text: 'Dentro: dos latas de queroseno, alcohol de quemar, mechas y camisas de repuesto envueltas en papel de periódico.' }));
      if (f.page) area.append(h('button', { class: 'btn primary', text: 'Leer la hoja de Ramón', onclick: () => ctx.openDoc('page') }));
      else if (f.letter) area.append(h('p', { class: 'panel-note', text: 'El fondo suena hueco cuando lo golpeas.' }), h('button', { class: 'btn primary', text: 'Buscar en el doble fondo', onclick: () => { ctx.dispatch({ t: 'findPage' }); ctx.audio.sfx('paper'); setTimeout(() => ctx.openDoc('page'), 350); } }));
      else area.append(h('p', { class: 'fine', text: 'Nada más a simple vista.' }));
    },
  };
};

PANELS.switch = (ctx, arg) => {
  const remote = !!(arg && arg.remote);
  const area = h('div', { class: 'split' });
  const el = h('div', { class: 'split' }, area);
  let pending = null;
  return {
    title: remote ? 'O luz o voz · votación' : 'Cuadro de baterías', el,
    update(s) {
      const f = s.f;
      area.innerHTML = '';
      area.append(h('p', { class: 'panel-note', text: remote ? 'Por el interfono del faro: el equipo vota y la palanca de la sala de baterías se acciona cuando hay mayoría.' : 'Banco de 48 V. Cuatro amperímetros, tres seccionadores de cuchilla y una tapa de servicio atornillada.' }));
      if (!f.cover) {
        if (!f.pageRead) { area.append(h('p', { style: { margin: 0, lineHeight: 1.5 }, text: 'La tapa tiene una etiqueta: «Sin uso desde 1998». Nada indica que haya algo detrás.' })); return; }
        area.append(h('p', { style: { margin: 0, lineHeight: 1.5 }, text: 'Según el boceto de Ramón, su conmutador está detrás de esta tapa.' }),
          h('button', { class: 'btn primary', text: 'Retirar la tapa', onclick: () => { ctx.dispatch({ t: 'cover' }); ctx.audio.sfx('lever'); } }));
        return;
      }
      const r = S.readiness(s);
      const votes = s.votes || {};
      const n = Object.values(s.players || {}).filter(p => !p.away).length;
      const myVote = votes[ctx.me];
      const tally = { luz: Object.values(votes).filter(v => v === 'luz').length, voz: Object.values(votes).filter(v => v === 'voz').length };
      const knob = h('div', { class: 'lever-knob' });
      const track = h('div', { class: 'lever-track', role: 'slider', 'aria-label': 'Palanca O LUZ OU VOZ', tabindex: '0' }, knob);
      const sideL = h('div', { class: 'lever-side' }, h('h4', { text: 'LUZ' }), h('ul', { class: 'checklist' }, h('li', { class: f.gears ? 'ok' : '', text: 'Relojería ajustada' }), h('li', { class: f.keroLit ? 'ok' : '', text: 'Reserva encendida' })));
      const sideR = h('div', { class: 'lever-side' }, h('h4', { text: 'VOZ' }), h('ul', { class: 'checklist' }, h('li', { class: f.txWarm && f.txTuned ? 'ok' : '', text: 'Transmisor sintonizado' }), h('li', { class: f.msg && f.msg.ok ? 'ok' : '', text: f.msg && f.msg.ok ? (f.msg.type === 'adv' ? 'Advertencia preparada' : 'Posición preparada') : 'Mensaje preparado' })));
      area.append(h('div', { class: 'doc', style: { textAlign: 'center', padding: '10px' } }, h('div', { class: 'head', style: { fontSize: '22px', margin: 0 }, text: 'O LUZ · OU VOZ' }), h('div', { text: 'NUNCA AS DÚAS · R. B. 1979' })));
      area.append(h('div', { class: 'lever-ui' }, sideL, track, sideR));
      const choose = (c) => {
        if (s.f.sw) return;
        if (c === 'luz' && !r.luz) { ctx.toast('La palanca no engrana: la reserva no está lista (relojería y queroseno).'); ctx.audio.sfx('err'); return; }
        if (c === 'voz' && !r.voz) { ctx.toast('La palanca no engrana: el transmisor o el mensaje no están listos.'); ctx.audio.sfx('err'); return; }
        if (ctx.isCoop && n > 1) {
          if (myVote !== c) ctx.dispatch({ t: 'vote', choice: c });
          const v2 = { ...votes, [ctx.me]: c };
          const agree = Object.values(v2).filter(v => v === c).length;
          const radioPid = Object.entries(s.players).find(([pid, p]) => (p.r || []).includes('radio'));
          const tieOk = agree * 2 === n && radioPid && v2[radioPid[0]] === c;
          if (!(agree * 2 > n || tieOk)) { ctx.toast(`Has votado ${c.toUpperCase()}. Falta la mayoría del equipo (en empate decide quien tiene la Radio).`); return; }
        }
        pending = c; this.update(ctx.state());
      };
      drag(track, { onMove: (dx, dy, tx, ty) => { knob.style.transition = 'none'; knob.style.top = Math.max(0, Math.min(162, 81 + ty)) + 'px'; }, onEnd: (tx, ty) => { knob.style.transition = ''; knob.style.top = '81px'; if (ty < -55) choose('luz'); else if (ty > 55) choose('voz'); } });
      area.append(h('div', { class: 'grid2' }, h('button', { class: 'btn', text: remote ? 'Votar LUZ' : 'Subir a LUZ', onclick: () => choose('luz') }), h('button', { class: 'btn', text: remote ? 'Votar VOZ' : 'Bajar a VOZ', onclick: () => choose('voz') })));
      if (ctx.isCoop && n > 1) area.append(h('p', { class: 'fine', text: `Votos: LUZ ${tally.luz} · VOZ ${tally.voz} de ${n}. Tu voto: ${myVote ? myVote.toUpperCase() : '—'}.` }));
      if (pending) {
        area.append(h('div', { class: 'confirm' },
          h('p', { style: { margin: 0 }, text: pending === 'luz' ? 'Mantendrás la luz con la reserva y no transmitirás nada. No se puede deshacer.' : 'Transmitirás a 1996 y la linterna se apagará mientras hablas. No se puede deshacer.' }),
          h('div', { class: 'row' }, h('button', { class: 'btn danger', text: pending === 'luz' ? 'Mantener la luz' : 'Transmitir', onclick: () => { ctx.dispatch({ t: 'switch', choice: pending }); ctx.audio.sfx('lever'); pending = null; } }), h('button', { class: 'btn ghost', text: 'Esperar', onclick: () => { pending = null; this.update(ctx.state()); } }))));
      }
    },
  };
};

PANELS.chart = (ctx) => {
  let probe = null, zoom = 1, origin = 'FN', bearing = 0;
  const wrap = h('div', { class: 'chart-wrap scroll', style: { overflow: 'auto', maxHeight: '58vh' } });
  const inner = h('div', {});
  wrap.appendChild(inner);
  const readout = h('div', { class: 'coord' });
  const bIn = h('input', { class: 'input mono', type: 'number', min: '0', max: '359', value: '0', inputmode: 'numeric', 'aria-label': 'Demora en grados', style: { textAlign: 'center' } });
  bIn.addEventListener('input', () => { bearing = Math.max(0, Math.min(359, parseInt(bIn.value || '0', 10) || 0)); });
  const oSeg = h('div', { class: 'seg dark-seg' }, ...Object.entries(chartOrigins()).map(([k, l]) => h('button', { 'data-o': k, text: l, onclick: () => { origin = k; mark(); } })));
  const mark = () => [...oSeg.children].forEach(b => b.setAttribute('aria-pressed', b.dataset.o === origin));
  const bump = (d) => { bearing = ((parseInt(bIn.value || '0', 10) || 0) + d + 360) % 360; bIn.value = bearing; };
  const el = h('div', { class: 'split' },
    h('div', { class: 'row', style: { alignItems: 'center' } }, h('div', { class: 'eyebrow', text: 'Toca la carta para leer coordenadas' }),
      h('div', { class: 'row', style: { flex: '0 0 auto', gap: '6px' } }, h('button', { class: 'btn small', text: '−', 'aria-label': 'Alejar', onclick: () => { zoom = Math.max(1, zoom - 0.5); paint(); } }), h('button', { class: 'btn small', text: '+', 'aria-label': 'Acercar', onclick: () => { zoom = Math.min(3, zoom + 0.5); paint(); } }))),
    wrap, readout,
    h('div', { class: 'card', style: { display: 'grid', gap: '10px' } },
      h('div', { class: 'eyebrow', text: 'Trazar una demora desde…' }), oSeg,
      h('div', { class: 'grid3', style: { alignItems: 'center' } }, h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn small', text: '−10', onclick: () => bump(-10) }), h('button', { class: 'btn small', text: '−1', onclick: () => bump(-1) })), bIn, h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn small', text: '+1', onclick: () => bump(1) }), h('button', { class: 'btn small', text: '+10', onclick: () => bump(10) }))),
      h('div', { class: 'grid2' }, h('button', { class: 'btn primary', text: 'Trazar', onclick: () => { ctx.dispatch({ t: 'chart', o: origin, b: bearing }); ctx.audio.sfx('paper'); } }), h('button', { class: 'btn ghost', text: 'Borrar líneas', onclick: () => ctx.dispatch({ t: 'chart', clear: 1 }) }))),
    h('button', { class: 'btn small ghost', text: 'Abrir el Libro de Faros', onclick: () => ctx.openDoc('libro') }));
  mark();
  let lastLines = null;
  function paint() {
    const s = ctx.state();
    const { svg } = chartSVG(s.chart, { probe });
    inner.innerHTML = svg;
    inner.style.width = (zoom * 100) + '%';
    const svgEl = inner.querySelector('svg');
    svgEl.addEventListener('click', (e) => {
      const r = svgEl.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * CW, py = (e.clientY - r.top) / r.height * CH;
      probe = { x: ux(px), y: uy(py) };
      const ll = toLatLon(probe.x, probe.y);
      readout.textContent = `Punto marcado: ${fmtLat(ll.lat)} ${fmtLon(ll.lon)}`;
      paint();
    });
  }
  return {
    title: 'Carta 412', el,
    update(s) { const key = JSON.stringify(s.chart); if (key !== lastLines) { lastLines = key; paint(); } },
  };
};

PANELS.doc = (ctx, id) => {
  const el = renderDoc(id, ctx);
  ctx.markDoc(id);
  if (id === 'dossier' && !ctx.state().f.letter) ctx.dispatch({ t: 'read', doc: 'dossier' });
  if (id === 'page') ctx.dispatch({ t: 'read', doc: 'page' });
  ctx.audio.sfx('paper');
  return { title: DOCS[id] ? DOCS[id].title : 'Documento', el };
};

PANELS.inspect = (ctx, arg) => ({ title: arg.title, el: h('div', { class: 'split' }, ...arg.lines.map(t => typeof t === 'string' ? h('p', { style: { margin: 0, lineHeight: 1.55 }, text: t }) : t), ...(arg.actions || []).map(a => h('button', { class: 'btn ' + (a.primary ? 'primary' : ''), text: a.label, onclick: a.fn }))) });

PANELS.cork = (ctx) => ({
  title: 'Tablón de corcho',
  el: h('div', { class: 'doclist' },
    h('p', { class: 'panel-note', text: 'Tres cosas clavadas con chinchetas.' }),
    h('button', { text: 'Recorte de periódico (1996)', onclick: () => ctx.openDoc('clipping') }),
    h('button', { text: 'Foto de un pesquero', onclick: () => ctx.openDoc('photo') }),
    h('button', { text: 'Tarjeta de frecuencias de socorro', onclick: () => ctx.openDoc('freqcard') })),
});

PANELS.journal = (ctx, tab = 'obj') => {
  const tabs = h('div', { class: 'tabs' });
  const body = h('div', { class: 'split' });
  const TABS = [['obj', 'Objetivos'], ['docs', 'Documentos'], ['radio', 'Radio'], ['call', 'Llamada']];
  let cur = tab;
  const render = () => {
    tabs.innerHTML = '';
    for (const [k, l] of TABS) tabs.append(h('button', { 'aria-pressed': cur === k, text: l, onclick: () => { cur = k; render(); } }));
    body.innerHTML = '';
    const s = ctx.state();
    if (cur === 'obj') {
      const objs = S.objectives(s);
      body.append(h('ul', { class: 'checklist' }, ...objs.map(o => h('li', { text: OBJECTIVES[o] }))));
      body.append(h('p', { class: 'fine', text: `Hora en el faro: ${ctx.clockText()}. A las 23:52 llega la pleamar.` }));
    } else if (cur === 'docs') {
      const seen = ctx.seenDocs();
      if (!seen.length) body.append(h('p', { class: 'fine', text: 'Aún no has leído nada.' }));
      body.append(h('div', { class: 'doclist' }, ...seen.map(id => h('button', { text: DOCS[id].title, onclick: () => ctx.openDoc(id) }))));
    } else if (cur === 'radio') {
      const heard = ctx.heard();
      if (!heard.length) body.append(h('p', { class: 'fine', text: 'No has oído nada todavía.' }));
      for (const e of heard) body.append(h('div', { class: 'tx-line' }, h('span', { class: 'who', text: (RADIO[e.id] || {}).who || '' }), ctx.subOf(e.id)));
    } else {
      const c = ctx.callLog();
      if (!c) body.append(h('p', { class: 'fine', text: 'Sin llamadas.' }));
      else {
        body.append(h('p', { class: 'fine', text: c.missed ? (c.cut ? 'Llamada cortada · mensaje de voz guardado' : 'Llamada perdida · mensaje de voz guardado') : c.voicemail ? 'Mensaje de voz de «Faro Cabo Néboa»' : 'Llamada de «Faro Cabo Néboa»' }));
        if (c.missed || c.voicemail) body.append(h('button', { class: 'btn' + (c.missed ? ' primary' : ''), text: c.missed ? 'Escuchar el mensaje de voz' : 'Volver a escuchar el mensaje', onclick: () => ctx.playVoicemail() }));
        for (const line of c.lines) body.append(h('div', { class: 'tx-line', text: line }));
      }
    }
  };
  render();
  return { title: 'Cuaderno', el: h('div', { class: 'split' }, tabs, body), update: () => render() };
};

PANELS.hints = (ctx) => {
  const body = h('div', { class: 'split' });
  const render = () => {
    body.innerHTML = '';
    const s = ctx.state();
    const objs = S.objectives(s);
    body.append(h('p', { class: 'panel-note', text: 'Las pistas avanzan de una en una: orientación, ayuda concreta y, si la pides, la solución (resta 1:00 al reloj).' }));
    for (const o of objs) {
      const lvl = s.hints[o] || 0;
      const box = h('div', { class: 'hintbox' }, h('div', { class: 'eyebrow', text: OBJECTIVES[o] }));
      for (let i = 0; i < lvl; i++) box.append(h('p', { text: HINTS[o][i] }));
      if (lvl < 3) box.append(h('button', { class: 'btn small' + (lvl === 2 ? ' danger' : ''), text: lvl === 0 ? 'Darme una orientación' : lvl === 1 ? 'Ayuda más concreta' : 'Ver la solución (−1:00)', onclick: () => { ctx.dispatch({ t: 'hint', obj: o, level: lvl + 1 }); setTimeout(render, 120); } }));
      body.append(box);
    }
    if (!objs.length) body.append(h('p', { class: 'fine', text: 'No hay objetivos abiertos ahora mismo.' }));
  };
  render();
  return { title: 'Pistas', el: body, update: render };
};

PANELS.chat = (ctx) => {
  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const inp = h('input', { class: 'input', placeholder: 'Escribe al equipo…', maxlength: '200', 'aria-label': 'Mensaje' });
  const send = (t) => { if (!t.trim()) return; ctx.dispatch({ t: 'chat', text: t }); inp.value = ''; };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(inp.value); });
  const quick = h('div', { class: 'quick' }, ...['¿Qué ves tú?', 'Te leo lo que tengo', 'Necesito un número', '¡Ya está!', 'Espera, estoy en ello'].map(q => h('button', { text: q, onclick: () => send(q) })));
  const players = h('div', { class: 'fine' });
  const el = h('div', { class: 'split' }, players, log, quick, h('div', { class: 'row' }, inp, h('button', { class: 'btn primary', style: { flex: '0 0 auto' }, text: 'Enviar', onclick: () => send(inp.value) })));
  return {
    title: 'Equipo', el,
    update(s) {
      players.textContent = Object.values(s.players || {}).map(p => `${p.n}${p.away ? ' (desconectado)' : ''}: ${(p.r || []).map(r => ROLES[r].name).join(', ') || '—'}`).join(' · ');
      log.innerHTML = '';
      for (const m of s.chat || []) log.append(h('div', { class: 'm' }, h('b', { text: m.n + ': ' }), m.x));
      log.scrollTop = log.scrollHeight;
    },
  };
};

// ---------------------------------------------------------------- documentos
export function renderDoc(id, ctx) {
  const d = DOCS[id];
  if (!d) return h('p', { text: '—' });
  const name = (ctx && ctx.myName && ctx.myName()) || '—';
  const P = (t) => h('p', { text: t.replace('{NAME}', name) });
  switch (d.type) {
    case 'newspaper': return h('div', { class: 'doc' }, h('div', { class: 'eyebrow', style: { color: '#5a5040' }, text: 'El Eco de Fisterra · martes, 12 de noviembre de 1996' }), h('div', { class: 'head', text: d.headline }), ...d.body.map(P));
    case 'card': return h('div', { class: 'doc' }, h('h4', { text: 'FRECUENCIAS DE SOCORRO' }), h('table', {}, ...d.rows.map(([a, b]) => h('tr', {}, h('td', { class: 'mono', text: a }), h('td', { text: b })))), h('p', { class: 'legend', text: d.foot }));
    case 'manual': return h('div', { class: 'doc typed' }, h('h4', { text: d.title }), ...d.sections.flatMap(s => [h('p', { style: { fontWeight: 700, marginTop: '1em' }, text: s.h }), ...s.p.map(P)]));
    case 'table': return h('div', { class: 'doc' }, h('h4', { text: d.title }), h('table', {}, h('tr', {}, ...d.head.map(x => h('th', { text: x }))), ...d.rows.map(r => h('tr', {}, ...r.map(x => h('td', { text: x }))))), h('p', { class: 'legend', text: d.legend }));
    case 'dossier': return h('div', { class: 'split' }, h('div', { class: 'doc typed' }, h('h4', { text: d.title }), ...d.body.map(P)), h('div', { class: 'doc hand' }, h('h4', { text: d.attachment.title }), ...d.attachment.body.map(P)));
    case 'logpage': return h('div', { class: 'doc hand' }, h('h4', { text: d.title }), ...d.lines.map(([t, x]) => h('div', { class: 'logline' }, h('b', { text: t }), h('span', { text: x }))), h('div', { class: 'margin', text: d.margin }), h('p', { style: { marginTop: '12px', fontStyle: 'italic' }, text: d.sketch }));
    case 'drawing': return h('div', { class: 'doc hand' }, ...d.body.map(P));
    case 'photo': return h('div', { class: 'doc' }, ...d.body.map(P));
    default: return h('div', { class: 'doc' }, h('h4', { text: d.title }), ...d.body.map(P));
  }
}
