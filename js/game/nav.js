// Geometría de la carta 412 (millas náuticas). Origen = faro de Cabo Néboa. x = este, y = norte.
export const LON_NM = 0.7296; // millas por minuto de longitud a 43°N
export const ORIGIN = { latMin: 43 * 60 + 9.0, lonMin: 9 * 60 + 12.0 }; // 43°09,0'N 009°12,0'W

export const MARKS = {
  FN: { name: 'Cabo Néboa', x: 0, y: 0, kind: 'light', ch: 'GpD(3) B 15s' },
  PI: { name: 'Punta Insua', x: 0.6, y: 4.2, kind: 'light', ch: 'GpD(2) B 10s', note: 'Radiogoniometría' },
  MF: { name: 'Monte Facho', x: -1.2, y: -3.0, kind: 'mast', ch: 'F R (torreta)' },
  C:  { name: 'Camariñas, dique', x: 1.5, y: -4.5, kind: 'light', ch: 'GpD(2) R 7s' },
};
export const LAXE = { name: 'Laxe das Viúvas', x: -1.5, y: -2.6, r: 0.28 };
export const ANCHOR = { name: 'Enseada da Lagoa', x: 0.55, y: 2.3 };

// Tierra (polígono, sentido horario) y bajos
export const LAND = [
  [1.1, 6.0], [0.55, 5.0], [0.4, 4.35], [0.62, 3.95], [1.25, 3.45], [1.7, 2.7], [1.45, 1.85], [0.75, 1.15], [0.2, 0.55],
  [-0.22, 0.12], [-0.12, -0.35], [-0.35, -1.1], [-0.75, -1.9], [-1.1, -2.65], [-1.05, -3.15], [-0.55, -3.55], [0.35, -3.85],
  [1.15, -4.15], [1.35, -4.45], [1.1, -4.9], [0.6, -5.4], [0.7, -6.4], [4.0, -6.4], [4.0, 6.0],
];
export const SHOALS = [
  { x: -1.5, y: -2.6, r: 0.3 },   // Laxe das Viúvas
  { x: -0.55, y: 0.2, r: 0.18 },  // Baixos de Néboa
  { x: 0.2, y: 4.3, r: 0.2 },     // Baixos de Insua
];

export function bearingVec(deg) {
  const a = deg * Math.PI / 180;
  return { x: Math.sin(a), y: Math.cos(a) };
}

export function rayIntersect(p, b1, q, b2) {
  const d1 = bearingVec(b1), d2 = bearingVec(b2);
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-6) return null;
  const qx = q.x - p.x, qy = q.y - p.y;
  const t = (qx * d2.y - qy * d2.x) / den;
  const s = (qx * d1.y - qy * d1.x) / den;
  if (t < 0 || s < 0) return null;
  return { x: p.x + d1.x * t, y: p.y + d1.y * t, t, s };
}

// Posición real del Santa Ilia: cruce de 230° desde Néboa y 205° desde Insua
export const SI = rayIntersect(MARKS.FN, 230, MARKS.PI, 205);

export function toLatLon(x, y) {
  const lat = ORIGIN.latMin + y;
  const lon = ORIGIN.lonMin - x / LON_NM;
  return { lat, lon };
}
export function fmtLat(min) {
  const d = Math.floor(min / 60), m = min - d * 60;
  return `${d}°${m.toFixed(1).padStart(4, '0').replace('.', ',')}'N`;
}
export function fmtLon(min) {
  const d = Math.floor(min / 60), m = min - d * 60;
  return `${String(d).padStart(3, '0')}°${m.toFixed(1).padStart(4, '0').replace('.', ',')}'W`;
}
export function fromLatLon(latMin, lonMin) {
  return { x: (ORIGIN.lonMin - lonMin) * LON_NM, y: latMin - ORIGIN.latMin };
}

function segIntersect(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function distToSeg(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

// ¿Es seguro ese rumbo desde la posición real del Santa Ilia durante 3 millas?
export function headingVerdict(deg, from = SI, dist = 3.0) {
  const d = bearingVec(deg);
  const end = { x: from.x + d.x * dist, y: from.y + d.y * dist };
  for (const sh of SHOALS) {
    if (distToSeg(sh, from, end) < sh.r + 0.12) return { ok: false, why: sh.x === LAXE.x ? 'laxe' : 'bajos' };
  }
  const steps = 60;
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + d.x * dist * i / steps, y: from.y + d.y * dist * i / steps };
    if (pointInPoly(p, LAND)) return { ok: false, why: 'costa' };
  }
  for (let i = 0; i < LAND.length; i++) {
    const a = { x: LAND[i][0], y: LAND[i][1] }, b = { x: LAND[(i + 1) % LAND.length][0], y: LAND[(i + 1) % LAND.length][1] };
    if (segIntersect(from, end, a, b)) return { ok: false, why: 'costa' };
  }
  return { ok: true };
}

export function rescueVerdict(latMin, lonMin) {
  const p = fromLatLon(latMin, lonMin);
  const dL = Math.hypot(p.x - LAXE.x, p.y - LAXE.y);
  return { ok: dL <= 1.25 && !pointInPoly(p, LAND), dist: dL, onLand: pointInPoly(p, LAND) };
}

export function crossDone(lines) {
  const a = lines.some(l => l.o === 'FN' && Math.abs(angDiff(l.b, 230)) <= 1.5);
  const b = lines.some(l => l.o === 'PI' && Math.abs(angDiff(l.b, 205)) <= 1.5);
  return a && b;
}
export function angDiff(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return d;
}
