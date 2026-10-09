import { h, $ } from './dom.js';
import { gateFx } from './gatefx.js';

export async function roomCountdown(session, audio, reduce) {
  const at = session.lobby.introAt || session.now();
  if (at <= session.now()) return;
  const root = $('#intro'); root.classList.add('room-countdown');
  const canvas = h('canvas', { class: 'arrival-storm', 'aria-hidden': 'true' });
  const aura = h('div', { class: 'arrival-aura', 'aria-hidden': 'true' });
  const digit = h('div', { class: 'arrival-digit', role: 'status', 'aria-live': 'polite' });
  $('#introText').replaceChildren(
    h('div', { class: 'eyebrow', text: 'Sala 0 · La Última Frecuencia' }),
    h('p', { class: 'on', text: 'Todos preparados. El faro os está esperando.' }), digit,
    h('div', { class: 'fine', text: 'La historia comienza para todo el equipo a la vez.' }));
  $('#introActions').replaceChildren();
  root.prepend(canvas, aura);
  const fx = gateFx(canvas, { reduce });
  audio.mood('dread');
  let last = null;
  try {
    while (session.now() < at && !session.stopped) {
      const n = Math.min(3, Math.ceil((at - session.now()) / 1000));
      if (n !== last) {
        last = n; digit.textContent = n;
        digit.classList.remove('pulse'); void digit.offsetWidth; digit.classList.add('pulse');
        if (!reduce) audio.sfx('morse');
      }
      await new Promise(r => setTimeout(r, 80));
    }
  } finally { fx.stop(); canvas.remove(); aura.remove(); root.classList.remove('room-countdown'); }
}

export function enterRoom(reduce) {
  const overlay = h('div', { class: 'room-arrival' + (reduce ? ' gentle' : ''), 'aria-hidden': 'true' }, h('div', { class: 'arrival-beam' }));
  document.body.append(overlay);
  setTimeout(() => overlay.remove(), reduce ? 450 : 1300);
}
