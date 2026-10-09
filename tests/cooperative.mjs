import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AudioEngine } from '../js/engine/audio.js';
import { reasoningReport } from '../js/game/reasoning.js';

const retained = new Map(), clients = new Set();
const matches = (filter, topic) => filter.split('/').every((part, i) => part === '+' || part === topic.split('/')[i]);
class Client extends EventEmitter {
  constructor() { super(); this.filters = []; clients.add(this); queueMicrotask(() => this.emit('connect')); }
  subscribe(filters, opts, cb) {
    this.filters = filters;
    queueMicrotask(() => {
      cb?.(null, filters.map(topic => ({ topic, qos: 1 })));
      for (const [topic, payload] of retained) if (filters.some(f => matches(f, topic))) this.emit('message', topic, Buffer.from(payload), { retain: true });
    });
  }
  publish(topic, payload, opts) {
    if (opts.retain) { if (payload) retained.set(topic, payload); else retained.delete(topic); }
    for (const c of clients) if (c.filters.some(f => matches(f, topic))) queueMicrotask(() => c.emit('message', topic, Buffer.from(payload), { retain: false }));
  }
  reconnect() { this.emit('connect'); }
  end() { clients.delete(this); this.emit('close'); }
}
const storage = new Map();
globalThis.sessionStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
globalThis.window = { mqtt: { connect: () => new Client() }, addEventListener() {}, removeEventListener() {} };
const { NetSession } = await import('../js/net/session.js');
const flush = () => new Promise(r => setImmediate(r));
const sessions = [];
try {
  let person = 0;
  for (const count of [4, 4, 2]) {
    const host = new NetSession({ name: `Prueba ${++person}`, pid: `p${person}` }); sessions.push(host);
    await host.connect(true); await flush();
    const group = [host];
    for (let i = 1; i < count; i++) {
      const guest = new NetSession({ name: `Prueba ${++person}`, pid: `p${person}`, code: host.code, broker: host.brokerIdx });
      group.push(guest); sessions.push(guest); await guest.connect(false); await flush();
    }
    assert.equal(Object.keys(host.presence).length, count);
    for (const s of group) { assert.equal(s.lobby.host, host.me); assert.deepEqual(Object.values(s.presence).map(p => p.n).sort(), group.map(p => p.name).sort()); }
    host.setLoaded(true); host.setReady(true); await flush();
    host.startGame(37000); assert.equal(host.state, null, 'No empieza mientras otros móviles cargan');
    for (const s of group.slice(1)) { s.setLoaded(true); s.setReady(true); }
    // Una persona solicita todos los roles: aun así nadie queda sin planta.
    host.claimRole('radio'); host.claimRole('linterna'); host.claimRole('archivo'); host.claimRole('carta'); await flush();
    const starts = new Map(); group.forEach(s => s.on('started', () => starts.set(s.me, s.state.t0)));
    host.startGame(37000); await flush();
    assert.equal(starts.size, count);
    assert.equal(new Set(starts.values()).size, 1, 'El inicio es común');
    assert.equal(host.state.t0 - host.lobby.introAt, 37000);
    assert.equal(Object.values(host.state.players).flatMap(p => p.r).length, 4);
    for (const s of group) assert.ok(s.myRoles().length > 0, 'Todos reciben rol');
    group[1].dispatch({ t: 'chat', text: 'Mensaje compartido' }); await flush();
    for (const s of group) assert.equal(s.state.chat.at(-1).x, 'Mensaje compartido');
    const guest = group[1]; guest.client.emit('close'); assert.equal(guest.connected, false);
    guest._wake(); await flush(); assert.equal(guest.connected, true);
    assert.equal(guest.state.t0, host.state.t0, 'Volver a WhatsApp no reinicia la partida');
    guest.offset = 0;
    guest._onMessage(guest.t('s'), Buffer.from(JSON.stringify({ lobby: host.lobby, game: host.state, now: Date.now() - 600000 })), { retain: true });
    assert.equal(guest.offset, 0, 'El mensaje retenido no atrasa el reloj');
  }
  assert.equal(person, 10);
  const a = new AudioEngine(), b = new AudioEngine(); a.setVolume(.2); assert.equal(b.volume, 1); a.setMuted(true); a.setVolume(.5); assert.equal(a.muted, true);
  const report = reasoningReport({ players: { x: { n: 'A', r0: ['linterna'], iq: 100 }, y: { n: 'B', r0: ['archivo'], iq: null } }, st: { cr: { gears: 'x' } } });
  assert.equal(report.rows[0].score, 50); assert.equal(report.iqMean, 100); assert.equal(report.iqCount, 1);
  assert.equal(reasoningReport({ players: {}, st: {} }).iqMean, null);
  console.log('OK: diez jugadores / tres salas, nombres, bloqueo durante carga, roles, inicio común, chat, reconexión, reloj, volumen independiente y puntuación.');
} finally { sessions.forEach(s => s.leave()); }
