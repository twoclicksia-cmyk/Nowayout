// Carta náutica 412 en SVG: demoras, cruces y lectura de coordenadas.
import { MARKS, LAXE, ANCHOR, LAND, SHOALS, rayIntersect, bearingVec, toLatLon, fmtLat, fmtLon, LON_NM, ORIGIN } from '../game/nav.js';

const X0 = -4.5, X1 = 3.0, Y0 = -6.4, Y1 = 6.0, K = 100;
export const W = (X1 - X0) * K, H = (Y1 - Y0) * K;
export const sx = (x) => (x - X0) * K;
export const sy = (y) => (Y1 - y) * K;
export const ux = (px) => px / K + X0;
export const uy = (py) => Y1 - py / K;
const ORIGIN_NAMES = { FN: 'Cabo Néboa', PI: 'Punta Insua', MF: 'Monte Facho', C: 'Camariñas' };

function soundings() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let i = 0; i < 140; i++) {
    const x = X0 + 0.2 + rnd() * (X1 - X0 - 0.4), y = Y0 + 0.2 + rnd() * (Y1 - Y0 - 0.4);
    if (inside(x, y)) continue;
    const dCoast = Math.min(...LAND.map(([a, b]) => Math.hypot(a - x, b - y)));
    const depth = Math.round(8 + dCoast * 24 + rnd() * 10);
    out.push({ x, y, d: depth });
  }
  return out;
}
function inside(x, y) {
  let ins = false;
  for (let i = 0, j = LAND.length - 1; i < LAND.length; j = i++) {
    const [xi, yi] = LAND[i], [xj, yj] = LAND[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
const SOUND = soundings();

export function chartSVG(lines = [], opts = {}) {
  const land = LAND.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="IBM Plex Mono, monospace">`;
  s += `<rect width="${W}" height="${H}" fill="#dfe6e1"/>`;
  // bandas de profundidad
  for (const [off, col] of [[0.9, '#d6e0dc'], [0.45, '#cfdcd9'], [0.2, '#c6d8d6']]) {
    s += `<polygon points="${LAND.map(([x, y]) => `${sx(x - off).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')} ${sx(X1 + 2)},${sy(Y0 - 1)} ${sx(X1 + 2)},${sy(Y1 + 1)}" fill="${col}" />`;
  }
  // rejilla de minutos
  const latMin0 = Math.ceil(ORIGIN.latMin + Y0), latMin1 = Math.floor(ORIGIN.latMin + Y1);
  for (let m = latMin0; m <= latMin1; m++) {
    const y = m - ORIGIN.latMin;
    s += `<line x1="0" y1="${sy(y)}" x2="${W}" y2="${sy(y)}" stroke="#7d8f9a" stroke-width="0.8" stroke-dasharray="${m % 5 === 0 ? '' : '4 6'}" opacity=".7"/>`;
    s += `<text x="6" y="${sy(y) - 4}" font-size="15" fill="#3c4a55">${fmtLat(m).replace("'N", "'")}</text>`;
  }
  const lonA = ORIGIN.lonMin - X1 / LON_NM, lonB = ORIGIN.lonMin - X0 / LON_NM;
  for (let m = Math.ceil(lonA); m <= Math.floor(lonB); m++) {
    const x = (ORIGIN.lonMin - m) * LON_NM;
    s += `<line x1="${sx(x)}" y1="0" x2="${sx(x)}" y2="${H}" stroke="#7d8f9a" stroke-width="0.8" stroke-dasharray="${m % 5 === 0 ? '' : '4 6'}" opacity=".7"/>`;
    s += `<text x="${sx(x) + 4}" y="${H - 8}" font-size="15" fill="#3c4a55" transform="rotate(-90 ${sx(x) + 4} ${H - 8})">${fmtLon(m).replace("'W", "'")}</text>`;
  }
  s += `<polygon points="${land}" fill="#e9d6a8" stroke="#7a6a43" stroke-width="2"/>`;
  for (const d of SOUND) s += `<text x="${sx(d.x)}" y="${sy(d.y)}" font-size="13" fill="#5a7488" text-anchor="middle">${d.d}</text>`;
  // bajos
  for (const sh of SHOALS) {
    s += `<circle cx="${sx(sh.x)}" cy="${sy(sh.y)}" r="${sh.r * K}" fill="#a9c6d4" stroke="#2f4e66" stroke-dasharray="4 4" stroke-width="1.6"/>`;
    s += `<text x="${sx(sh.x)}" y="${sy(sh.y) + 5}" font-size="18" fill="#2f4e66" text-anchor="middle">+</text>`;
  }
  s += `<text x="${sx(LAXE.x) - 18}" y="${sy(LAXE.y) + 44}" font-size="17" font-style="italic" fill="#173247" text-anchor="end">Laxe das Viúvas</text>`;
  s += `<text x="${sx(LAXE.x) - 18}" y="${sy(LAXE.y) + 62}" font-size="13" fill="#173247" text-anchor="end">${fmtLat(toLatLon(LAXE.x, LAXE.y).lat)} ${fmtLon(toLatLon(LAXE.x, LAXE.y).lon)}</text>`;
  s += `<text x="${sx(-0.55) - 24}" y="${sy(0.2) + 4}" font-size="13" font-style="italic" fill="#173247" text-anchor="end">Baixos de Néboa</text>`;
  // luces
  const light = (m, red) => {
    const x = sx(m.x), y = sy(m.y);
    return `<path d="M${x} ${y} l14 -40 a10 10 0 0 1 -28 0 z" fill="${red ? '#d0342c' : '#b0397a'}" opacity=".85"/><circle cx="${x}" cy="${y}" r="6" fill="#222" />`;
  };
  s += light(MARKS.FN) + `<text x="${sx(MARKS.FN.x) + 16}" y="${sy(MARKS.FN.y) + 4}" font-size="17" font-weight="600" fill="#2b2016">Cabo Néboa</text><text x="${sx(MARKS.FN.x) + 16}" y="${sy(MARKS.FN.y) + 22}" font-size="14" fill="#6b1f4b">GpD(3)B.15s 23M</text>`;
  s += light(MARKS.PI) + `<text x="${sx(MARKS.PI.x) + 16}" y="${sy(MARKS.PI.y) + 4}" font-size="17" font-weight="600" fill="#2b2016">Pta. Insua</text><text x="${sx(MARKS.PI.x) + 16}" y="${sy(MARKS.PI.y) + 22}" font-size="14" fill="#6b1f4b">GpD(2)B.10s 15M · RG</text>`;
  s += light(MARKS.C, true) + `<text x="${sx(MARKS.C.x) - 14}" y="${sy(MARKS.C.y) + 30}" font-size="15" font-weight="600" fill="#2b2016" text-anchor="end">Camariñas, dique</text><text x="${sx(MARKS.C.x) - 14}" y="${sy(MARKS.C.y) + 48}" font-size="14" fill="#8a1f18" text-anchor="end">GpD(2)R.7s 5M</text>`;
  const mx = sx(MARKS.MF.x), my = sy(MARKS.MF.y);
  s += `<path d="M${mx - 9} ${my} L${mx} ${my - 34} L${mx + 9} ${my} Z" fill="none" stroke="#2b2016" stroke-width="2.4"/><circle cx="${mx}" cy="${my - 36}" r="5" fill="#d0342c"/>`;
  s += `<text x="${mx + 14}" y="${my - 8}" font-size="15" font-weight="600" fill="#2b2016">Monte Facho</text><text x="${mx + 14}" y="${my + 10}" font-size="13" fill="#8a1f18">torreta F.R.</text>`;
  const ax = sx(ANCHOR.x), ay = sy(ANCHOR.y);
  s += `<g stroke="#173247" stroke-width="2.2" fill="none"><circle cx="${ax}" cy="${ay - 14}" r="4"/><line x1="${ax}" y1="${ay - 10}" x2="${ax}" y2="${ay + 12}"/><path d="M${ax - 11} ${ay + 2} q11 16 22 0"/></g>`;
  s += `<text x="${ax - 16}" y="${ay - 4}" font-size="15" font-style="italic" fill="#173247" text-anchor="end">Enseada da Lagoa</text><text x="${ax - 16}" y="${ay + 14}" font-size="13" fill="#173247" text-anchor="end">abrigo con temporal del SW</text>`;
  s += `<text x="${sx(1.2)}" y="${sy(-5.8)}" font-size="16" font-style="italic" fill="#2b2016">Ría de Camariñas</text>`;
  // rosa de los vientos
  const rx = sx(-3.3), ry = sy(3.0), R = 110;
  s += `<g stroke="#6b1f4b" fill="none" opacity=".85"><circle cx="${rx}" cy="${ry}" r="${R}" stroke-width="1.5"/><circle cx="${rx}" cy="${ry}" r="${R - 18}" stroke-width="0.8"/>`;
  for (let d = 0; d < 360; d += 10) {
    const a = d * Math.PI / 180, r1 = d % 30 === 0 ? R - 18 : R - 9;
    s += `<line x1="${rx + Math.sin(a) * r1}" y1="${ry - Math.cos(a) * r1}" x2="${rx + Math.sin(a) * R}" y2="${ry - Math.cos(a) * R}" stroke-width="1.2"/>`;
  }
  s += `<path d="M${rx} ${ry - R + 22} L${rx + 10} ${ry} L${rx} ${ry + R - 22} L${rx - 10} ${ry} Z" fill="#6b1f4b" stroke="none" opacity=".6"/></g>`;
  for (let d = 0; d < 360; d += 30) {
    const a = d * Math.PI / 180;
    s += `<text x="${rx + Math.sin(a) * (R + 16)}" y="${ry - Math.cos(a) * (R + 16) + 5}" font-size="14" fill="#6b1f4b" text-anchor="middle">${String(d).padStart(3, '0')}</text>`;
  }
  s += `<text x="${rx}" y="${ry - R - 28}" font-size="18" font-weight="700" fill="#6b1f4b" text-anchor="middle">N</text>`;
  // escala y cartela
  const bx = sx(-4.2), by = sy(-5.6);
  s += `<g><rect x="${bx}" y="${by}" width="100" height="8" fill="#2b2016"/><rect x="${bx + 100}" y="${by}" width="100" height="8" fill="#fff" stroke="#2b2016"/><text x="${bx}" y="${by - 6}" font-size="13" fill="#2b2016">0</text><text x="${bx + 96}" y="${by - 6}" font-size="13" fill="#2b2016">1</text><text x="${bx + 186}" y="${by - 6}" font-size="13" fill="#2b2016">2 millas</text></g>`;
  s += `<g><rect x="${sx(-4.35)}" y="${sy(5.85)}" width="330" height="72" fill="#efe9d6" stroke="#2b2016"/><text x="${sx(-4.25)}" y="${sy(5.85) + 26}" font-size="19" font-weight="700" fill="#2b2016">CARTA 412</text><text x="${sx(-4.25)}" y="${sy(5.85) + 46}" font-size="13" fill="#2b2016">De Punta Insua a la ría de Camariñas</text><text x="${sx(-4.25)}" y="${sy(5.85) + 63}" font-size="12" fill="#2b2016">Demoras verdaderas · sondas en metros</text></g>`;
  // demoras trazadas
  const drawn = [];
  for (const l of lines) {
    const m = MARKS[l.o];
    if (!m) continue;
    const d = bearingVec(l.b);
    const L = 12;
    s += `<line x1="${sx(m.x)}" y1="${sy(m.y)}" x2="${sx(m.x + d.x * L)}" y2="${sy(m.y + d.y * L)}" stroke="#c0281c" stroke-width="3" stroke-dasharray="14 6"/>`;
    s += `<text x="${sx(m.x + d.x * 1.2) + 6}" y="${sy(m.y + d.y * 1.2)}" font-size="16" font-weight="700" fill="#c0281c">${String(l.b).padStart(3, '0')}°</text>`;
    drawn.push({ m, b: l.b, o: l.o });
  }
  const crosses = [];
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
    const p = rayIntersect(drawn[i].m, drawn[i].b, drawn[j].m, drawn[j].b);
    if (!p || p.x < X0 || p.x > X1 || p.y < Y0 || p.y > Y1) continue;
    crosses.push(p);
    const ll = toLatLon(p.x, p.y);
    s += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="12" fill="none" stroke="#c0281c" stroke-width="3"/><circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3" fill="#c0281c"/>`;
    s += `<rect x="${sx(p.x) + 16}" y="${sy(p.y) - 30}" width="232" height="26" fill="#fff8e6" stroke="#c0281c"/><text x="${sx(p.x) + 24}" y="${sy(p.y) - 12}" font-size="15" font-weight="700" fill="#c0281c">${fmtLat(ll.lat)} ${fmtLon(ll.lon)}</text>`;
  }
  if (opts.probe) {
    const p = opts.probe, ll = toLatLon(p.x, p.y);
    s += `<g stroke="#1b4e7a" stroke-width="2"><line x1="${sx(p.x) - 18}" y1="${sy(p.y)}" x2="${sx(p.x) + 18}" y2="${sy(p.y)}"/><line x1="${sx(p.x)}" y1="${sy(p.y) - 18}" x2="${sx(p.x)}" y2="${sy(p.y) + 18}"/></g>`;
    s += `<rect x="${sx(p.x) + 14}" y="${sy(p.y) + 8}" width="232" height="26" fill="#eef5fb" stroke="#1b4e7a"/><text x="${sx(p.x) + 22}" y="${sy(p.y) + 26}" font-size="15" fill="#1b4e7a">${fmtLat(ll.lat)} ${fmtLon(ll.lon)}</text>`;
  }
  s += `</svg>`;
  return { svg: s, crosses };
}

export function chartOrigins() { return ORIGIN_NAMES; }

// Textura apaisada para el papel de la mesa 3D (norte hacia la izquierda)
export async function chartCanvas(lines) {
  const { svg } = chartSVG(lines);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = 1536; c.height = 1050;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e4d2'; g.fillRect(0, 0, c.width, c.height);
  g.save();
  const k = c.width / H;
  g.translate(0, c.height);
  g.rotate(-Math.PI / 2);
  g.drawImage(img, 0, 0, W * k, H * k);
  g.restore();
  URL.revokeObjectURL(url);
  return c;
}
