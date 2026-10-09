// Catálogo de NOWAYOUT (vista previa tras superar la Sala 0)
import { h } from './dom.js';

const ROOMS = [
  { id: 'sala0', title: 'La Última Frecuencia', tag: 'Sala 0 · Faro · 1996/2026', hue: 36, done: true },
  { id: 'umbral', title: 'Protocolo Umbral', tag: 'Ciencia ficción · IA', hue: 190 },
  { id: 'hotel', title: 'El Hotel de los Ausentes', tag: 'Misterio · Identidad', hue: 340 },
  { id: '1983', title: 'Falso Amanecer · 1983', tag: 'Guerra Fría · Hechos reales', hue: 6 },
  { id: 'palo', title: 'El Hombre de Palo', tag: 'Toledo 1585 · Leyenda', hue: 28 },
  { id: 'alboran', title: 'Estación Alborán', tag: 'Supervivencia · Mar profundo', hue: 205 },
];

function cover(room, w = 400, hgt = 600) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const g = c.getContext('2d');
  let seed = [...room.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bg = g.createLinearGradient(0, 0, 0, hgt);
  bg.addColorStop(0, `hsl(${room.hue} 40% 14%)`); bg.addColorStop(1, `hsl(${room.hue} 30% 4%)`);
  g.fillStyle = bg; g.fillRect(0, 0, w, hgt);
  for (let i = 0; i < 70; i++) { g.fillStyle = `hsla(${room.hue} 60% ${30 + rnd() * 40}% / ${rnd() * 0.12})`; g.beginPath(); g.arc(rnd() * w, rnd() * hgt, 20 + rnd() * 120, 0, 6.3); g.fill(); }
  g.strokeStyle = `hsla(${room.hue} 80% 70% / .5)`; g.lineWidth = 2;
  if (room.id === 'sala0') {
    g.fillStyle = '#0b0e12'; g.fillRect(w * 0.45, hgt * 0.3, w * 0.1, hgt * 0.5);
    const grd = g.createLinearGradient(w * 0.5, hgt * 0.3, w, hgt * 0.15); grd.addColorStop(0, 'rgba(255,220,150,.75)'); grd.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(w * 0.5, hgt * 0.3); g.lineTo(w, hgt * 0.1); g.lineTo(w, hgt * 0.32); g.fill();
  } else {
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w / 2, hgt * 0.42, 40 + i * 26, rnd() * 6, rnd() * 6 + 3); g.stroke(); }
  }
  g.fillStyle = '#f1ead8'; g.font = `900 ${Math.round(w * 0.12)}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
  const words = room.title.toUpperCase().split(' ');
  let y = hgt * 0.72;
  let line = '';
  const lines = [];
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w * 0.86 && line) { lines.push(line); line = wd; } else line = t; }
  lines.push(line);
  for (const l of lines) { g.fillText(l, w * 0.07, y); y += w * 0.12; }
  return c;
}

export function renderCatalog(root, { name, ending, onReplay, onExit }) {
  root.innerHTML = '';
  const endName = { luz: 'La luz que no habla', adv: 'Tu voz', resc: 'La posición' }[ending] || '';
  let best = null;
  try { const l = JSON.parse(localStorage.getItem('nwo.records') || '[]'); best = l.length ? l[0] : null; } catch (e) {}
  const heroCv = cover(ROOMS[0], 1200, 700);
  heroCv.style.width = '100%'; heroCv.style.height = '100%';
  const strip = (title, items) => h('section', { class: 'cat-row' }, h('h3', { text: title }), h('div', { class: 'cat-strip' }, ...items.map(r => {
    const cv = cover(r);
    return h('article', { class: 'tile', 'aria-label': r.title }, cv, h('div', { class: 'meta' }, h('b', { text: r.title }), h('span', { class: 'fine', text: r.tag }), r.done ? h('span', { class: 'done', text: 'SUPERADA' }) : h('span', { class: 'soon', text: 'PRÓXIMAMENTE · NO DISPONIBLE' })));
  })));
  root.append(
    h('header', { class: 'cat-top' },
      h('div', { class: 'brand' }, h('div', { class: 'wordmark', html: 'N<span class="o"></span>WAY<span class="o"></span>UT' })),
      h('button', { class: 'btn small ghost', text: 'Salir', onclick: onExit })),
    h('section', { class: 'cat-hero' }, heroCv,
      h('div', { class: 'in' },
        h('div', { class: 'eyebrow', text: `Bienvenido/a${name ? ', ' + name : ''} · acceso concedido` }),
        h('h2', { text: 'La Última Frecuencia' }),
        h('p', { style: { margin: 0, color: '#d6cfbf', maxWidth: '52ch', lineHeight: 1.5 }, text: `Tu final: «${endName}». Hay tres finales posibles. ¿Te atreves a volver a esa noche?` }),
        best ? h('p', { class: 'fine', style: { margin: 0 }, text: `Tu mejor guardia: ${best.score.toLocaleString('es-ES')} puntos · ${best.rank}` }) : null,
        h('div', { class: 'row', style: { maxWidth: '520px' } }, h('button', { class: 'btn primary', text: 'Volver a jugar', onclick: onReplay })))),
    strip('Próximas salas', ROOMS.slice(1)),
    strip('Superadas', [ROOMS[0]]),
    h('footer', { class: 'cat-foot' }, h('p', { text: 'Vista previa del catálogo. Las salas marcadas como «Próximamente» todavía no se pueden jugar.' }), h('p', { text: 'Tu acceso se guarda solo en este dispositivo y no es un control de acceso seguro.' })));
}
