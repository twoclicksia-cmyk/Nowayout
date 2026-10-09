// Jugadores sintéticos con soluciones conocidas. Los tiempos son supuestos,
// no mediciones humanas ni una simulación psicométrica del IQ.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame, reduce, computeEnding } from '../js/game/state.js';
import { defaultRoleSplit } from '../js/game/content.js';

const results = [];
let person = 0;
for (const [size, delay] of [[4, 12000], [4, 18000], [2, 24000]]) {
  const split = defaultRoleSplit(size);
  const players = Object.fromEntries(split.map((r, i) => [`p${++person}`, { n: `Jugador ficticio ${person}`, r, r0: r.slice(), i }]));
  const ids = Object.keys(players), host = ids[0], t0 = 1_800_000_000_000;
  let now = t0, state = newGame({ players, host, now });
  const act = (role, a, ms = delay) => {
    now += ms;
    state = reduce(state, { t: 'tick', pid: host }, now);
    const pid = ids.find(id => players[id].r.includes(role)) || host;
    state = reduce(state, { ...a, pid }, now);
  };
  act('radio', { t: 'power', on: true });
  act('radio', { t: 'rx', band: 'MF', ant: 2, freq: 2182, nbOn: 1, nbP: 3, nbT: 15 });
  act('archivo', { t: 'callActive' }, 50000);
  act('archivo', { t: 'callEnd' });
  act('carta', { t: 'chart', o: 'FN', b: 230 });
  act('carta', { t: 'chart', o: 'PI', b: 205 });
  act('archivo', { t: 'read', doc: 'dossier' });
  act('archivo', { t: 'findPage' });
  act('archivo', { t: 'read', doc: 'page' });
  act('carta', { t: 'cover' });
  act('linterna', { t: 'gears', a: 10, b: 30 });
  for (let i = 0; i < 8; i++) act('linterna', { t: 'kero', op: 'pump' }, 1000);
  act('linterna', { t: 'kero', op: 'preheat' });
  act('linterna', { t: 'kero', op: 'valve' }, 9000);
  act('linterna', { t: 'kero', op: 'ignite' });
  for (const pid of ids) state = reduce(state, { t: 'vote', choice: 'luz', pid }, now);
  act('radio', { t: 'switch', choice: 'luz' });
  assert.equal(computeEnding(state).ending, 'luz');
  results.push({ players: ids.map(id => players[id].n), inputDelaySeconds: delay / 1000, programmedSeconds: (now - t0) / 1000, ending: computeEnding(state).ending, credits: state.st.cr });
}
assert.equal(person, 10);
mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
writeFileSync(new URL('../reports/simulation.json', import.meta.url), JSON.stringify({ description: 'Diez jugadores sintéticos en tres equipos. Conocen las soluciones. Tiempos introducidos por el guion; sin IQ asignado ni predicción de tiempo humano.', results }, null, 2));
console.log(JSON.stringify(results.map(r => ({ players: r.players.length, seconds: r.programmedSeconds, ending: r.ending })), null, 2));
