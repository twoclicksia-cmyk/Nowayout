// Sesiones de juego: local (solitario) y en red (cooperativo por MQTT sobre WebSocket, brókers públicos gratuitos).
import * as S from '../game/state.js';
import { defaultRoleSplit, ROLE_ORDER } from '../game/content.js';

export const BROKERS = [
  { id: 'emqx', url: 'wss://broker.emqx.io:8084/mqtt' },
  { id: 'hivemq', url: 'wss://broker.hivemq.com:8884/mqtt' },
  { id: 'eclipse', url: 'wss://mqtt.eclipseprojects.io:443/mqtt' },
  { id: 'mosq', url: 'wss://test.mosquitto.org:8081/mqtt' },
];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode() { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
export function newPid() { return 'p' + Math.random().toString(36).slice(2, 10); }
function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

class Emitter {
  constructor() { this._l = {}; }
  on(e, f) { (this._l[e] ||= []).push(f); return () => { this._l[e] = this._l[e].filter(x => x !== f); }; }
  emit(e, d) { (this._l[e] || []).slice().forEach(f => { try { f(d); } catch (err) { console.error(err); } }); }
}

// ------------------------------------------------------------------ SOLITARIO
export class LocalSession extends Emitter {
  constructor(name) {
    super();
    this.mode = 'solo';
    this.me = 'solo';
    this.isHost = true;
    this.offset = 0;
    this.name = name || '';
    this.state = null;
  }
  now() { return Date.now(); }
  start() {
    const players = { solo: { n: this.name || 'Tú', r: ['radio', 'linterna', 'archivo', 'carta'], r0: ['radio', 'linterna', 'archivo', 'carta'], host: 1 } };
    this.state = S.newGame({ players, host: 'solo', now: Date.now() });
    this.emit('state', this.state);
    clearInterval(this._t);
    this._t = setInterval(() => this.dispatch({ t: 'tick' }), 1000);
  }
  dispatch(a) {
    if (!this.state) return;
    const before = this.state;
    this.state = S.reduce(this.state, { ...a, pid: this.me, name: this.name }, Date.now());
    if (this.state !== before) this.emit('state', this.state);
  }
  myRoles() { return ['radio', 'linterna', 'archivo', 'carta']; }
  stop() { clearInterval(this._t); }
}

// ------------------------------------------------------------------ COOPERATIVO
let mqttLoading = null;
function loadMqtt(base) {
  if (window.mqtt) return Promise.resolve(window.mqtt);
  if (mqttLoading) return mqttLoading;
  mqttLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `${base}/vendor/mqtt.min.js`;
    s.onload = () => res(window.mqtt);
    s.onerror = () => rej(new Error('No se pudo cargar el módulo de conexión.'));
    document.head.appendChild(s);
  });
  return mqttLoading;
}

export class NetSession extends Emitter {
  constructor({ base = '.', name = '', code = null, broker = null, pid = null, brokerUrl = null } = {}) {
    super();
    this.mode = 'coop';
    this.base = base;
    this.name = name;
    this.code = code;
    this.brokerIdx = broker;
    this.brokerUrl = brokerUrl; // solo para pruebas locales
    this.me = pid || safeGet('nwo.pid') || newPid();
    safeSet('nwo.pid', this.me);
    this.presence = {};      // pid -> {n, rd, r, on, t, at}
    this.lobby = null;       // estado de sala (lo publica el anfitrión)
    this.state = null;       // estado de partida
    this.offsets = [];
    this.offset = 0;
    this.connected = false;
    this.claims = [];        // roles que quiero
    this.ready = false;
    this.lastSeen = {};
  }

  get isHost() { return !!(this.lobby && this.lobby.host === this.me); }
  now() { return Date.now() + this.offset; }
  t(s) { return `nowayout/v1/${this.code}/${s}`; }

  async connect(create) {
    const mqtt = await loadMqtt(this.base);
    if (create) this.code = newCode();
    // quien se une va al mismo bróker que el anfitrión (si no, no se verían); quien crea prueba hasta que uno responde
    const known = this.brokerIdx != null && BROKERS[this.brokerIdx];
    const order = this.brokerUrl ? [{ id: 'test', url: this.brokerUrl }] : (!create && known ? [known] : BROKERS);
    let lastErr = null;
    for (const b of order) {
      try {
        await this._tryBroker(mqtt, b.url);
        this.brokerIdx = this.brokerUrl ? 0 : BROKERS.indexOf(b);
        this.brokerUrlUsed = b.url;
        break;
      } catch (e) { lastErr = e; }
    }
    if (!this.client) throw lastErr || new Error('Sin conexión');
    this.client.subscribe([this.t('p/+'), this.t('s'), this.t('a')], { qos: 1 });
    if (create) {
      this.lobby = { phase: 'lobby', host: this.me, code: this.code, b: this.brokerIdx, created: Date.now() };
      this._publishLobby();
    }
    this._publishPresence();
    clearInterval(this._hb);
    this._hb = setInterval(() => { this._publishPresence(); this._hostDuties(); }, 4000);
    return this.code;
  }

  _tryBroker(mqtt, url) {
    return new Promise((res, rej) => {
      const c = mqtt.connect(url, {
        clientId: 'nwo_' + this.me + '_' + Math.random().toString(36).slice(2, 6),
        clean: true, keepalive: 20, reconnectPeriod: 2500, connectTimeout: 7000, protocolVersion: 4,
        will: { topic: this.t('p/' + this.me), payload: '', retain: true, qos: 1 },
      });
      const to = setTimeout(() => { try { c.end(true); } catch (e) {} rej(new Error('timeout')); }, 8000);
      c.once('connect', () => {
        clearTimeout(to);
        this.client = c;
        this.connected = true;
        c.on('message', (topic, payload) => this._onMessage(topic, payload));
        c.on('connect', () => { this.connected = true; this.emit('net', 'ok'); c.subscribe([this.t('p/+'), this.t('s'), this.t('a')], { qos: 1 }); this._publishPresence(); });
        c.on('reconnect', () => this.emit('net', 'reconnecting'));
        c.on('close', () => { this.connected = false; this.emit('net', 'down'); });
        c.on('offline', () => { this.connected = false; this.emit('net', 'down'); });
        this.emit('net', 'ok');
        res();
      });
      c.once('error', (e) => { clearTimeout(to); try { c.end(true); } catch (x) {} rej(e); });
    });
  }

  _pub(topic, obj, retain = false) {
    if (!this.client) return;
    this.client.publish(topic, obj === '' ? '' : JSON.stringify(obj), { qos: 1, retain });
  }

  _publishPresence() {
    this._pub(this.t('p/' + this.me), { n: this.name, rd: this.ready ? 1 : 0, r: this.claims, on: 1, t: Date.now() }, true);
  }
  setName(n) { this.name = n; this._publishPresence(); }
  setReady(v) { this.ready = !!v; this._publishPresence(); }
  claimRole(role) {
    if (this.claims.includes(role)) this.claims = this.claims.filter(r => r !== role);
    else this.claims = [...this.claims, role];
    this._publishPresence();
  }

  _publishLobby() {
    this._pub(this.t('s'), { lobby: this.lobby, game: this.state, now: Date.now() }, true);
  }

  _onMessage(topic, payload) {
    const txt = payload ? payload.toString() : '';
    const base = this.t('');
    const sub = topic.slice(base.length);
    if (sub.startsWith('p/')) {
      const pid = sub.slice(2);
      if (!txt) { delete this.presence[pid]; this.lastSeen[pid] = this.lastSeen[pid] || Date.now(); this.emit('presence', this.presence); this._hostDuties(); return; }
      let p; try { p = JSON.parse(txt); } catch (e) { return; }
      if (typeof p !== 'object' || !p) return;
      this.presence[pid] = { n: String(p.n || '').slice(0, 24), rd: p.rd ? 1 : 0, r: Array.isArray(p.r) ? p.r.filter(r => ROLE_ORDER.includes(r)) : [], on: 1, t: p.t, at: Date.now() };
      this.lastSeen[pid] = Date.now();
      this.emit('presence', this.presence);
      this._hostDuties();
    } else if (sub === 's') {
      if (!txt) return;
      let m; try { m = JSON.parse(txt); } catch (e) { return; }
      if (!m || !m.lobby) return;
      if (typeof m.now === 'number') {
        this.offsets.push(m.now - Date.now());
        if (this.offsets.length > 7) this.offsets.shift();
        const sorted = [...this.offsets].sort((a, b) => a - b);
        this.offset = this.isHostFor(m.lobby) ? 0 : sorted[Math.floor(sorted.length / 2)];
      }
      const prevPhase = this.lobby && this.lobby.phase;
      this.lobby = m.lobby;
      if (m.game && (!this.state || m.game.rev >= (this.state.rev || 0) || m.game.t0 !== this.state.t0)) {
        this.state = m.game;
        this.emit('state', this.state);
      }
      this.emit('lobby', this.lobby);
      if (prevPhase !== 'game' && this.lobby.phase === 'game') this.emit('started', this.state);
    } else if (sub === 'a') {
      if (!this.isHost) return;
      let m; try { m = JSON.parse(txt); } catch (e) { return; }
      if (!m || typeof m.pid !== 'string' || !m.a || typeof m.a.t !== 'string') return;
      this._hostApply(m.pid, m.a);
    }
  }
  isHostFor(lobby) { return lobby && lobby.host === this.me; }

  // ---------------- acciones
  dispatch(a) {
    const act = { ...a, pid: this.me, name: this.name };
    if (this.isHost) this._hostApply(this.me, act);
    else this._pub(this.t('a'), { pid: this.me, a: act });
  }

  _hostApply(pid, a) {
    if (!this.state) return;
    if (a.t === 'tick') return;
    const p = this.state.players[pid];
    if (!p && a.t !== 'chat') return;
    const before = this.state;
    this.state = S.reduce(this.state, { ...a, pid, name: (p && p.n) || a.name }, Date.now());
    if (this.state !== before) { this._publishLobby(); this.emit('state', this.state); }
  }

  // ---------------- anfitrión: inicio, director y desconexiones
  // introMs: duración del prólogo narrado; el reloj de la partida arranca cuando termina
  startGame(introMs = 0) {
    if (!this.isHost) return;
    const present = Object.entries(this.presence).filter(([pid, p]) => p.on);
    const pids = present.map(([pid]) => pid).sort((a, b) => (a === this.lobby.host ? -1 : b === this.lobby.host ? 1 : a.localeCompare(b)));
    const n = Math.min(4, pids.length);
    const assign = {};
    pids.forEach(pid => assign[pid] = []);
    const taken = new Set();
    // respeta las peticiones (el primero que la pidió)
    for (const role of ROLE_ORDER) {
      const claimants = pids.filter(pid => (this.presence[pid].r || []).includes(role)).sort((a, b) => (this.presence[a].t || 0) - (this.presence[b].t || 0));
      if (claimants.length) { assign[claimants[0]].push(role); taken.add(role); }
    }
    // resto según el reparto por defecto
    const split = defaultRoleSplit(n);
    const free = ROLE_ORDER.filter(r => !taken.has(r));
    for (const role of free) {
      let best = null;
      for (const pid of pids) {
        const idx = pids.indexOf(pid);
        const pref = split[Math.min(idx, split.length - 1)] || [];
        const score = (pref.includes(role) ? -10 : 0) + assign[pid].length;
        if (best === null || score < best.score) best = { pid, score };
      }
      assign[best.pid].push(role);
    }
    const players = {};
    pids.forEach((pid, i) => {
      players[pid] = { n: this.presence[pid].n || `Jugador ${i + 1}`, r: assign[pid], r0: assign[pid].slice(), i, host: pid === this.lobby.host ? 1 : 0 };
    });
    this.state = S.newGame({ players, host: this.lobby.host, now: Date.now() + Math.max(0, introMs) });
    this.lobby = { ...this.lobby, phase: 'game', started: Date.now() };
    this._publishLobby();
    this.emit('state', this.state);
    this.emit('started', this.state);
    clearInterval(this._tick);
    this._tick = setInterval(() => this._hostTick(), 1000);
  }

  _hostTick() {
    if (!this.isHost || !this.state) return;
    const before = JSON.stringify([this.state.f, this.state.log.length, this.state.phase, this.state.pend.length]);
    this.state = S.reduce(this.state, { t: 'tick' }, Date.now());
    const after = JSON.stringify([this.state.f, this.state.log.length, this.state.phase, this.state.pend.length]);
    if (before !== after) { this._publishLobby(); this.emit('state', this.state); }
    else if (Date.now() - (this._lastPub || 0) > 5000) { this._publishLobby(); }
    this._lastPub = this._lastPub || Date.now();
  }

  _hostDuties() {
    const lobby = this.lobby;
    if (!lobby) return;
    const now = Date.now();
    // elección de nuevo anfitrión si el actual desaparece
    const hostAlive = this.presence[lobby.host] || lobby.host === this.me;
    if (!hostAlive) {
      const lost = now - (this.lastSeen[lobby.host] || 0);
      if (lost > 9000) {
        const candidates = Object.keys(this.presence).concat([this.me]).filter((v, i, a) => a.indexOf(v) === i).sort();
        if (candidates[0] === this.me) {
          this.lobby = { ...lobby, host: this.me };
          this.offset = 0;
          if (this.state) {
            this.state = { ...this.state, host: this.me };
            clearInterval(this._tick);
            if (this.lobby.phase === 'game') this._tick = setInterval(() => this._hostTick(), 1000);
          }
          this._publishLobby();
          this.emit('lobby', this.lobby);
          this.emit('hostChanged', this.me);
        }
      }
    }
    if (!this.isHost || !this.state || this.lobby.phase !== 'game') return;
    // reasignar roles de jugadores ausentes, devolverlos al volver
    let changed = false;
    const st = structuredClone(this.state);
    const pids = Object.keys(st.players);
    for (const pid of pids) {
      const pl = st.players[pid];
      const here = pid === this.me || !!this.presence[pid];
      if (!here && !pl.away && now - (this.lastSeen[pid] || 0) > 15000) {
        pl.away = 1;
        const roles = pl.r; pl.r = [];
        for (const role of roles) {
          const others = pids.filter(q => q !== pid && !st.players[q].away);
          if (!others.length) break;
          others.sort((a, b) => st.players[a].r.length - st.players[b].r.length);
          st.players[others[0]].r.push(role);
        }
        changed = true;
      } else if (here && pl.away) {
        pl.away = 0;
        for (const role of pl.r0) {
          for (const q of pids) if (q !== pid) st.players[q].r = st.players[q].r.filter(r => r !== role);
          if (!pl.r.includes(role)) pl.r.push(role);
        }
        // nadie se queda sin rol
        for (const q of pids) if (!st.players[q].away && !st.players[q].r.length) {
          const donor = pids.filter(x => st.players[x].r.length > 1).sort((a, b) => st.players[b].r.length - st.players[a].r.length)[0];
          if (donor) st.players[q].r.push(st.players[donor].r.pop());
        }
        changed = true;
      }
    }
    if (changed) { st.rev++; this.state = st; this._publishLobby(); this.emit('state', this.state); }
  }

  myRoles() { return (this.state && this.state.players[this.me] && this.state.players[this.me].r) || []; }

  leave() {
    clearInterval(this._hb); clearInterval(this._tick);
    if (this.client) { this._pub(this.t('p/' + this.me), '', true); setTimeout(() => { try { this.client.end(); } catch (e) {} }, 300); }
  }
}
