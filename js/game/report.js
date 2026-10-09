// Parte de guardia: estadísticas medidas durante la partida, puntuación y distinciones.
// El objeto `record` está pensado para enviarse en el futuro a un ranking público.
import { ROOM } from './content.js';
import { computeEnding, elapsed, remaining } from './state.js';

const LABEL = {
  power: 'corriente', tune: 'sintonía', clear: 'señal limpia', call: 'descolgó a Ramón', cross: 'cruce de demoras',
  maree: 'guio al Marée', letter: 'carta de Ramón', page: 'hoja escondida', cover: 'tapa del conmutador',
  gears: 'relojería', kero: 'queroseno', tx: 'transmisor', msg: 'mensaje', sw: 'la palanca',
};

export const TOTAL_DOCS = 13;

export function guardReport(s, local = {}) {
  const f = s.f, st = s.st || { rx: 0, chart: 0, cr: {}, tm: {} };
  const end = computeEnding(s);
  const at = f.endAt || Date.now();
  const used = Math.min(ROOM.durationMs, elapsed(s, at));
  const left = end.ending === 'fail' ? 0 : remaining(s, at);
  const hintLv = Object.values(s.hints || {});
  const hints = hintLv.reduce((a, b) => a + b, 0);
  const sols = hintLv.filter((v) => v >= 3).length;
  const offMs = f.lampOffMs + (f.lampOffAt ? Math.max(0, at - f.lampOffAt) : 0);
  // vidas: 6 en el Santa Ilia (en el fallo solo se salva el niño) + 2 en el Marée
  const santa = end.ending === 'fail' ? 1 : 6;
  const maree = end.maree === 'darkWorse' ? 0 : 2;
  const lives = santa + maree;
  const lampOnMs = Math.max(0, used - offMs);
  const flashes = Math.floor(lampOnMs / 15000) * 3 + (f.keroLit ? 3 : 0);
  const mareeFirst = f.maree === 'helped' && f.mareeTries === 1;
  const chartFirst = !!f.cross && st.chart <= 2;
  const tuneSecs = st.tm.tune != null && st.tm.power != null ? (st.tm.tune - st.tm.power) / 1000 : null;
  // puntuación de guardia
  let score = lives * 500 + ({ luz: 1500, adv: 1200, resc: 1200 }[end.ending] || 0)
    + Math.round(left / 1000) * 3
    - (hints - sols * 3) * 100 - sols * 300
    - Math.min(900, Math.round(offMs / 1000) * 3)
    - f.keroFlares * 120
    + (mareeFirst ? 300 : f.maree === 'helped' ? 150 : 0)
    + (chartFirst ? 200 : 0);
  score = Math.max(0, Math.round(score));
  const rank = score >= 7000 ? 'Torrero mayor' : score >= 5500 ? 'Torrero de primera' : score >= 4000 ? 'Torrero' : score >= 2000 ? 'Ayudante de torrero' : 'Aprendiz';
  const stats = [
    ['Tiempo de guardia', mmss(used)],
    ['Margen ante la pleamar', mmss(left)],
    ['Personas a salvo', `${lives} de 8`],
    ['Segundos de faro apagado', `${Math.round(offMs / 1000)} s`],
    ['Destellos lanzados', String(flashes)],
    ['Giros de dial', String(st.rx)],
    ['Demoras trazadas', String(st.chart)],
    ['Respuestas al Marée', String(f.mareeTries)],
    ['Llamaradas de queroseno', String(f.keroFlares)],
    ['Pistas pedidas', sols ? `${hints} (${sols} con solución)` : String(hints)],
  ];
  if (local.heard != null) stats.push(['Voces de 1996 escuchadas', String(local.heard)]);
  if (local.steps != null) stats.push(['Escalones del faro', String(local.steps)]);
  if (local.docs != null) stats.push(['Documentos leídos', `${local.docs} de ${TOTAL_DOCS}`]);
  const badges = [];
  if (tuneSecs != null && tuneSecs <= 90) badges.push(['Oído fino', `Encontraste los 2182 kHz en ${Math.round(tuneSecs)} s.`]);
  if (!f.lampOffs && end.ending !== 'fail') badges.push(['La luz no se apaga', 'La linterna no se apagó ni un segundo antes de las 23:52.']);
  if (mareeFirst) badges.push(['Ángel del Marée', 'Guiaste al velero a la primera.']);
  if (f.keroLit && !f.keroFlares) badges.push(['Mano firme', 'Encendiste la reserva sin una sola llamarada.']);
  if (!hints) badges.push(['Vieja escuela', 'Ni una pista.']);
  if (left >= 5 * 60000) badges.push(['Contra el reloj', 'Saliste con más de cinco minutos de margen.']);
  if (chartFirst) badges.push(['Rumbo exacto', 'El cruce de demoras, a la primera.']);
  if (local.docs != null && local.docs >= TOTAL_DOCS) badges.push(['Archivero', 'Leíste todos los papeles del faro.']);
  // quién hizo qué (cooperativo)
  const credits = {};
  for (const [k, pid] of Object.entries(st.cr)) {
    const name = (s.players[pid] && s.players[pid].n) || '';
    if (!name || !LABEL[k]) continue;
    (credits[name] ||= []).push(LABEL[k]);
  }
  const nPlayers = Object.keys(s.players || {}).length;
  if (nPlayers > 1 && Object.keys(credits).length === nPlayers) badges.push(['Guardia completa', 'Todo el equipo resolvió algo importante.']);
  const record = {
    v: 1, room: 'sala0', ending: end.ending, score, rank, timeMs: used, leftMs: left, lives, hints, solutions: sols,
    mode: nPlayers > 1 ? 'coop' : 'solo', players: Object.values(s.players || {}).map((p) => p.n), at: Date.now(),
  };
  return { score, rank, stats, badges, credits, record, ending: end.ending };
}

function mmss(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// récords locales (este dispositivo); un ranking público necesitará un servidor
export function saveRecord(record) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('nwo.records') || '[]'); } catch (e) { list = []; }
  const prevBest = list.length ? Math.max(...list.map((r) => r.score || 0)) : 0;
  list.push(record);
  list.sort((a, b) => b.score - a.score);
  list = list.slice(0, 10);
  try { localStorage.setItem('nwo.records', JSON.stringify(list)); } catch (e) {}
  return { best: Math.max(prevBest, record.score), isBest: record.score > prevBest, list };
}
