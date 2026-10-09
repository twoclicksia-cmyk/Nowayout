// Estado compartido de la partida y reductor puro (lo ejecuta el anfitrión; en solitario, el propio jugador).
import { ROOM, RADIO, defaultRoleSplit } from './content.js';
import { crossDone, headingVerdict, rescueVerdict } from './nav.js';

export const T = { // momentos del director (ms desde el inicio)
  bulletin: 75_000,
  surge: 10 * 60_000,
  andres4: 12 * 60_000,
  grilo2: 13 * 60_000 + 50_000,
};
export const PENALTY_MS = 60_000;

export function newGame({ players = {}, host = null, now = Date.now() } = {}) {
  return {
    v: 1,
    phase: 'play',
    t0: now,
    pen: 0,
    rev: 0,
    f: {
      power: 0, tuned: 0, clear: 0, locked: 0,
      lamp: 1, lampOffMs: 0, lampOffAt: 0, lampOffs: 0, lampReact: 0,
      mayday: 0, call: 'none', callAt: 0, callEnded: 0,
      df: 0, cross: 0, bulletin: 0, surge: 0, andres4: 0, grilo2: 0,
      maree: 'none', mareeAt: 0, mareeTries: 0, mareeAgain: 0, mareeOkAt: 0, mareeSafe: 0,
      letter: 0, page: 0, pageRead: 0, cover: 0,
      gears: 0, keroP: 0, keroPre: 0, keroPreAt: 0, keroValve: 0, keroLit: 0, keroFlares: 0,
      txWarm: 0, txWarmAt: 0, txTuned: 0, msg: null,
      sw: null, ending: null, endAt: 0,
    },
    rx: { band: 'LW', ant: 1, freq: 1650.0, nbOn: 0, nbP: 1, nbT: 5 },
    tx: { tune: 18, load: 75 },
    gears: { a: null, b: null },
    chart: [],
    log: [],
    pend: [],
    hints: {},
    votes: {},
    chat: [],
    st: { rx: 0, chart: 0, cr: {}, tm: {} }, // estadísticas de la guardia: contadores, quién hizo qué y cuándo
    players,
    host,
  };
}

// hitos medibles (para el parte final y un futuro ranking)
const MILESTONES = {
  power: (x) => x.f.power, tune: (x) => x.f.tuned, clear: (x) => x.f.clear, call: (x) => x.f.call === 'active',
  cross: (x) => x.f.cross, maree: (x) => x.f.maree === 'helped', letter: (x) => x.f.letter, page: (x) => x.f.page,
  cover: (x) => x.f.cover, gears: (x) => x.f.gears, kero: (x) => x.f.keroLit, tx: (x) => x.f.txTuned,
  msg: (x) => !!(x.f.msg && x.f.msg.ok), sw: (x) => !!x.f.sw,
};

export function elapsed(s, now) {
  return Math.max(0, now - s.t0 + s.pen);
}
export function remaining(s, now) {
  return Math.max(0, ROOM.durationMs - elapsed(s, now));
}
export function worldClock(s, now) {
  const e = elapsed(s, now) / 1000;
  const base = ROOM.startClock.h * 3600 + ROOM.startClock.m * 60;
  const t = base + e;
  return { h: Math.floor(t / 3600) % 24, m: Math.floor(t / 60) % 60, s: Math.floor(t) % 60 };
}

function push(s, id, now, delay = 0) {
  const ch = RADIO[id] ? RADIO[id].ch : 'vhf';
  if (ch === 'mf' && !clearNow(s)) { s.pend.push({ id, d: delay }); return; }
  s.log.push({ id, t: now + delay });
}
function flushPending(s, now) {
  if (!s.pend.length || !clearNow(s)) return;
  let base = 0;
  for (const p of s.pend) { s.log.push({ id: p.id, t: now + 600 + base }); base += 9000; }
  s.pend = [];
}

function recomputeRx(s) {
  const r = s.rx;
  const tuned = r.band === 'MF' && r.ant === 2 && Math.abs(r.freq - 2182) <= 0.6;
  s.f.tuned = tuned ? 1 : 0;
  const blanker = r.nbOn && r.nbP === 3 && r.nbT === 15;
  const clearNow = tuned && (s.f.locked || blanker || !s.f.lamp);
  if (clearNow && !s.f.clear && (s.f.locked || blanker)) s.f.clear = 1;
  return clearNow;
}

export function clearNow(s) {
  const r = s.rx;
  const tuned = r.band === 'MF' && r.ant === 2 && Math.abs(r.freq - 2182) <= 0.6;
  const blanker = r.nbOn && r.nbP === 3 && r.nbT === 15;
  return tuned && (s.f.locked || blanker || !s.f.lamp);
}

// Puntúa la relojería: devuelve vueltas/min de la óptica
export function opticRpm(a, b) {
  if (!a || !b) return 0;
  return 12 * a / b;
}

// Sintonía del transmisor: corriente de placa (mínimo en tune≈63) y de antena (máximo con load≈41 si sintonía buena)
export function txMeters(tx) {
  const dip = Math.abs(tx.tune - 63);
  const plate = Math.min(1, 0.18 + dip / 40);
  const tunedOk = dip <= 3;
  const ant = tunedOk ? Math.max(0, 1 - Math.abs(tx.load - 41) / 25) : Math.max(0, 0.35 - dip / 120);
  return { plate, ant, tunedOk, loadOk: tunedOk && Math.abs(tx.load - 41) <= 3 };
}

export function readiness(s) {
  const f = s.f;
  return {
    luz: !!(f.gears && f.keroLit),
    voz: !!(f.txWarm && f.txTuned && f.msg && f.msg.ok),
  };
}

export function computeEnding(s) {
  const f = s.f;
  const lampOffEarly = f.lampOffMs > 1500 || f.lampOffs > 0;
  let marée;
  if (f.maree === 'helped') marée = 'helped';
  else if (f.ending === 'luz') marée = 'luzSafe';
  else if (f.ending === 'fail') marée = lampOffEarly ? 'darkWorse' : 'dark';
  else marée = lampOffEarly ? 'darkWorse' : 'dark';
  return { ending: f.ending, maree: marée, lampOffEarly };
}

// ---------------------------------------------------------------- reductor
export function reduce(s0, a, now = Date.now()) {
  const s = structuredClone(s0);
  const f = s.f;
  if (s.phase !== 'play' && !['chat', 'join', 'leave', 'roles'].includes(a.t)) return s0;
  switch (a.t) {
    case 'power':
      f.power = a.on ? 1 : 0;
      break;
    case 'rx': {
      if (f.locked) break; // la portadora enganchada fija el receptor
      for (const k of ['band', 'ant', 'freq', 'nbOn', 'nbP', 'nbT']) if (a[k] !== undefined) s.rx[k] = a[k];
      if (typeof s.rx.freq === 'number') s.rx.freq = Math.round(s.rx.freq * 10) / 10;
      recomputeRx(s);
      if (clearNow(s) && !f.mayday) startMayday(s, now);
      flushPending(s, now);
      break;
    }
    case 'lock':
      if (f.tuned && !f.lamp) {
        f.locked = 1; f.clear = 1;
        if (!f.mayday) startMayday(s, now);
        flushPending(s, now);
      }
      break;
    case 'lamp': {
      const on = a.on ? 1 : 0;
      if (on === f.lamp) break;
      f.lamp = on;
      if (!on) {
        f.lampOffAt = now; f.lampOffs++;
        if (f.tuned && f.lampReact < 1) { s.log.push({ id: 'r96_xose_off', t: now + 1200 }); s.log.push({ id: 'r96_andres_off', t: now + 4200 }); f.lampReact = 1; }
        if (f.maree === 'none') { f.maree = 'calling'; f.mareeAt = now; push(s, 'vhf_maree_off', now, 2500); }
      } else {
        if (f.lampOffAt) f.lampOffMs += now - f.lampOffAt;
        f.lampOffAt = 0;
        if (f.tuned && f.lampReact === 1) { s.log.push({ id: 'r96_xose_on', t: now + 900 }); s.log.push({ id: 'r96_andres_on', t: now + 3000 }); f.lampReact = 2; }
      }
      recomputeRx(s);
      if (clearNow(s) && !f.mayday) startMayday(s, now);
      flushPending(s, now);
      break;
    }
    case 'callEnd':
      if (f.call === 'ringing' || f.call === 'active') {
        f.call = 'done'; f.callEnded = now;
        if (!f.df) { f.df = 1; push(s, 'r96_fisterra2', now, 4000); push(s, 'r96_andres2', now, 19000); }
      }
      break;
    case 'callActive':
      if (f.call === 'ringing') f.call = 'active';
      break;
    case 'chart': {
      if (a.clear) s.chart = [];
      else if (typeof a.b === 'number' && ['FN', 'PI', 'MF', 'C'].includes(a.o)) {
        s.chart = s.chart.filter(l => l.o !== a.o).concat([{ o: a.o, b: ((Math.round(a.b) % 360) + 360) % 360 }]).slice(-4);
      }
      if (!f.cross && crossDone(s.chart)) {
        f.cross = 1;
        if (f.mayday) { push(s, 'r96_xose1', now, 2500); push(s, 'r96_andres3', now, 5500); }
      }
      break;
    }
    case 'mareeAnswer':
      if (f.maree === 'calling') { f.maree = 'talking'; push(s, 'vhf_maree2', now, 800); }
      break;
    case 'mareeReply': {
      if (f.maree !== 'talking') break;
      f.mareeTries++;
      const okDanger = a.danger === 'red_fixed';
      const okRefuge = a.refuge === 'between';
      if (okDanger && okRefuge) { f.maree = 'helped'; f.mareeOkAt = now; push(s, 'vhf_maree_ok', now, 900); }
      else if (a.refuge === 'red' || !okDanger) push(s, 'vhf_maree_wrong_red', now, 900);
      else push(s, 'vhf_maree_wrong_white', now, 900);
      break;
    }
    case 'mareeDecline':
      if (f.maree === 'calling' || f.maree === 'talking') { f.maree = 'declined'; push(s, 'vhf_maree_declined', now, 900); }
      break;
    case 'read':
      if (a.doc === 'dossier') f.letter = 1;
      if (a.doc === 'page' && f.page) f.pageRead = 1;
      break;
    case 'findPage':
      if (f.letter) f.page = 1;
      break;
    case 'cover':
      if (f.pageRead) f.cover = 1;
      break;
    case 'gears':
      s.gears = { a: a.a ?? s.gears.a, b: a.b ?? s.gears.b };
      f.gears = opticRpm(s.gears.a, s.gears.b) === 4 ? 1 : 0;
      break;
    case 'kero': {
      if (f.keroLit && a.op !== 'close') break;
      if (a.op === 'pump') f.keroP = Math.min(3.2, Math.round((f.keroP + 0.25) * 100) / 100);
      if (a.op === 'bleed') f.keroP = Math.max(0, Math.round((f.keroP - 0.25) * 100) / 100);
      if (a.op === 'preheat' && !f.keroPreAt) f.keroPreAt = now;
      if (a.op === 'valve') {
        const hot = f.keroPreAt && now - f.keroPreAt >= 8000;
        if (!hot) { f.keroFlares++; f.keroPreAt = 0; f.keroP = Math.max(0, f.keroP - 0.75); f.keroValve = 0; }
        else f.keroValve = 1;
      }
      if (a.op === 'ignite') {
        if (f.keroValve && f.keroP >= 1.75 && f.keroP <= 2.5) f.keroLit = 1;
      }
      if (a.op === 'close') { f.keroValve = 0; f.keroLit = 0; }
      break;
    }
    case 'tx': {
      if (a.warm && !f.txWarmAt) f.txWarmAt = now;
      if (typeof a.tune === 'number') s.tx.tune = Math.max(0, Math.min(100, a.tune));
      if (typeof a.load === 'number') s.tx.load = Math.max(0, Math.min(100, a.load));
      if (f.txWarmAt && now - f.txWarmAt >= 8000) f.txWarm = 1;
      const m = txMeters(s.tx);
      f.txTuned = f.txWarm && m.loadOk ? 1 : 0;
      break;
    }
    case 'msg': {
      let ok = false, why = '';
      if (a.type === 'adv') {
        const v = headingVerdict(a.hdg);
        ok = a.light === 'red_fixed' && v.ok;
        why = a.light !== 'red_fixed' ? 'light' : (v.ok ? '' : v.why);
        f.msg = { type: 'adv', light: a.light, hdg: a.hdg, ok, why };
      } else if (a.type === 'resc') {
        const v = rescueVerdict(a.lat, a.lon);
        ok = v.ok; why = v.onLand ? 'tierra' : (v.ok ? '' : 'lejos');
        f.msg = { type: 'resc', lat: a.lat, lon: a.lon, ok, why, dist: Math.round(v.dist * 10) / 10 };
      }
      break;
    }
    case 'vote':
      if (a.pid && (a.choice === 'luz' || a.choice === 'voz' || a.choice === null)) {
        if (a.choice === null) delete s.votes[a.pid]; else s.votes[a.pid] = a.choice;
      }
      break;
    case 'switch': {
      if (!f.cover || f.sw) break;
      // en cooperativo decide la mayoría (en empate, quien lleva la Radio)
      const active = Object.entries(s.players || {}).filter(([, p]) => !p.away);
      if (active.length > 1) {
        const agree = active.filter(([pid]) => s.votes[pid] === a.choice).length;
        const radio = active.find(([, p]) => (p.r || []).includes('radio'));
        const ok = agree * 2 > active.length || (agree * 2 === active.length && radio && s.votes[radio[0]] === a.choice);
        if (!ok) break;
      }
      const r = readiness(s);
      if (a.choice === 'luz' && r.luz) { f.sw = 'luz'; f.ending = 'luz'; }
      else if (a.choice === 'voz' && r.voz) { f.sw = 'voz'; f.ending = f.msg.type; }
      else break;
      if (!f.lamp && f.lampOffAt) { f.lampOffMs += now - f.lampOffAt; f.lampOffAt = 0; }
      f.endAt = now; s.phase = 'ending';
      break;
    }
    case 'hint': {
      const cur = s.hints[a.obj] || 0;
      if (a.level === cur + 1 && a.level <= 3) {
        s.hints[a.obj] = a.level;
        if (a.level === 3) s.pen += PENALTY_MS;
      }
      break;
    }
    case 'chat':
      if (typeof a.text === 'string' && a.text.trim()) {
        s.chat.push({ p: a.pid || '', n: String(a.name || '').slice(0, 24), x: a.text.trim().slice(0, 200), t: now });
        s.chat = s.chat.slice(-40);
      }
      break;
    case 'tick':
      tick(s, now);
      flushPending(s, now);
      break;
  }
  const st = s.st || (s.st = { rx: 0, chart: 0, cr: {}, tm: {} });
  if (a.t === 'rx' && JSON.stringify(s0.rx) !== JSON.stringify(s.rx)) st.rx++;
  if (a.t === 'chart' && !a.clear && typeof a.b === 'number') st.chart++;
  for (const [k, fn] of Object.entries(MILESTONES)) {
    if (!st.cr[k] && fn(s) && !fn(s0)) { st.cr[k] = a.pid || s.host || 'solo'; st.tm[k] = Math.max(0, now - s.t0); }
  }
  s.rev++;
  return s;
}

function startMayday(s, now) {
  const f = s.f;
  f.mayday = 1;
  push(s, 'r96_mayday1', now, 600);
  push(s, 'r96_fisterra1', now, 20500);
  push(s, 'r96_grilo1', now, 31000);
  push(s, 'r96_andres1', now, 34000);
  f.call = 'scheduled';
  f.callAt = now + 49000;
}

// Director: eventos dependientes del tiempo (lo llama el anfitrión cada segundo)
export function tick(s, now) {
  const f = s.f;
  const e = elapsed(s, now);
  if (s.phase !== 'play') return;
  if (f.power && !f.bulletin && e >= T.bulletin) { f.bulletin = 1; push(s, 'vhf_salv1', now, 0); }
  if (f.call === 'scheduled' && now >= f.callAt) { f.call = 'ringing'; f.callAt = now; }
  if ((f.call === 'ringing' || f.call === 'active') && now - f.callAt > 120000) {
    f.call = 'done'; f.callEnded = now;
    if (!f.df) { f.df = 1; push(s, 'r96_fisterra2', now, 3000); push(s, 'r96_andres2', now, 18000); }
  }
  if (f.maree === 'none' && f.call === 'done' && now - f.callEnded > 32000) {
    f.maree = 'calling'; f.mareeAt = now; push(s, 'vhf_maree1', now, 0);
  }
  if (f.maree === 'calling' && now - f.mareeAt > 75000 * (f.mareeAgain + 1) && f.mareeAgain < 3) {
    f.mareeAgain++; push(s, 'vhf_maree_again', now, 0);
  }
  if (f.maree === 'helped' && !f.mareeSafe && now - f.mareeOkAt > 60000) { f.mareeSafe = 1; push(s, 'vhf_maree_safe', now, 0); }
  if (!f.surge && e >= T.surge) f.surge = 1;
  if (f.mayday && !f.andres4 && e >= T.andres4) { f.andres4 = 1; push(s, 'r96_andres4', now, 0); }
  if (f.mayday && !f.grilo2 && e >= T.grilo2) { f.grilo2 = 1; push(s, 'r96_grilo2', now, 0); push(s, 'r96_andres5', now, 3000); }
  if (f.txWarmAt && !f.txWarm && now - f.txWarmAt >= 8000) f.txWarm = 1;
  if (remaining(s, now) <= 0 && !f.ending) {
    f.ending = 'fail'; f.endAt = now; s.phase = 'ending';
    if (!f.lamp && f.lampOffAt) { f.lampOffMs += now - f.lampOffAt; f.lampOffAt = 0; }
  }
}

// Qué objetivos están activos ahora
export function objectives(s) {
  const f = s.f, out = [];
  if (!f.power) return ['power'];
  if (!f.tuned && !f.clear) out.push('tune');
  else if (!f.clear) out.push('noise');
  if (f.call === 'ringing' || f.call === 'active') out.push('call');
  if (f.call === 'done' || f.df) {
    if (!f.cross) out.push('cross');
    if (!f.pageRead) out.push('page');
  }
  if (f.maree === 'calling' || f.maree === 'talking') out.push('maree');
  if (f.pageRead && !f.sw) out.push('decide');
  return out;
}

export function rolesFor(n) {
  return defaultRoleSplit(n);
}
