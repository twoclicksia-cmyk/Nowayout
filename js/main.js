// NOWAYOUT · controlador de la aplicación (portada → sala de espera → faro → final → catálogo)
import { World } from './engine/world.js';
import { AudioEngine } from './engine/audio.js';
import * as S from './game/state.js';
import * as C from './game/content.js';
import { LocalSession, NetSession, BROKERS } from './net/session.js';
import { Panels, rxSignal } from './ui/panels.js';
import { PhoneCall } from './ui/phone.js';
import { h, $, ICON, iconBtn, fmtTime, store } from './ui/dom.js';
import { gateFx } from './ui/gatefx.js';
import { renderCatalog } from './ui/catalog.js';
import { corkCanvas, workorderCanvas, drawingCanvas, calendarCanvas } from './ui/papers.js';
import { chartCanvas } from './ui/chart.js';
import { fmtLat, fmtLon } from './game/nav.js';
import { guardReport, saveRecord } from './game/report.js';

const BASE = '.';
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const settings = {
  sound: store('nwo.sound') ?? true,
  reduce: store('nwo.reduce') ?? matchMedia('(prefers-reduced-motion: reduce)').matches,
  quality: store('nwo.quality') || 'auto',
  name: store('nwo.name') || '',
};
const audio = new AudioEngine(BASE);

// ------------------------------------------------------------------ como una app: pantalla completa y pantalla encendida
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const STANDALONE = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
function goFullscreen() {
  if (STANDALONE || document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  const rq = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!rq) return;
  try { const p = rq.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
// en Android, el primer toque (y cualquiera tras salir) pone la web a pantalla completa, sin barras del navegador
if (IS_ANDROID) document.addEventListener('click', goFullscreen, true);
document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && game) keepAwake(); });
let world = null, worldPromise = null, session = null, game = null, gfx = null;

function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id && !(id === 'ending' && s.id === 'game'); }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ PORTADA
function initGate() {
  try { for (const f of ['400 16px "IBM Plex Mono"', '600 16px "IBM Plex Mono"', '900 16px "Big Shoulders Display"']) document.fonts.load(f); } catch (e) {}
  gfx = gateFx($('#gate canvas.bg'), { reduce: settings.reduce });
  const unl = store('nwo.unlocked');
  if (unl) {
    $('#unlockedBanner').hidden = false;
    $('#lockline').textContent = 'Acceso concedido';
    $('#lockline').style.color = '#9fe3bd';
  }
  $('#toCatalog').onclick = () => openCatalog(unl && unl.ending);
  const tS = $('#tSound'), tM = $('#tMotion'), tQ = $('#tQuality');
  const sync = () => {
    tS.setAttribute('aria-pressed', settings.sound); tM.setAttribute('aria-pressed', settings.reduce);
    $('#qLabel').textContent = 'Calidad: ' + ({ auto: 'auto', alta: 'alta', media: 'media', baja: 'baja' }[settings.quality]);
    document.documentElement.classList.toggle('reduce', !!settings.reduce);
  };
  tS.onclick = () => { settings.sound = !settings.sound; store('nwo.sound', settings.sound); audio.setMuted(!settings.sound); sync(); };
  tM.onclick = () => { settings.reduce = !settings.reduce; store('nwo.reduce', settings.reduce); sync(); };
  tQ.onclick = () => { const o = ['auto', 'alta', 'media', 'baja']; settings.quality = o[(o.indexOf(settings.quality) + 1) % o.length]; store('nwo.quality', settings.quality); sync(); };
  sync();
  // instalar como app (icono en la pantalla de inicio, a pantalla completa)
  const row = document.querySelector('#gate .settings-row');
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    if (document.getElementById('installBtn') || !row) return;
    const b = h('button', { class: 'toggle', id: 'installBtn', onclick: async () => { try { e.prompt(); await e.userChoice; } catch (x) {} b.remove(); } }, h('span', { class: 'dot' }), 'Instalar como app');
    row.appendChild(b);
  });
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !STANDALONE && row) row.after(h('p', { class: 'fine', text: 'En iPhone, para jugar como app a pantalla completa: Compartir → «Añadir a pantalla de inicio».' }));
  $('#playSolo').onclick = () => startSolo();
  $('#playFriends').onclick = () => openLobby();
  if (params.get('sala')) openLobby(params.get('sala').toUpperCase().slice(0, 6), params.has('b') ? Number(params.get('b')) : null);
}

function ensureWorld(onProgress) {
  if (!worldPromise) {
    world = new World($('#gl'), { quality: settings.quality, reduceMotion: settings.reduce, base: BASE });
    worldPromise = world.load(onProgress).then(() => world);
  } else if (onProgress && world._lastProg) onProgress(world._lastProg.p, world._lastProg.l);
  return worldPromise;
}

async function loadingScreen() {
  show('loading');
  const bar = $('#loadBar'), msg = $('#loadMsg');
  const labels = { Exterior: 'Levantando la tormenta…', Texturas: 'Encalando paredes…', Listo: 'Listo.' };
  await ensureWorld((p, l) => {
    world && (world._lastProg = { p, l });
    bar.style.width = Math.round(p * 100) + '%';
    msg.textContent = labels[l] || (l && l.startsWith('Planta') ? 'Subiendo la escalera del faro…' : 'Preparando el faro…');
  });
  bar.style.width = '100%';
}

// ------------------------------------------------------------------ SOLITARIO
async function startSolo(skipIntro = false) {
  await audio.init(); audio.setMuted(!settings.sound);
  audio.preload(C.INTRO.solo.map(l => l[0]));
  if (gfx) { gfx.stop(); gfx = null; }
  try { await loadingScreen(); } catch (e) { return failLoad(e); }
  session = new LocalSession(settings.name);
  const go = () => { session.start(); startGame(); };
  if (skipIntro) go(); else playIntro(C.INTRO.solo, go);
}

function failLoad(e) {
  console.error(e);
  show('loading');
  $('#loadMsg').textContent = 'No se pudo cargar el faro. Comprueba tu conexión y recarga la página.';
}

// duración real de la presentación narrada (cooperativo: el reloj de todos arranca al terminar)
function introMs(lines) {
  if (!audio.manifest || !lines.every(([vo]) => audio.manifest[vo])) return C.COOP_INTRO_MS;
  const ms = 600 + lines.reduce((a, [vo]) => a + audio.info(vo).dur * 1000 + 500, 0) + 1500;
  return Math.round(Math.max(20000, Math.min(60000, ms)));
}

// Presentación narrada: cada párrafo aparece cuando el narrador lo dice
function playIntro(lines, onDone, autoMs = 0) {
  show('intro');
  const box = $('#introText'), act = $('#introActions');
  box.innerHTML = ''; act.innerHTML = '';
  const ps = lines.map(([, t]) => h('p', { text: t }));
  box.append(...ps);
  let done = false, cur = null;
  const finish = () => { if (done) return; done = true; if (cur && cur.stop) cur.stop(); onDone(); };
  audio.mood('dark');
  (async () => {
    await wait(600);
    for (let i = 0; i < lines.length && !done; i++) {
      ps[i].classList.add('on');
      const dur = (audio.info(lines[i][0]).dur || 4) * 1000;
      if (settings.sound) { cur = await audio.narrate(lines[i][0]); await Promise.race([cur.ended, wait(dur + 800)]); cur = null; }
      else await wait(settings.reduce ? 900 : Math.min(4500, lines[i][1].length * 45));
      if (done) return;
      await wait(500);
    }
    if (!done && !autoMs) act.prepend(h('button', { class: 'btn primary', text: 'Entrar en el faro', onclick: finish }));
  })();
  if (autoMs) { act.append(h('p', { class: 'fine', text: 'La partida empieza para todos al terminar la presentación…' })); setTimeout(finish, autoMs); return; }
  act.append(h('button', { class: 'btn ghost small', text: 'Saltar', onclick: finish }));
}

// ------------------------------------------------------------------ SALA DE ESPERA (cooperativo)
function openLobby(code = null, broker = null) {
  if (gfx) { gfx.stop(); gfx = null; }
  show('lobby');
  const body = $('#lobbyBody');
  $('#lobbyBack').onclick = () => { if (session && session.leave) session.leave(); session = null; location.href = location.pathname; };
  const nameIn = h('input', { class: 'input', id: 'nm', maxlength: '20', placeholder: 'Tu nombre', value: settings.name, autocomplete: 'nickname' });
  const codeIn = h('input', { class: 'input code', id: 'cd', maxlength: '6', placeholder: 'CÓDIGO', value: code || '', autocapitalize: 'characters' });
  const err = h('p', { class: 'fine', style: { color: '#ffb4ab' } });
  const saveName = () => { settings.name = nameIn.value.trim().slice(0, 20); store('nwo.name', settings.name); };
  const connect = async (create) => {
    saveName();
    if (!settings.name) { err.textContent = 'Escribe tu nombre para que el grupo sepa quién eres.'; nameIn.focus(); return; }
    if (!create && codeIn.value.trim().length < 6) { err.textContent = 'El código tiene 6 caracteres.'; return; }
    err.textContent = 'Conectando…';
    await audio.init(); audio.setMuted(!settings.sound);
    audio.preload(C.INTRO.coop.map(l => l[0]));
    const brokerUrl = params.get('broker') || null;
    if (create) {
      session = new NetSession({ base: BASE, name: settings.name, brokerUrl });
      try { await session.connect(true); } catch (e) { err.textContent = 'No se pudo conectar. Revisa tu conexión (wifi o datos) y vuelve a intentarlo.'; session = null; return; }
      return roomView();
    }
    // unirse: la sala tiene que existir (su anfitrión publica el estado). Con enlace se sabe el bróker; con código se buscan todos.
    const roomCode = codeIn.value.trim().toUpperCase();
    const tryJoin = async (bi, waitMs) => {
      const sx = new NetSession({ base: BASE, name: settings.name, code: roomCode, broker: bi, brokerUrl });
      try { await sx.connect(false); } catch (e) { return null; }
      if (sx.lobby) return sx;
      const found = await new Promise((res) => { const off = sx.on('lobby', () => { off(); res(true); }); setTimeout(() => res(!!sx.lobby), waitMs); });
      if (found) return sx;
      sx.leave(); return null;
    };
    const candidates = brokerUrl ? [null] : (broker != null && roomCode === code ? [broker] : BROKERS.map((_, i) => i));
    session = null;
    for (const bi of candidates) {
      err.textContent = 'Buscando la sala…';
      session = await tryJoin(bi, candidates.length === 1 ? 9000 : 4500);
      if (session) break;
    }
    if (!session) { err.textContent = `No encuentro la sala ${roomCode}. Comprueba el código o pide a tu amigo un enlace nuevo. Revisa también tu conexión (wifi o datos).`; return; }
    roomView();
  };
  const host = (params.get('de') || '').slice(0, 20);
  body.innerHTML = '';
  if (code) {
    // llegada por invitación: directo a lo importante
    body.append(
      h('div', { class: 'card invite-card' },
        h('div', { class: 'eyebrow', style: { color: 'var(--amber)' }, text: `Invitación · sala ${code}` }),
        h('h2', {}, host ? `${host} te reta a salir ` : 'Te retan a salir ', h('em', { text: 'de NOWAYOUT' })),
        h('p', { text: 'Sala 0 · «La Última Frecuencia». Un faro en plena tormenta, una radio que habla con 1996 y 15 minutos antes de la pleamar. Cada uno verá una parte del faro: solo saldréis si os contáis todo.' }),
        h('p', { class: 'fine', text: 'Se juega en el navegador, con wifi o datos. Mejor con auriculares.' }),
        h('div', { class: 'field' }, h('label', { for: 'nm', text: 'Tu nombre' }), nameIn),
        h('button', { class: 'btn primary', text: 'Entrar en la sala', onclick: () => connect(false) }),
        err),
      h('details', { class: 'card' }, h('summary', { class: 'eyebrow', text: '¿Otro código?' }), h('div', { class: 'split', style: { marginTop: '10px' } }, codeIn)));
    ensureWorld();
    return;
  }
  body.append(
    h('div', { class: 'card split' },
      h('div', { class: 'eyebrow', text: 'Jugar con amigos · 2 a 4 personas' }),
      h('p', { style: { margin: 0, lineHeight: 1.5 }, text: 'Cada jugador abre la web en su móvil u ordenador. Uno crea la sala y comparte el enlace; los demás entran con él y ya estáis conectados en directo.' }),
      h('div', { class: 'field' }, h('label', { for: 'nm', text: 'Tu nombre' }), nameIn)),
    h('div', { class: 'card split' },
      h('button', { class: 'btn primary', text: 'Crear sala', onclick: () => connect(true) }),
      h('div', { class: 'eyebrow', style: { textAlign: 'center' }, text: 'o únete con un código' }),
      codeIn,
      h('button', { class: 'btn', text: 'Unirme', onclick: () => connect(false) }),
      err),
    h('p', { class: 'fine', text: 'Consejo: jugad en llamada de voz o en la misma habitación. También hay chat dentro de la partida.' }));
  ensureWorld();
}

function roomView() {
  const body = $('#lobbyBody');
  const hostName = ((session.lobby && session.presence[session.lobby.host] && session.presence[session.lobby.host].n) || (session.isHost ? settings.name : '')).slice(0, 20);
  const link = `${location.origin}${location.pathname}?sala=${session.code}&b=${session.brokerIdx}${hostName ? '&de=' + encodeURIComponent(hostName) : ''}`;
  const invite = `🔒 NOWAYOUT · No hay salida… para quien no piensa.\n\nSala 0: «La Última Frecuencia». Un faro en plena tormenta, una radio que habla con 1996 y 15 minutos antes de la pleamar. Una sola decisión, sin vuelta atrás.\n\nTe reto a encontrar la salida conmigo. ¿Tu cabeza aguanta la presión?\n\n👉 ${link}\nCódigo de sala: ${session.code}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(invite)}`;
  const status = h('div', { class: 'net-status ok', text: 'Conectado' });
  const players = h('ul', { class: 'players' });
  const roles = h('div', { class: 'roles' });
  const readyBtn = h('button', { class: 'btn', onclick: () => { session.setReady(!session.ready); render(); } });
  const startBtn = h('button', { class: 'btn primary', text: 'Empezar partida', onclick: () => session.startGame(introMs(C.INTRO.coop)) });
  const startNote = h('p', { class: 'fine' });
  const linkIn = h('input', { class: 'input mono', readonly: true, value: link, 'aria-label': 'Enlace de la sala', onclick: (e) => e.target.select() });
  const copyBtn = h('button', { class: 'btn small', text: 'Copiar enlace', onclick: async () => { try { await navigator.clipboard.writeText(link); copyBtn.textContent = 'Copiado'; } catch (e) { linkIn.select(); copyBtn.textContent = 'Selecciónalo y cópialo'; } } });
  let loaded = false;
  ensureWorld().then(() => { loaded = true; render(); }).catch(() => {});
  function render() {
    const pres = session.presence;
    const lobby = session.lobby || {};
    players.innerHTML = '';
    const ids = Object.keys(pres).sort((a, b) => (a === lobby.host ? -1 : b === lobby.host ? 1 : (pres[a].t || 0) - (pres[b].t || 0)));
    for (const pid of ids) {
      const p = pres[pid];
      players.append(h('li', { class: 'player on' }, h('span', { class: 'st' }),
        h('div', { style: { minWidth: 0 } }, h('div', { class: 'nm', text: (p.n || 'Sin nombre') + (pid === session.me ? ' (tú)' : '') + (pid === lobby.host ? ' · anfitrión' : '') }), h('div', { class: 'rl', text: (p.r || []).map(r => C.ROLES[r].name).join(', ') || 'Sin rol elegido' })),
        h('span', { class: 'ready' + (p.rd ? ' yes' : ''), text: p.rd ? 'LISTO' : 'esperando' })));
    }
    roles.innerHTML = '';
    for (const r of C.ROLE_ORDER) {
      const who = ids.filter(pid => (pres[pid].r || []).includes(r)).map(pid => pres[pid].n);
      roles.append(h('button', { class: 'role', 'aria-pressed': session.claims.includes(r), onclick: () => { session.claimRole(r); render(); } },
        h('b', { text: C.ROLES[r].name }), h('span', { text: C.ROLES[r].short }), h('span', { class: 'who', text: who.length ? who.join(', ') : 'libre' })));
    }
    readyBtn.textContent = !loaded ? 'Cargando el faro…' : session.ready ? 'Estoy listo (pulsa para cancelar)' : 'Marcar como listo';
    readyBtn.disabled = !loaded;
    readyBtn.className = 'btn' + (session.ready ? ' primary' : '');
    const n = ids.length, allReady = ids.length > 0 && ids.every(pid => pres[pid].rd);
    startBtn.hidden = !session.isHost;
    startBtn.disabled = !(allReady && n >= 1 && n <= 4);
    startNote.textContent = session.isHost ? (n > 4 ? 'Máximo 4 jugadores.' : allReady ? 'Todo listo. Los roles libres se repartirán solos.' : 'Esperando a que todos marquen «listo».') : 'El anfitrión empezará cuando todos estéis listos.';
  }
  body.innerHTML = '';
  body.append(
    h('div', { class: 'card split' },
      h('div', { class: 'row', style: { alignItems: 'center' } }, h('div', { class: 'eyebrow', text: 'Código de la sala' }), status),
      h('div', { class: 'code-big', text: session.code }),
      h('a', { class: 'btn primary', href: wa, target: '_blank', rel: 'noopener', text: 'Invitar por WhatsApp' }),
      h('div', { class: 'row' }, linkIn, copyBtn),
      h('p', { class: 'fine', text: 'Se abre WhatsApp con un mensaje y el enlace de la sala; tú eliges a quién se lo envías.' })),
    h('div', { class: 'card split' }, h('div', { class: 'eyebrow', text: 'Jugadores conectados' }), players),
    h('div', { class: 'card split' }, h('div', { class: 'eyebrow', text: 'Roles (elige uno o varios)' }), h('p', { class: 'fine', text: 'Cada rol solo puede entrar en su planta del faro y ve cosas que los demás no ven. Con menos de 4 jugadores, alguien llevará dos roles.' }), roles),
    h('div', { class: 'split' }, readyBtn, startBtn, startNote));
  session.on('presence', render);
  session.on('lobby', render);
  session.on('net', (st) => { status.className = 'net-status ' + (st === 'ok' ? 'ok' : 'bad'); status.textContent = st === 'ok' ? 'Conectado' : st === 'reconnecting' ? 'Reconectando…' : 'Sin conexión'; });
  session.on('started', async () => {
    if (!session.state || !session.state.players[session.me]) { body.prepend(h('div', { class: 'card', style: { borderColor: '#5a2620' }, text: 'Esta partida ya está en marcha sin ti. Pide al grupo que cree otra sala.' })); return; }
    try { await loadingScreen(); } catch (e) { return failLoad(e); }
    if (game) return;
    // el reloj de todos arranca en t0, justo al acabar la presentación narrada
    const toStart = session.state.t0 - session.now();
    if (toStart < 2500) startGame(); else playIntro(C.INTRO.coop, () => startGame(), toStart);
  });
  if (session.lobby && session.lobby.phase === 'game' && session.state && session.state.players[session.me]) { loadingScreen().then(() => { if (!game) startGame(); }); }
  render();
}

// ------------------------------------------------------------------ PARTIDA
const NODES_BY_FLOOR = { f2: ['f2_console', 'f2_tx', 'f2_breakers', 'f2_window'], f3: ['f3_lens', 'f3_kero', 'f3_sea'], f1: ['f1_desk', 'f1_cork', 'f1_cab'], f0: ['f0_chart', 'f0_door', 'f0_batt'] };
const FLOOR_OF_ROLE = { radio: 'f2', linterna: 'f3', archivo: 'f1', carta: 'f0' };
const FLOOR_ORDER = ['f3', 'f2', 'f1', 'f0'];

const HS = {
  breakers: { label: 'Cuadro eléctrico', act: (g) => g.panel('breakers') },
  rx: { label: 'Receptor de onda media', act: (g) => g.panel('rx') },
  vhf: { label: 'VHF', act: (g) => g.panel('vhf') },
  tx: { label: 'Transmisor', act: (g) => g.panel('tx') },
  clock: { label: 'Reloj', act: (g) => g.inspect('Reloj de la sala de radio', ['Los sectores rojos marcan los minutos de silencio de la vieja frecuencia de socorro en voz; los verdes, los del Morse. Ya nadie los respeta.', `Son las ${g.clockText()}.`]) },
  workorder: { label: 'Orden de trabajo', act: (g) => g.doc('workorder') },
  drawing: { label: 'Mochila', act: (g) => g.doc('drawing') },
  window_f2: { label: 'Ventana', act: (g) => g.inspect('Ventana', ['El mar revienta contra el cabo, sesenta metros más abajo.', 'Por encima, el haz del faro barre la lluvia: tres destellos seguidos… y quince segundos hasta el siguiente grupo.']) },
  ladder: { label: 'Subir a la linterna', nav: 'f3' },
  stairs_down_f2: { label: 'Bajar al archivo', nav: 'f1' },
  lens: { label: 'Óptica', act: (g) => g.inspect('La óptica', [g.state.f.lamp ? 'La gran lente gira despacio alrededor de la lámpara. Tres paneles juntos lanzan tres destellos seguidos; luego, oscuridad.' : 'La lámpara está apagada. La lente gira a oscuras.', 'Cuentas: uno, dos, tres… y quince segundos hasta el siguiente grupo.']) },
  lampswitch: { label: 'Interruptor de la linterna', act: (g) => g.panel('lamp') },
  clockwork: { label: 'Relojería', act: (g) => g.panel('gears') },
  kerosene: { label: 'Reserva de queroseno', act: (g) => g.panel('kero') },
  kbox: { label: 'Caja de la reserva', act: (g) => { g.world.setState({ lidOpen: true }); g.panel('kbox'); } },
  binoculars: { label: 'Prismáticos', act: (g) => g.binoculars(true) },
  vhf_lantern: { label: 'Altavoz VHF', act: (g) => g.panel('vhf') },
  hatch: { label: 'Bajar a la sala de radio', nav: 'f2' },
  logbook: { label: 'Libros de guardia', act: (g) => g.doc('logbook') },
  dossier: { label: 'Archivador', act: (g) => g.doc('dossier') },
  cork: { label: 'Tablón de corcho', act: (g) => g.panel('cork') },
  phone: { label: 'Teléfono', act: (g) => g.doc('phone') },
  calendar: { label: 'Calendario', act: (g) => g.doc('calendar') },
  shelf: { label: 'Estantería', act: (g) => g.inspect('Estantería', ['Archivadores de veinte años de guardias, cartas viejas y el manual de la estación.'], [{ label: 'Leer el Manual de la estación', primary: true, fn: () => g.doc('manual') }]) },
  window_f1: { label: 'Ventana', act: (g) => g.inspect('Ventana', ['Lluvia de lado. El haz del faro pasa por encima: tres destellos, y otra vez la noche.']) },
  stairs_up_f1: { label: 'Subir a la sala de radio', nav: 'f2' },
  stairs_down_f1: { label: 'Bajar a la planta baja', nav: 'f0' },
  chart: { label: 'Carta náutica', act: (g) => g.panel('chart') },
  libro: { label: 'Libro de Faros', act: (g) => g.doc('libro') },
  tides: { label: 'Tabla de mareas', act: (g) => g.doc('tides') },
  door: { label: 'Puerta', act: (g) => g.inspect('La puerta', ['Atrancada. Por debajo entra agua a cada golpe de mar.', 'Al otro lado, el temporal ha cubierto el camino. No hay forma de salir por aquí esta noche.']) },
  switch: { label: 'Cuadro de baterías', act: (g) => g.panel('switch') },
  batteries: { label: 'Baterías', act: (g) => g.inspect('Banco de baterías', ['Treinta y seis vasos de plomo. Los amperímetros marcan lo que tira la linterna.', g.state.f.surge ? 'El agua ya moja el zócalo. Si llega a los bornes…' : 'El suelo está húmedo. La pleamar de las 23:52 está marcada en la tabla de mareas.']) },
  stairs_up_f0: { label: 'Subir al archivo', nav: 'f1' },
};

class Game {
  constructor(sess) {
    this.session = sess;
    this.world = world;
    this.state = sess.state;
    this.seen = new Set(store('nwo.seenHs') || []);
    this.docsSeen = [];
    this.heardLog = [];
    this.seenKeys = new Set();
    this.queues = { mf: [], vhf: [] };
    this.playing = { mf: false, vhf: false };
    this.callLogData = null;
    this.ended = false;
    this.narrQ = [];
    this.lastFlags = {};
    this.zapPh = -1;
    this.hsEls = {};
    this.binoc = false;
    this.nodeIdx = 0;
  }

  // ---------------------------------------------------- contexto para los paneles
  ctx() {
    const g = this;
    return {
      state: () => g.state, dispatch: (a) => g.session.dispatch(a), audio, world: g.world, now: () => g.session.now(),
      me: g.session.me, isCoop: g.session.mode === 'coop', hasRole: (r) => g.roles().includes(r),
      openDoc: (id) => g.doc(id), markDoc: (id) => { if (!g.docsSeen.includes(id)) g.docsSeen.push(id); g.onDocRead(id); },
      seenDocs: () => g.docsSeen, heard: () => g.heardLog, subOf: (id) => audio.info(id).sub || '',
      openJournal: (tab) => g.panels.open('journal', tab), callLog: () => g.callLogData, playVoicemail: () => g.voicemail(),
      clockText: () => g.clockText(), toast: (t) => g.toast(t), myName: () => settings.name || (g.state.players[g.session.me] || {}).n || '',
      flashScreen: () => g.flashScreen(),
      onPanel: (id, open) => { if (id === 'kbox' && !open) g.world.setState({ lidOpen: false }); },
    };
  }

  roles() { return this.session.myRoles(); }
  canFloor(f) { if (this.session.mode === 'solo') return true; return this.roles().some(r => FLOOR_OF_ROLE[r] === f); }
  hears(ch) { if (this.session.mode === 'solo') return true; const r = this.roles(); return ch === 'mf' ? r.includes('radio') : (r.includes('radio') || r.includes('linterna')); }
  clockText() { const c = S.worldClock(this.state, this.session.now()); return `${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}`; }

  start() {
    show('game');
    this.buildHud();
    this.panels = new Panels($('#game'), this.ctx());
    this.phone = new PhoneCall(audio);
    this.world.setQuality(settings.quality === 'auto' ? this.world.quality : settings.quality);
    this.world.reduceMotion = settings.reduce;
    this.world.on('lightning', (d) => audio.thunder(d.delay, d.strength));
    this.world.on('node', (n) => { audio.setFloor(n.floor); this.renderFloors(); this.buildHotspots(); });
    // papeles 3D
    this.world.setPaper('cork_board', corkCanvas());
    this.world.setPaper('workorder', workorderCanvas(settings.name || (this.state.players[this.session.me] || {}).n));
    this.world.setPaper('drawing', drawingCanvas());
    this.world.setPaper('calendar', calendarCanvas());
    this.refreshChartPaper();
    // nodo inicial según el rol
    const r = this.roles();
    const first = this.session.mode === 'solo' || r.includes('radio') ? 'f2' : FLOOR_OF_ROLE[r[0]] || 'f2';
    this.world.goNode(NODES_BY_FLOOR[first][0], true);
    this.applyWorld(this.state);
    // eventos ya pasados (reconexión): sin audio
    const now = this.session.now();
    for (const e of this.state.log) if (now - e.t > 20000) { this.seenKeys.add(e.id + '@' + e.t); if (this.hears((C.RADIO[e.id] || {}).ch)) this.heardLog.push(e); }
    this.unsub = this.session.on('state', (s) => this.onState(s));
    this.onState(this.state);
    this.bindInput();
    audio.preload(['r96_mayday1', 'r96_fisterra1', 'r96_grilo1', 'r96_andres1', 'vhf_salv1', 'call_r01', 'call_r02']);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    audio.mood('dark');
    if (first === 'f2' && !this.state.f.power) setTimeout(() => this.narr('Está todo a oscuras. Arrastra para mirar alrededor y toca los puntos de luz.', 5500), 900);
    else if (this.session.mode === 'coop') setTimeout(() => this.narr(`Tu planta: ${C.FLOORS[first].name}. Cada uno ve cosas distintas: contadlo todo.`, 5500), 900);
    if (TEST) window.__nwo = { game: this, session: this.session, world: this.world, S, C };
  }

  buildHud() {
    const right = $('#hudRight'); right.innerHTML = '';
    this.muteBtn = iconBtn(settings.sound ? 'sound' : 'mute', 'Sonido', () => { settings.sound = !settings.sound; store('nwo.sound', settings.sound); audio.setMuted(!settings.sound); this.muteBtn.innerHTML = ICON[settings.sound ? 'sound' : 'mute']; });
    right.append(this.muteBtn, iconBtn('menu', 'Menú', () => this.menu()));
    const act = $('#actions'); act.innerHTML = '';
    act.append(h('button', { class: 'btn', onclick: () => this.panels.open('journal') }, h('span', { html: ICON.book, style: { width: '18px', display: 'inline-grid' } }), 'Cuaderno'));
    act.append(h('button', { class: 'btn', onclick: () => this.panels.open('hints') }, 'Pistas'));
    if (this.session.mode === 'coop') {
      this.chatBadge = h('span', { class: 'badge', hidden: true, text: '0' });
      act.append(h('button', { class: 'btn', onclick: () => { this.chatSeen = (this.state.chat || []).length; this.chatBadge.hidden = true; this.panels.open('chat'); } }, 'Equipo', this.chatBadge));
      // la votación final se hace desde cualquier planta (por el interfono del faro)
      this.decideBtn = h('button', { class: 'btn primary', hidden: true, onclick: () => this.panels.open('switch', { remote: true }) }, 'Votar');
      act.append(this.decideBtn);
    }
    $('#navL').innerHTML = ICON.left; $('#navR').innerHTML = ICON.right;
    $('#navL').onclick = () => this.stepNode(-1); $('#navR').onclick = () => this.stepNode(1);
    this.renderFloors();
  }

  renderFloors() {
    const nav = $('#floors'); nav.innerHTML = '';
    const cur = this.world.floor;
    for (const f of FLOOR_ORDER) {
      const can = this.canFloor(f);
      let who = '';
      if (this.session.mode === 'coop') who = Object.values(this.state.players).filter(p => (p.r || []).some(r => FLOOR_OF_ROLE[r] === f)).map(p => p.n).join(', ');
      nav.append(h('button', { 'aria-current': cur === f, class: can ? '' : 'locked', onclick: () => this.goFloor(f) }, C.FLOORS[f].name, h('small', { text: this.session.mode === 'coop' ? (who || '—') : C.FLOORS[f].sub })));
    }
  }

  goFloor(f) {
    if (this.binoc) this.binoculars(false);
    if (f === this.world.floor) return;
    if (!this.canFloor(f)) { const who = Object.values(this.state.players).filter(p => (p.r || []).some(r => FLOOR_OF_ROLE[r] === f)).map(p => p.n).join(', '); this.toast(`Esa planta la lleva ${who || 'otro jugador'}. Pídele que te cuente lo que ve.`); return; }
    this.panels.close();
    this.world.fade(1);
    audio.steps(5);
    this.steps = (this.steps || 0) + Math.abs(FLOOR_ORDER.indexOf(f) - FLOOR_ORDER.indexOf(this.world.floor)) * 22;
    setTimeout(() => { this.world.goNode(NODES_BY_FLOOR[f][0], true); this.nodeIdx = 0; setTimeout(() => this.world.fade(0), 120); }, settings.reduce ? 60 : 380);
  }

  stepNode(d) {
    if (this.binoc) return;
    const list = NODES_BY_FLOOR[this.world.floor];
    this.nodeIdx = (list.indexOf(this.world.node.name) + d + list.length) % list.length;
    this.world.goNode(list[this.nodeIdx]);
  }

  bindInput() {
    const cv = $('#gl');
    let down = false, lx = 0, ly = 0;
    cv.addEventListener('pointerdown', (e) => { down = true; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
    cv.addEventListener('pointermove', (e) => { if (!down) return; this.world.dragLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; });
    const up = () => { down = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (e.key === 'Escape') { if (this.binoc) this.binoculars(false); else this.panels.close(); }
      if (e.key === 'ArrowLeft' && !this.panels.isOpen()) this.stepNode(-1);
      if (e.key === 'ArrowRight' && !this.panels.isOpen()) this.stepNode(1);
    });
  }

  buildHotspots() {
    const root = $('#hotspots'); root.innerHTML = ''; this.hsEls = {};
    const meta = this.world.meta.hotspots;
    for (const [id, m] of Object.entries(meta)) {
      if (m.floor !== this.world.floor || !HS[id]) continue;
      const def = HS[id];
      if (def.nav && !this.canFloor(def.nav)) continue;
      const el = h('button', { class: 'hs' + (def.nav ? ' nav' : '') + (this.seen.has(id) ? ' seen' : ''), 'aria-label': def.label, onclick: () => this.useHotspot(id) }, h('span', { class: 'ring' }), h('span', { class: 'lbl', text: def.label }));
      root.appendChild(el);
      this.hsEls[id] = { el, pos: m.pos };
    }
  }

  useHotspot(id) {
    const def = HS[id];
    if (!def) return;
    if (!this.seen.has(id)) { this.seen.add(id); store('nwo.seenHs', [...this.seen]); if (this.hsEls[id]) this.hsEls[id].el.classList.add('seen'); }
    if (def.nav) return this.goFloor(def.nav);
    if (id === 'rx' && !this.state.f.power) return this.inspect('Receptor de onda media', ['Un receptor de los años ochenta, gris y pesado. El dial está apagado: la sala no tiene corriente.']);
    def.act(this);
  }

  panel(id, arg) { this.panels.open(id, arg); }
  doc(id) { this.panels.open('doc', id); }
  inspect(title, lines, actions) { this.panels.open('inspect', { title, lines, actions }); }

  onDocRead(id) {
    if (id === 'page' && !this._pageNarr) { this._pageNarr = true; setTimeout(() => { audio.sfx('sting'); this.narrVoice(C.NARRATION.page); }, 900); }
  }

  binoculars(on) {
    this.binoc = on;
    this.world.setBinoculars(on, 236);
    $('#hotspots').hidden = on; $('#navL').hidden = on; $('#navR').hidden = on;
    this.panels.close();
    if (on) {
      this.binocUi = h('div', { style: { position: 'absolute', inset: '0', zIndex: 8, pointerEvents: 'none', boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0)', background: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 34%, rgba(0,0,0,.92) 36%)' } });
      this.binocBar = h('div', { style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(var(--safe-b) + 128px)', zIndex: 9, display: 'grid', gap: '8px', justifyItems: 'center' } },
        h('div', { class: 'status', id: 'azi', text: 'Demora 236°' }),
        h('p', { class: 'fine', style: { margin: 0, textAlign: 'center', maxWidth: '30ch', color: '#cfc8b9' }, text: 'Arrastra para recorrer el horizonte. Fíjate en el ritmo de cada luz.' }),
        h('button', { class: 'btn', text: 'Bajar los prismáticos', onclick: () => this.binoculars(false) }));
      $('#game').append(this.binocUi, this.binocBar);
    } else {
      this.binocUi && this.binocUi.remove(); this.binocBar && this.binocBar.remove();
    }
  }

  async refreshChartPaper() {
    const key = JSON.stringify(this.state.chart);
    if (key === this._chartKey) return;
    this._chartKey = key;
    try { this.world.setPaper('chart_paper', await chartCanvas(this.state.chart)); } catch (e) {}
  }

  // ---------------------------------------------------- estado
  onState(s) {
    const prev = this.state;
    this.state = s;
    if (prev && s.t0 !== prev.t0) { this.restart(); return; }
    if (this.ended) return;
    this.applyWorld(s);
    this.processLog(s);
    this.renderObjectives(s);
    this.panels && this.panels.update(s);
    this.refreshChartPaper();
    const f = s.f, pf = this.lastFlags;
    if (f.call === 'ringing' && !this.callStarted) this.startCall();
    if (f.cross && !pf.cross && (this.session.mode === 'solo' || this.roles().includes('carta'))) { audio.sfx('sting'); this.narr(C.NARRATION.cross, 6000); }
    if (f.surge && !pf.surge) { audio.sfx('water'); this.world.alert(0.8); setTimeout(() => this.narrVoice(C.NARRATION.surge, true), 1800); }
    if (pf.lamp === 1 && f.lamp === 0) this.world.alert(0.6);
    if (f.call === 'ringing' && pf.call !== 'ringing') this.world.alert(0.5);
    if (f.maree === 'calling' && pf.maree !== 'calling' && this.hears('vhf')) this.toast('Canal 16: un velero pide ayuda.');
    if (this.session.mode === 'coop') {
      if (this.decideBtn) this.decideBtn.hidden = !(f.cover && !f.sw);
      const chatN = (s.chat || []).length;
      if (this.chatBadge && chatN > (this.chatSeen || 0) && !(this.panels.cur && this.panels.cur.id === 'chat')) { this.chatBadge.hidden = false; this.chatBadge.textContent = String(chatN - (this.chatSeen || 0)); }
      if (JSON.stringify(s.players) !== JSON.stringify(prev && prev.players)) { this.renderFloors(); this.buildHotspots(); }
    }
    if (f.keroFlares > (pf.keroFlares || 0)) this.flashScreen();
    this.lastFlags = { ...f };
    if (s.phase === 'ending') this.runEnding(s);
  }

  applyWorld(s) {
    const f = s.f;
    const now = this.session.now();
    this.world.setState({
      lampOn: !!f.lamp, keroLit: !!f.keroLit, coverOff: !!f.cover, sw: f.sw,
      power: { f0: 1, f1: 1, f2: f.power ? 1 : 0, f3: 1 },
      txWarm: f.txWarm ? 1 : f.txWarmAt ? 0.4 : 0,
    });
  }

  renderObjectives(s) {
    const ul = $('#objs ul');
    const objs = S.objectives(s);
    const key = objs.join(',');
    if (key === this._objKey) return;
    const changed = this._objKey !== undefined;
    this._objKey = key;
    ul.innerHTML = '';
    for (const o of objs) ul.append(h('li', { text: C.OBJECTIVES[o] }));
    if (changed) { $('#objs').classList.remove('flash'); void $('#objs').offsetWidth; $('#objs').classList.add('flash'); }
  }

  processLog(s) {
    const now = this.session.now();
    for (const e of s.log) {
      const key = e.id + '@' + e.t;
      if (this.seenKeys.has(key)) continue;
      this.seenKeys.add(key);
      const meta = C.RADIO[e.id];
      if (!meta || !this.hears(meta.ch)) continue;
      this.queues[meta.ch].push(e);
      audio.preload([e.id]);
    }
  }

  pumpRadio() {
    const now = this.session.now();
    // una voz cada vez: ni durante la llamada, ni mientras habla el narrador, ni encima de otra emisora
    if (this.phone && this.phone.el) return;
    if (audio._narrN > 0 || this.playing.mf || this.playing.vhf) return;
    for (const ch of ['mf', 'vhf']) {
      if (this.playing.mf || this.playing.vhf) break;
      if (!this.queues[ch].length) continue;
      const e = this.queues[ch][0];
      if (now < e.t) continue;
      this.queues[ch].shift();
      this.playEvent(e, ch);
    }
  }

  async playEvent(e, ch) {
    this.playing[ch] = true;
    this.heardLog.push(e);
    const meta = C.RADIO[e.id];
    const away = ch === 'mf' ? this.world.floor !== 'f2' : !['f2', 'f3'].includes(this.world.floor);
    const noisy = ch === 'mf' && !S.clearNow(this.state);
    const sub = audio.info(e.id).sub || '';
    const p = await audio.playVoice(e.id, { bus: ch, noisy });
    const el = this.showSub(meta.who + (away ? (ch === 'mf' ? ' · desde la sala de radio' : ' · desde el VHF') : ''), noisy ? garble(sub) : sub, ch, (p.dur || audio.info(e.id).dur || 3) * 1000);
    if (this.panels.cur && ['rx', 'vhf', 'journal'].includes(this.panels.cur.id)) this.panels.update(this.state);
    await Promise.race([p.ended, wait((p.dur || 3) * 1000 + 600)]);
    setTimeout(() => el.remove(), 900);
    this.playing[ch] = false;
    if (e.id === 'r96_andres1') { audio.sfx('sting'); this.narrVoice(C.NARRATION.grilo); }
    if (e.id === 'r96_xose_off') this.narr(C.NARRATION.lampOff, 5500);
  }

  showSub(who, text, ch, durMs = 0) {
    const box = $('#subs');
    const body = h('span', { class: 'txt' });
    const el = h('div', { class: 'sub' + (ch === 'vhf' ? ' vhf' : ch === 'phone' ? ' phone' : '') }, h('span', { class: 'who', text: who }), body);
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove();
    // los mensajes largos se muestran frase a frase, al ritmo de la voz (no tapan la pantalla del móvil)
    const parts = text.length > 110 && durMs ? text.match(/[^.!?¿¡]*[¡¿]?[^.!?]*[.!?…]+["»”]?\s*|[^.!?]+$/g).reduce((a, x) => { x = x.trim(); if (!x) return a; if (a.length && (a[a.length - 1] + ' ' + x).length <= 95) a[a.length - 1] += ' ' + x; else a.push(x); return a; }, []) : [text];
    if (parts.length <= 1) { body.textContent = text; return el; }
    const total = parts.reduce((a, x) => a + x.length, 0);
    let i = 0;
    const next = () => { if (!el.isConnected || i >= parts.length) return; body.textContent = parts[i]; setTimeout(next, durMs * parts[i].length / total); i++; };
    next();
    return el;
  }

  // frase del narrador con voz (solo en los momentos importantes)
  narrVoice(entry, low = false) {
    const e = this.session.mode === 'coop' ? entry.coop : entry.solo;
    const host = Object.values(this.state.players).find(p => p.host);
    const dur = (audio.info(e.vo).dur || 4) * 1000;
    this.narr(e.t.replace('{HOST}', (host && host.n) || 'tu compañero'), Math.max(5500, dur + 1500), low);
    if (settings.sound) audio.narrate(e.vo);
  }

  narr(text, ms = 5000, low = false) {
    const el = $('#narr');
    el.classList.toggle('low', !!low);
    el.textContent = text; el.classList.add('on');
    clearTimeout(this._narrT);
    this._narrT = setTimeout(() => el.classList.remove('on'), ms);
  }

  toast(text, ms = 4200) {
    const t = h('div', { class: 'toast', role: 'status', text });
    $('#game').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  flashScreen() {
    const f = h('div', { style: { position: 'absolute', inset: 0, background: '#ffcf7a', opacity: 0.85, zIndex: 25, pointerEvents: 'none', transition: 'opacity .9s' } });
    $('#game').appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = 0; });
    setTimeout(() => f.remove(), 1000);
  }

  // ---------------------------------------------------- llamada de Ramón
  callMask() {
    if (this.session.mode === 'solo') return null;
    const active = Object.entries(this.state.players).filter(([pid, p]) => !p.away).map(([pid]) => pid).sort((a, b) => (this.state.players[a].i ?? 0) - (this.state.players[b].i ?? 0));
    const n = Math.min(4, active.length);
    if (n <= 1) return null;
    const idx = Math.max(0, active.indexOf(this.session.me));
    return new Set(C.CALL_MASKS[n][idx % n]);
  }

  startCall() {
    this.callStarted = true;
    this.panels.close();
    if (this.binoc) this.binoculars(false);
    const mask = this.callMask();
    this.phone.ring({
      caller: C.CALL.caller, sub: C.CALL.number, segs: C.CALL.segs, mask, line: true, breathAfter: 9, gapMs: C.CALL.gapMs,
      subOf: (id) => audio.info(id).sub,
      onAnswer: () => this.session.dispatch({ t: 'callActive' }),
      onEnd: (r) => {
        const all = C.CALL.segs.map((id, i) => (!mask || mask.has(i)) ? audio.info(id).sub : '[ · · · la línea se corta · · · ]');
        if (r.missed) {
          this.callLogData = { missed: true, lines: [], mask };
          this.toast('Llamada perdida de «Faro Cabo Néboa». Te ha dejado un mensaje de voz en el Cuaderno.', 6000);
        } else if (r.hungEarly) {
          this.callLogData = { missed: true, cut: true, lines: r.heard.filter(i => !mask || mask.has(i)).map(i => audio.info(C.CALL.segs[i]).sub), mask };
          this.toast('Has colgado. «Faro Cabo Néboa» ha vuelto a llamar y te ha dejado un mensaje de voz en el Cuaderno.', 6500);
        } else {
          this.callLogData = { missed: false, lines: all, mask };
          if (mask) this.toast('Has oído solo trozos de la llamada. Los demás, otros. Juntadlos.', 6000);
        }
        this.session.dispatch({ t: 'callEnd' });
      },
    });
  }

  voicemail() {
    const mask = this.callMask();
    this.panels.close();
    this.phone.ring({
      caller: 'Mensaje de voz', sub: C.CALL.caller, segs: C.CALL.segs, mask, line: true, autoAnswer: true, breathAfter: 9, gapMs: C.CALL.gapMs,
      subOf: (id) => audio.info(id).sub,
      onEnd: (r) => { if (!r.hungEarly) this.callLogData = { missed: false, voicemail: true, lines: C.CALL.segs.map((id, i) => (!mask || mask.has(i)) ? audio.info(id).sub : '[ · · · la línea se corta · · · ]'), mask }; },
    });
  }

  menu() {
    const actions = [
      { label: settings.reduce ? 'Movimiento: reducido' : 'Movimiento: normal', fn: () => { settings.reduce = !settings.reduce; store('nwo.reduce', settings.reduce); this.world.reduceMotion = settings.reduce; this.menu(); } },
      { label: `Calidad: ${this.world.quality}`, fn: () => { const o = ['alta', 'media', 'baja']; const q = o[(o.indexOf(this.world.quality) + 1) % o.length]; settings.quality = q; store('nwo.quality', q); this.world.setQuality(q); this.menu(); } },
      ...((document.fullscreenEnabled || document.webkitFullscreenEnabled) && !STANDALONE ? [{ label: document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa', fn: () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFullscreen(); this.panels.close(); } }] : []),
      { label: 'Abandonar la partida', fn: () => this.inspect('¿Abandonar?', ['Saldrás del faro. La puerta de NOWAYOUT seguirá cerrada.'], [{ label: 'Sí, salir', primary: true, fn: () => { if (this.session.leave) this.session.leave(); location.href = location.pathname; } }]) },
    ];
    this.inspect('Menú', [`Sala 0 · La Última Frecuencia${this.session.mode === 'coop' ? ' · sala ' + this.session.code : ''}`], actions);
  }

  // ---------------------------------------------------- bucle
  loop() {
    if (this._stopped) return;
    requestAnimationFrame(this.loop);
    const s = this.state, now = this.session.now();
    this.world.clockTime = S.worldClock(s, now);
    this.world.setState({ surge: s.f.surge ? Math.min(1, (S.elapsed(s, now) - S.T.surge) / (5 * 60_000)) : 0 });
    this.world.frame();
    // reloj
    if (!this.ended) {
      const rem = S.remaining(s, now);
      $('#tLeft').textContent = fmtTime(rem);
      $('#tClock').textContent = this.clockText();
      const tm = $('#timer');
      tm.classList.toggle('warn', rem < 180000 && rem >= 60000);
      tm.classList.toggle('crit', rem < 60000);
      audio.setIntensity(1 - rem / C.ROOM.durationMs);
      // filtro de tensión: la imagen se cierra y se enfría según se acaba el tiempo; late en el último minuto
      let pulse = 0;
      if (rem < 60000) { const ph = (performance.now() / 860) % 1; pulse = Math.exp(-Math.pow(ph / 0.09, 2)) + 0.55 * Math.exp(-Math.pow((ph - 0.2) / 0.08, 2)); }
      // a partir de las 23:47 (5 min) la vista se va emborronando hasta las 23:52
      const blur = rem < 300000 ? Math.pow(1 - rem / 300000, 1.25) * 0.85 : 0;
      this.world.setTension(Math.pow(1 - rem / C.ROOM.durationMs, 1.5), Math.min(1, pulse), 1, blur);
      this.alerts(rem);
      if (rem < 60000 && !this._hb) { this._hb = true; audio.heartbeat(true); $('#vigRed').classList.add('on'); }
      // nada que hacer si el anfitrión no responde: el propio cliente comprueba el fin del tiempo
      if (rem <= 0 && this.session.mode === 'coop' && !this.session.isHost && s.phase === 'play' && now - (this._lastFailCheck || 0) > 4000) this._lastFailCheck = now;
    }
    this.pumpRadio();
    // ráfagas del balasto en la radio: una por destello (3 cada 15 s), aunque los fotogramas vayan lentos
    const ph = this.world.time % 15, lp = this._lastPh ?? ph;
    this._lastPh = ph;
    for (const c of [0, 0.86, 1.72]) {
      const crossed = lp <= ph ? (c > lp && c <= ph) : (c > lp || c <= ph);
      if (crossed && this.world.floor === 'f2' && this.hears('mf')) audio.zap();
    }
    // estado sonoro de la radio (si el panel del receptor está abierto, él manda)
    if (!(this.panels && this.panels.cur && this.panels.cur.id === 'rx') && now - (this._radioAt || 0) > 250) {
      this._radioAt = now;
      const f = s.f, sig = rxSignal(s.rx, f.power);
      const interf = !!(f.power && f.lamp && !(s.rx.nbOn && s.rx.nbP === 3 && s.rx.nbT === 15) && !f.locked && sig.prox > 0.2);
      audio.setRadio({ power: this.hears('mf') ? f.power : 0, prox: sig.prox, interference: interf, voice: audio.radio && audio.radio.voice });
    }
    if (this.panels) this.panels.tick(this.world.time);
    // puntos interactivos
    this.layoutHotspots();
    if (this.binoc) { const a = $('#azi'); if (a) a.textContent = `Demora ${String(Math.round(this.world.binocAzimuth())).padStart(3, '0')}°`; }
  }

  // avisos de cuenta atrás: sirena de niebla, golpe visual y rótulo; los últimos 10 segundos, número a número
  alerts(rem) {
    if (this._lastRem === undefined) { this._lastRem = rem; return; }
    const prev = this._lastRem; this._lastRem = rem;
    for (const [ms, txt, blasts] of [[300000, 'Quedan 5 minutos', 1], [180000, 'Quedan 3 minutos', 2], [60000, 'Queda 1 minuto', 3]]) {
      if (prev > ms && rem <= ms) { audio.foghorn(blasts); this.world.alert(ms === 60000 ? 1 : 0.75); this.banner(txt, ms === 60000 ? 'Antes de las 23:52, decide.' : 'La pleamar llega a las 23:52.'); }
    }
    if (rem <= 10500 && rem > 0) {
      const n = Math.ceil(rem / 1000);
      if (n !== this._cd) { this._cd = n; audio.tick(n <= 3); this.world.alert(0.45); this.countdown(n); }
    } else if (this._cdEl) { this._cdEl.remove(); this._cdEl = null; }
  }
  banner(title, sub) {
    const el = h('div', { class: 'alert-banner', role: 'alert' }, h('b', { text: title }), h('span', { text: sub }));
    $('#game').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 4200);
  }
  countdown(n) {
    if (!this._cdEl) { this._cdEl = h('div', { class: 'countdown', 'aria-live': 'assertive' }); $('#game').appendChild(this._cdEl); }
    this._cdEl.textContent = String(n);
    this._cdEl.classList.remove('beat'); void this._cdEl.offsetWidth; this._cdEl.classList.add('beat');
  }

  // coloca los puntos interactivos y evita que sus etiquetas se pisen o se salgan de la pantalla
  layoutHotspots() {
    const o = {};
    const W = innerWidth, H = innerHeight;
    const vis = [];
    for (const [id, x] of Object.entries(this.hsEls)) {
      this.world.project(x.pos, o);
      const ok = o.visible && o.dist < 4.2 && !this.binoc;
      if (ok !== x.shown) { x.el.style.display = ok ? '' : 'none'; x.shown = ok; }
      if (!ok) continue;
      x.sx = o.x * W; x.sy = o.y * H; x.d = o.dist;
      x.el.style.transform = `translate(${x.sx.toFixed(1)}px, ${x.sy.toFixed(1)}px)`;
      if (!x.lw) { const l = x.el.lastChild; x.lw = l.offsetWidth; x.lh = l.offsetHeight || 22; }
      vis.push(x);
    }
    vis.sort((a, b) => a.d - b.d);
    const rings = vis.map(x => [x.sx - 16, x.sy - 16, 32, 32, x]);
    const placed = [];
    const hit = (r, self) => placed.some(p => r[0] < p[0] + p[2] && r[0] + r[2] > p[0] && r[1] < p[1] + p[3] && r[1] + r[3] > p[1])
      || rings.some(p => p[4] !== self && r[0] < p[0] + p[2] && r[0] + r[2] > p[0] && r[1] < p[1] + p[3] && r[1] + r[3] > p[1]);
    for (const x of vis) {
      const lw = x.lw || 80, lh = x.lh || 22;
      let lx = 0;
      const left = x.sx - lw / 2;
      if (left < 6) lx = 6 - left; else if (left + lw > W - 6) lx = W - 6 - (left + lw);
      const down = [x.sx - lw / 2 + lx, x.sy + 18, lw, lh];
      const up = [x.sx - lw / 2 + lx, x.sy - 18 - lh, lw, lh];
      let mode = 'down';
      if (hit(down, x)) mode = hit(up, x) ? 'none' : 'up';
      if (mode !== 'none') placed.push(mode === 'down' ? down : up);
      if (x.mode !== mode) { x.el.classList.toggle('up', mode === 'up'); x.el.classList.toggle('nolbl', mode === 'none'); x.mode = mode; }
      if (x.lx !== Math.round(lx)) { x.lx = Math.round(lx); x.el.style.setProperty('--lx', x.lx + 'px'); }
    }
  }

  restart() {
    this._stopped = true;
    this._skipEnding && this._skipEnding();
    this.unsub && this.unsub();
    this.panels.close(); this.phone.close();
    $('#hotspots').innerHTML = ''; $('#subs').innerHTML = ''; $('#endBox').innerHTML = '';
    document.querySelectorAll('.end-skip').forEach(b => b.remove());
    game = null;
    startGame();
  }

  // ---------------------------------------------------- final (narrado)
  async runEnding(s) {
    if (this.ended) return;
    this.ended = true;
    this.panels.close(); this.phone.close();
    if (this.binoc) this.binoculars(false);
    audio.heartbeat(false); $('#vigRed').classList.remove('on');
    this.world.setTension(0.25, 0);
    if (this._cdEl) { this._cdEl.remove(); this._cdEl = null; }
    const end = S.computeEnding(s);
    const E = C.ENDINGS[end.ending];
    const f = s.f;
    const coop = this.session.mode === 'coop';
    const host = Object.values(s.players).find(p => p.host);
    const fill = (t) => t.replace('{HDG}', f.msg && f.msg.hdg !== undefined ? String(f.msg.hdg).padStart(3, '0') : '').replace('{POS}', f.msg && f.msg.lat ? `${fmtLat(f.msg.lat)} ${fmtLon(f.msg.lon)}` : '').replace('{HOST}', (host && host.n) || '');
    $('#hotspots').hidden = true; $('#navL').hidden = true; $('#navR').hidden = true;
    document.querySelector('.hud-top').hidden = true; document.querySelector('.hud-bottom').hidden = true;
    // cámara mirando al mar desde la galería
    this.world.goNode('f3_sea', true);
    audio.setFloor('f3');
    audio.setIntensity(0);
    audio.mood(end.ending === 'fail' ? 'dread' : 'dark');
    if (end.ending === 'luz') this.world.setState({ lampOn: false, keroLit: true });
    else if (end.ending === 'fail') this.world.setState({ lampOn: false, keroLit: false, surge: 1 });
    else this.world.setState({ lampOn: false, keroLit: false });
    show('ending');
    const box = $('#endBox'); box.innerHTML = '';
    // se puede saltar la secuencia
    let skip = false, cur = null, skipRes;
    const skipP = new Promise(r => { skipRes = r; });
    const doSkip = () => { if (skip) return; skip = true; if (cur && cur.stop) cur.stop(); this.phone.close(); skipRes(); };
    const skipBtn = h('button', { class: 'btn ghost small end-skip', text: 'Saltar', onclick: doSkip });
    this._skipEnding = doSkip;
    $('#ending').appendChild(skipBtn);
    const sleep = (ms) => skip ? Promise.resolve() : Promise.race([wait(ms), skipP]);
    const pick = (x) => Array.isArray(x) ? x : (coop ? x.coop : x.solo);
    const say = async (entry, keep = false) => {
      if (skip) return;
      const [vo, text] = pick(entry);
      const p = h('p', { class: 'end-beat', text: fill(text) });
      if (!keep) box.innerHTML = '';
      box.appendChild(p); await wait(60); p.classList.add('on');
      const dur = (audio.info(vo).dur || 4) * 1000;
      if (settings.sound) { cur = await audio.narrate(vo); await Promise.race([cur.ended, wait(dur + 800), skipP]); cur = null; }
      else await sleep(settings.reduce ? 1600 : Math.min(6500, 1500 + text.length * 40));
      await sleep(450);
    };
    const radio = async (id, who) => {
      if (skip) return;
      const p = await audio.playVoice(id, { bus: 'mf' });
      cur = p;
      const el = this.showSub(who, audio.info(id).sub, 'mf');
      await Promise.race([p.ended, wait((p.dur || 3) * 1000 + 500), skipP]);
      cur = null;
      el.remove();
    };
    await sleep(1200);
    for (let i = 0; i < E.beats.length; i++) {
      if (end.ending === 'luz' && i === 2) audio.mood('hope');
      if ((end.ending === 'adv' || end.ending === 'resc') && i === 2) audio.mood('sad');
      await say(E.beats[i], i > 0);
    }
    if (end.ending === 'luz') await radio('r96_andres_luz', 'SANTA ILIA · 1996');
    if (end.ending === 'adv') { await radio('r96_andres_adv', 'SANTA ILIA · 1996'); await radio('r96_andres_reply', 'SANTA ILIA · 1996'); this.world.setState({ keroLit: true }); }
    if (end.ending === 'resc') { await radio('r96_fisterra_resc', 'FISTERRA RADIO · 1996'); this.world.setState({ keroLit: true }); }
    if (end.ending === 'fail') { await radio('r96_xose_fail', 'SANTA ILIA · 1996'); await radio('r96_andres_fail', 'SANTA ILIA · 1996'); if (!skip) audio.thunder(0.3, 1); }
    await sleep(1000);
    // la hoja de Ramón, reescrita
    if (!skip) {
      box.innerHTML = '';
      const page = h('div', { class: 'doc hand', style: { textAlign: 'left' } }, h('h4', { text: 'La hoja de Ramón · 11-XI-1996' }), ...C.PAGE_AFTER[end.ending].map(([t, x]) => h('div', { class: 'logline' }, h('b', { text: t }), h('span', { text: x }))));
      box.appendChild(page);
      audio.sfx('paper');
      await sleep(settings.reduce ? 2500 : 6000);
    }
    // el Marée
    audio.mood(end.maree === 'helped' || end.maree === 'luzSafe' ? 'hope' : 'sad');
    await say(C.MAREE_OUTCOME[end.maree]);
    // epílogo
    audio.mood(end.ending === 'luz' || end.ending === 'resc' ? 'dawn' : 'sad');
    const epi = C.EPILOGUE[end.ending];
    for (let i = 0; i < epi.length; i++) await say(epi[i], i > 0);
    if (end.ending === 'luz' && !skip) {
      await Promise.race([new Promise((res) => this.phone.ring({ caller: 'Papá', sub: 'móvil', segs: ['call_papa'], mask: null, line: false, gapMs: 400, subOf: (id) => audio.info(id).sub, onEnd: () => res(), timeoutMs: 30000 })), skipP]);
    }
    skipBtn.remove();
    this._skipEnding = null;
    if (this._stopped) return;
    box.innerHTML = '';
    const ok = end.ending !== 'fail';
    if (ok) {
      const prevU = store('nwo.unlocked') || {};
      const endings = Array.from(new Set([...(prevU.endings || []), end.ending]));
      store('nwo.unlocked', { ending: end.ending, endings, at: Date.now() });
    }
    let msgVoice = null;
    const stopMsg = () => { if (msgVoice && msgVoice.stop) msgVoice.stop(); };
    // parte de guardia: lo que se ha medido durante la partida
    const rep = guardReport(s, { heard: this.heardLog.filter(e => (C.RADIO[e.id] || {}).ch === 'mf').length, steps: this.steps || 0, docs: this.docsSeen.length });
    const rec = saveRecord(rep.record);
    const nf = (n) => n.toLocaleString('es-ES');
    const parte = h('section', { class: 'parte', 'aria-label': 'Parte de guardia' },
      h('div', { class: 'k', text: 'Parte de guardia · Cabo Néboa · 11-XI' }),
      h('dl', { class: 'stats' }, ...rep.stats.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      rep.badges.length ? h('div', { class: 'k', text: 'Distinciones' }) : null,
      rep.badges.length ? h('div', { class: 'badges' }, ...rep.badges.map(([t, d]) => h('div', { class: 'badge-m' }, h('b', { text: t }), h('span', { text: d })))) : null,
      Object.keys(rep.credits).length > 1 ? h('div', { class: 'k', text: 'Quién hizo qué' }) : null,
      Object.keys(rep.credits).length > 1 ? h('div', { class: 'credits' }, ...Object.entries(rep.credits).map(([n, l]) => h('p', {}, h('b', { text: n + ': ' }), l.join(', ')))) : null);
    const scoreEl = h('div', { class: 'score-line' },
      h('div', {}, h('b', { class: 'pts', text: nf(rep.score) }), h('span', { text: ' puntos de guardia' })),
      h('div', { class: 'rank', text: rep.rank }),
      h('div', { class: 'fine', text: rec.isBest && rec.list.length > 1 ? '¡Nuevo récord en este dispositivo!' : `Récord en este dispositivo: ${nf(rec.best)} puntos` }));
    const card = h('div', { class: 'end-card' },
      h('div', { class: 'k', text: ok ? 'Final' : 'Final · tiempo agotado' }),
      h('div', { class: 'end-title', text: E.title }),
      h('p', { class: 'end-msg', text: E.message }),
      h('div', { class: ok ? 'unlock-stamp' : 'deny-stamp', text: ok ? 'NOWAYOUT DESBLOQUEADO' : 'NOWAYOUT SIGUE CERRADO' }),
      scoreEl,
      ok ? h('button', { class: 'btn primary', text: 'Entrar en NOWAYOUT', onclick: () => { stopMsg(); openCatalog(end.ending); } }) : null,
      h('button', { class: 'btn' + (ok ? '' : ' primary'), text: ok ? 'Volver a jugar (hay otros finales)' : 'Reintentar ahora', onclick: () => { stopMsg(); this.replay(); } }),
      h('button', { class: 'btn ghost', text: 'Volver a la portada', onclick: () => { stopMsg(); if (this.session.leave) this.session.leave(); location.href = location.pathname; } }),
      parte);
    box.appendChild(card);
    audio.mood(ok ? (end.ending === 'luz' ? 'hope' : 'dawn') : 'sad');
    if (settings.sound) msgVoice = await audio.narrate(E.msgVo);
  }

  replay() {
    if (this.session.mode === 'coop') {
      if (this.session.isHost) { this.session.startGame(); }
      else this.toast('Pide al anfitrión que vuelva a empezar la partida.');
      return;
    }
    this._stopped = true;
    location.href = location.pathname + '?replay=1';
  }
}

function garble(t) {
  return t.split(' ').map((w, i) => (i % 3 === 1 ? '· · ·' : w)).join(' ');
}

function startGame() {
  if (game) return;
  keepAwake();
  document.querySelector('.hud-top').hidden = false; document.querySelector('.hud-bottom').hidden = false;
  $('#hotspots').hidden = false; $('#navL').hidden = false; $('#navR').hidden = false;
  game = new Game(session);
  game.start();
}

function openCatalog(ending) {
  if (game) { game._stopped = true; }
  show('catalog');
  renderCatalog($('#catalog'), {
    name: settings.name, ending: ending || (store('nwo.unlocked') || {}).ending,
    onReplay: () => { location.href = location.pathname + '?replay=1'; },
    onExit: () => { location.href = location.pathname; },
  });
}

// ------------------------------------------------------------------ arranque
initGate();
if (params.has('replay')) {
  history.replaceState(null, '', location.pathname);
  const go = h('button', { class: 'btn primary', text: 'Volver a entrar en el faro', onclick: () => startSolo(true) });
  const card = $('.room-card .cta');
  card.prepend(go);
}
if (TEST) window.__nwoApp = { startSolo, openLobby, audio, settings, get session() { return session; }, get world() { return world; }, get game() { return game; } };
