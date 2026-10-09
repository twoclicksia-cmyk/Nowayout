// Llamada entrante simulada con el estilo del sistema del jugador (sin logos ni diseños oficiales).
import { h, ICON, platform, drag } from './dom.js';

const ICON_DECLINE = '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.99.99 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>';
const ICON_ACCEPT = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';

export class PhoneCall {
  constructor(audio) {
    this.audio = audio;
    this.plat = platform();
    this.el = null;
  }

  // opts: { caller, sub, segs: [ids], mask: Set|null, line: bool, onAnswer, onEnd(result), subOf(id), gapMs }
  ring(opts) {
    this.close();
    this.opts = opts;
    this.answered = false;
    this._hung = false;
    const style = this.plat === 'ios' ? 'ios' : 'android';
    if (!opts.autoAnswer) this.audio.ring(style);
    const cls = `call ${this.plat === 'desktop' ? 'android desktop' : this.plat}`;
    const initials = (opts.caller || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const el = h('div', { class: cls, role: 'dialog', 'aria-label': `Llamada entrante de ${opts.caller}` },
      h('div', { class: 'bgblur' }),
      h('div', { class: 'who' },
        this.plat !== 'ios' ? h('div', { class: 'avatar', text: initials }) : null,
        h('div', { class: 'nm', text: opts.caller }),
        h('div', { class: 'sub2', text: this.plat === 'android' || this.plat === 'desktop' ? `Llamada entrante · ${opts.sub}` : opts.sub }),
      ),
      h('div', { class: 'mid' }, h('div', { class: 'subs-call', 'aria-live': 'polite' })),
      this._ringActions(),
    );
    document.body.appendChild(el);
    this.el = el;
    if (opts.autoAnswer) { this.audio.stopRing(); this._answer(); return; }
    this._ringTimeout = setTimeout(() => { if (!this.answered) this._decline(true); }, opts.timeoutMs || 45000);
  }

  _ringActions() {
    if (this.plat === 'ios') {
      const slide = h('div', { class: 'slide', role: 'button', tabindex: '0', 'aria-label': 'Desliza para responder' },
        h('div', { class: 'txt', text: 'desliza para responder' }),
        h('div', { class: 'knob', html: ICON_ACCEPT }));
      const knob = slide.querySelector('.knob');
      let x = 0;
      drag(knob, {
        onMove: (dx) => { x = Math.max(0, Math.min(slide.clientWidth - 72, x + dx)); knob.style.left = (6 + x) + 'px'; },
        onEnd: () => { if (x > slide.clientWidth - 110) this._answer(); else { x = 0; knob.style.left = '6px'; } },
      });
      slide.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this._answer(); });
      return h('div', { class: 'bottom' },
        slide,
        h('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '22px' } },
          h('div', {}, h('button', { class: 'callbtn decline', 'aria-label': 'Rechazar', html: ICON_DECLINE, onclick: () => this._decline() }), h('div', { class: 'callcap', text: 'Rechazar' }))));
    }
    if (this.plat === 'android') {
      const ic = h('div', { class: 'phone-ic', html: ICON_ACCEPT, role: 'button', tabindex: '0', 'aria-label': 'Desliza hacia arriba para responder' });
      let y = 0;
      drag(ic, {
        onMove: (dx, dy) => { y = Math.min(0, Math.max(-150, y + dy)); ic.style.transform = `translateY(${y}px)`; },
        onEnd: () => { if (y < -80) this._answer(); else { y = 0; ic.style.transform = ''; } },
      });
      ic.addEventListener('click', () => { if (!this._hinted) { this._hinted = true; ic.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-24px)' }, { transform: 'translateY(0)' }], { duration: 450 }); } });
      ic.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this._answer(); });
      return h('div', { class: 'swipeup' },
        h('div', { class: 'callcap', text: 'Desliza hacia arriba para responder' }),
        ic,
        h('button', { class: 'btn ghost small', style: { marginTop: '18px', color: '#ffb4ab', borderColor: 'rgba(255,255,255,.2)' }, text: 'Rechazar', onclick: () => this._decline() }));
    }
    return h('div', { class: 'android-actions' },
      h('div', {}, h('button', { class: 'callbtn decline', 'aria-label': 'Rechazar', html: ICON_DECLINE, onclick: () => this._decline() }), h('div', { class: 'callcap', text: 'Rechazar' })),
      h('div', {}, h('button', { class: 'callbtn accept', 'aria-label': 'Responder', html: ICON_ACCEPT, onclick: () => this._answer() }), h('div', { class: 'callcap', text: 'Responder' })));
  }

  async _answer() {
    if (this.answered || !this.el) return;
    this.answered = true;
    clearTimeout(this._ringTimeout);
    this.audio.stopRing();
    this.opts.onAnswer && this.opts.onAnswer();
    const bottom = this.el.lastElementChild;
    const timer = h('div', { class: 'timer2', text: '00:00' });
    const end = h('div', {}, h('button', { class: 'callbtn decline', 'aria-label': 'Colgar', html: ICON_DECLINE, onclick: () => this._hangup() }), h('div', { class: 'callcap', text: 'Colgar' }));
    bottom.replaceWith(h('div', { class: 'incall' }, end));
    this.el.querySelector('.who').appendChild(timer);
    const t0 = Date.now();
    this._clock = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 500);
    await this._playScript();
  }

  async _playScript() {
    const o = this.opts;
    const subsEl = this.el.querySelector('.subs-call');
    if (o.line) this.audio.lineBed(true);
    this.heard = [];
    await wait(900);
    for (let i = 0; i < o.segs.length; i++) {
      if (!this.el || this._hung) return;
      const id = o.segs[i];
      const heard = !o.mask || o.mask.has(i);
      const dur = (this.audio.info(id).dur || 3) * 1000;
      if (heard) {
        this.heard.push(i);
        subsEl.textContent = o.subOf(id);
        const p = await this.audio.playVoice(id, { bus: 'phone' });
        this._cur = p;
        await Promise.race([p.ended, wait(dur + 400)]);
      } else {
        subsEl.textContent = '[ · · · la línea se corta · · · ]';
        this.audio.dropout(Math.min(dur, 3500));
        await wait(Math.min(dur, 3500));
      }
      if (o.breathAfter === i) { this.audio.breath(2200); await wait(1600); }
      await wait(o.gapMs || 600);
    }
    if (!this._hung) {
      subsEl.textContent = '[ la llamada se ha cortado ]';
      await wait(1500);
      this._finish(false);
    }
  }

  _hangup() {
    this._hung = true;
    if (this._cur && this._cur.stop) this._cur.stop();
    this._finish(false, true);
  }

  _decline(timeout = false) {
    clearTimeout(this._ringTimeout);
    this.audio.stopRing();
    this._finish(true);
  }

  _finish(missed, hungEarly = false) {
    clearInterval(this._clock);
    this.audio.lineBed(false);
    const o = this.opts;
    this.close();
    o && o.onEnd && o.onEnd({ missed, hungEarly, heard: this.heard || [] });
  }

  close() {
    clearTimeout(this._ringTimeout);
    clearInterval(this._clock);
    if (this.el) { this.el.remove(); this.el = null; }
    this.audio.stopRing();
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
