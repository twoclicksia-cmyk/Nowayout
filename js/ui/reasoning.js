import { h, store } from './dom.js';
export function externalIq() {
  const p = store('nwo.iqProfile');
  return p && Number.isFinite(p.iq) && p.iq >= 40 && p.iq <= 200 ? p.iq : null;
}
export function sharedIq() { return store('nwo.iqProfile')?.share ? externalIq() : null; }
export function iqProfile(onChange = () => {}) {
  const p = store('nwo.iqProfile') || {};
  const input = h('input', { class: 'input', type: 'number', min: 40, max: 200, step: 1, placeholder: 'Opcional', value: externalIq() ?? '', 'aria-label': 'IQ de una prueba externa' });
  const share = h('input', { type: 'checkbox', checked: !!p.share });
  const note = h('p', { class: 'fine', text: 'Dato declarado por ti, sin verificación. Solo se envía a la sala si activas «Compartir con mi equipo».' });
  const save = () => {
    const iq = input.value === '' ? null : Number(input.value);
    if (iq !== null && (!Number.isInteger(iq) || iq < 40 || iq > 200)) { note.textContent = 'Introduce un resultado entre 40 y 200, o deja el campo vacío.'; return; }
    store('nwo.iqProfile', { iq, share: share.checked }); onChange(sharedIq());
    note.textContent = 'Dato declarado por ti, sin verificación. Solo se envía a la sala si activas «Compartir con mi equipo».';
  };
  input.addEventListener('change', save); share.addEventListener('change', save);
  return h('details', { class: 'card split' }, h('summary', { class: 'eyebrow', text: 'Razonamiento e IQ · opcional' }),
    h('p', { class: 'fine', text: 'Al finalizar verás tu índice de razonamiento del juego (0–100) y la media del equipo. Se basa en retos completados y no mide tu IQ.' }),
    h('label', { class: 'split' }, 'IQ obtenido en una prueba externa', input),
    h('label', { class: 'fine' }, share, ' Compartir con mi equipo para calcular la media'), note,
    h('p', { class: 'fine' }, 'IQ medio de referencia: 100. No existe un IQ mínimo validado para superar esta sala. ', h('a', { href: 'https://www.mensa.org/what-is-iq/', target: '_blank', rel: 'noopener', text: 'Referencia: Mensa' })));
}
export function reasoningSection(report) {
  return h('section', { class: 'parte', 'aria-label': 'Razonamiento e IQ' },
    h('div', { class: 'k', text: 'Índice de razonamiento · puntuación del juego' }),
    h('dl', { class: 'stats' }, ...report.rows.flatMap(r => [h('dt', { text: r.name }), h('dd', { text: `${r.score ?? '—'}/100 · ${r.done}/${r.total} retos` })]),
      h('dt', { text: 'Media del equipo' }), h('dd', { text: `${report.mean ?? '—'}/100` })),
    h('p', { class: 'fine', text: 'Retos atribuidos a tus roles iniciales. Mide tu participación en esta guardia; no es una prueba de inteligencia ni usa baremos oficiales.' }),
    h('div', { class: 'k', text: 'IQ de prueba externa · declarado' }),
    h('dl', { class: 'stats' }, ...report.rows.filter(r => Number.isFinite(r.iq)).flatMap(r => [h('dt', { text: r.name }), h('dd', { text: String(r.iq) })]),
      h('dt', { text: `Media de IQ (${report.iqCount} datos)` }), h('dd', { text: report.iqMean === null ? 'Sin datos' : String(report.iqMean) })),
    h('p', { class: 'fine', text: 'Solo incluye resultados externos facilitados voluntariamente. No se ha validado un IQ mínimo para superar esta sala.' }));
}
