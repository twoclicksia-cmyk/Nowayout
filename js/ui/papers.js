// Texturas de papel para la escena 3D (corcho, orden de trabajo, dibujo, calendario).
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function noise(g, w, h, a = 0.06, n = 2600) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}
function wrap(g, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

export function corkCanvas() {
  const c = cv(1200, 800), g = c.getContext('2d');
  g.fillStyle = '#8a6238'; g.fillRect(0, 0, 1200, 800);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${60 + Math.random() * 80},${40 + Math.random() * 50},${20 + Math.random() * 30},.5)`; g.fillRect(Math.random() * 1200, Math.random() * 800, 3, 3); }
  // recorte de periódico
  g.save(); g.translate(80, 70); g.rotate(-0.04);
  g.fillStyle = '#e6dfc9'; g.fillRect(0, 0, 470, 560); noise(g, 470, 560, 0.08);
  g.fillStyle = '#222'; g.font = 'bold 24px Georgia, serif'; g.fillText('EL ECO DE FISTERRA', 20, 40);
  g.font = '15px Georgia, serif'; g.fillText('Martes, 12 de noviembre de 1996', 20, 64);
  g.fillRect(20, 76, 430, 2);
  g.font = 'bold 34px Georgia, serif'; wrap(g, 'TRAGEDIA EN LA LAXE DAS VIÚVAS', 20, 120, 430, 38);
  g.font = '16px Georgia, serif'; g.fillStyle = '#333';
  wrap(g, 'El pesquero Santa Ilia, de Camariñas, naufragó anoche en plena tormenta. Cinco marineros desaparecidos. Un menor de 11 años, único superviviente...', 20, 230, 430, 22);
  g.fillStyle = '#999'; g.fillRect(20, 340, 430, 190); g.fillStyle = '#666'; g.font = 'italic 14px Georgia, serif'; g.fillText('El muelle de Camariñas, esta mañana.', 20, 550);
  g.restore();
  // foto
  g.save(); g.translate(640, 90); g.rotate(0.06);
  g.fillStyle = '#f2ece0'; g.fillRect(0, 0, 330, 260);
  const gr = g.createLinearGradient(0, 0, 0, 220); gr.addColorStop(0, '#8b7f6e'); gr.addColorStop(1, '#5d5246');
  g.fillStyle = gr; g.fillRect(14, 14, 302, 200);
  g.fillStyle = '#3e352c'; g.fillRect(40, 120, 250, 50); g.fillRect(150, 70, 8, 60);
  g.beginPath(); g.arc(110, 110, 16, 0, 6.3); g.fill(); g.fillRect(96, 124, 30, 50); g.beginPath(); g.arc(110, 86, 10, 0, 6.3); g.fill();
  g.restore();
  // tarjeta de frecuencias
  g.save(); g.translate(660, 430); g.rotate(-0.02);
  g.fillStyle = '#f7f2e6'; g.fillRect(0, 0, 440, 280);
  g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, 0, 440, 30);
  g.fillStyle = '#7a1a12'; g.font = 'bold 22px Arial, sans-serif'; g.fillText('FRECUENCIAS DE SOCORRO', 18, 40);
  g.fillStyle = '#222'; g.font = '18px "IBM Plex Mono", monospace';
  g.fillText('VHF 16   156,800 MHz  voz', 18, 90);
  g.fillText('2182 kHz onda media   voz', 18, 130);
  g.fillText('500 kHz  onda media   Morse', 18, 170);
  g.font = '14px Arial'; g.fillStyle = '#555'; g.fillText('Antena 2: hilo largo (onda media)', 18, 220);
  g.restore();
  // chinchetas
  for (const [x, y] of [[300, 80], [800, 100], [880, 440]]) { g.fillStyle = '#c8261b'; g.beginPath(); g.arc(x, y, 9, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 3, y - 3, 3, 0, 6.3); g.fill(); }
  return c;
}

export function workorderCanvas(name) {
  const c = cv(600, 820), g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 600, 820); noise(g, 600, 820, 0.03);
  g.fillStyle = '#1d3b5a'; g.font = 'bold 26px Arial'; g.fillText('AUTORIDAD PORTUARIA', 30, 56);
  g.font = '18px Arial'; g.fillText('Servicio de Señales Marítimas', 30, 84);
  g.fillStyle = '#111'; g.font = 'bold 30px Arial'; g.fillText('ORDEN DE TRABAJO 2026-1187', 30, 150);
  g.font = '20px Arial';
  const rows = [['Faro', 'Cabo Néboa (0415)'], ['Característica', 'GpD(3) B 15s'], ['Trabajo', 'Radiofaro y AIS'], ['Técnico/a', name || '—'], ['Fecha', '11-XI-2026']];
  let y = 220;
  for (const [k, v] of rows) { g.fillStyle = '#666'; g.fillText(k, 30, y); g.fillStyle = '#111'; g.fillText(v, 230, y); g.fillStyle = '#ccc'; g.fillRect(30, y + 12, 540, 2); y += 60; }
  g.fillStyle = '#333'; g.font = 'italic 18px Arial'; wrap(g, 'La emisora de onda media (1980) se conserva por su valor histórico. Desconectada.', 30, 560, 540, 26);
  return c;
}

export function drawingCanvas() {
  const c = cv(420, 600), g = c.getContext('2d');
  g.fillStyle = '#fbf8ef'; g.fillRect(0, 0, 420, 600);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const crayon = (col, w, pts) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x + Math.random() * 3, y + Math.random() * 3) : g.moveTo(x, y)); g.stroke(); };
  g.fillStyle = '#4a7fc0'; g.fillRect(0, 430, 420, 170);
  crayon('#2b5d9a', 6, [[0, 440], [60, 425], [120, 445], [190, 428], [260, 446], [330, 430], [420, 444]]);
  crayon('#c23b2c', 10, [[170, 430], [185, 230], [235, 230], [250, 430], [170, 430]]);
  crayon('#f2f2f2', 10, [[178, 330], [242, 330]]); crayon('#f2f2f2', 10, [[182, 280], [238, 280]]);
  crayon('#333', 8, [[180, 230], [210, 190], [240, 230]]);
  g.fillStyle = '#ffd23b'; g.beginPath(); g.arc(210, 210, 16, 0, 6.3); g.fill();
  for (const a of [-0.5, 0, 0.5]) crayon('#ffd23b', 9, [[210, 210], [210 + Math.cos(a - 1.57) * 0 + Math.sin(a) * 190, 210 - Math.cos(a) * 160]]);
  g.fillStyle = '#333'; g.font = 'bold 26px "Comic Sans MS", "Segoe Print", cursive';
  g.fillText('PARA QUE NO', 60, 520); g.fillText('TE PIERDAS', 80, 556); g.fillStyle = '#c23b2c'; g.fillText('LÚA', 300, 590);
  return c;
}

export function calendarCanvas() {
  const c = cv(420, 600), g = c.getContext('2d');
  g.fillStyle = '#efe8d7'; g.fillRect(0, 0, 420, 600); noise(g, 420, 600, 0.06);
  g.fillStyle = '#7a1a12'; g.fillRect(0, 0, 420, 90);
  g.fillStyle = '#fff'; g.font = 'bold 40px Georgia, serif'; g.fillText('NOVIEMBRE', 40, 60);
  g.fillStyle = '#333'; g.font = 'bold 30px Georgia, serif'; g.fillText('1996', 300, 140);
  g.font = '22px Arial';
  const days = 'L M X J V S D'.split(' ');
  days.forEach((d, i) => g.fillText(d, 30 + i * 54, 200));
  let day = 1;
  for (let w = 0; w < 5; w++) for (let i = 0; i < 7; i++) {
    const idx = w * 7 + i - 4; // 1996-11-01 fue viernes
    if (idx < 0 || day > 30) continue;
    const x = 30 + i * 54, y = 250 + w * 60;
    g.fillStyle = '#222'; g.fillText(String(day), x, y);
    if (day === 11) { g.strokeStyle = '#b3241a'; g.lineWidth = 4; g.beginPath(); g.ellipse(x + 11, y - 8, 26, 22, 0, 0, 6.3); g.stroke(); }
    day++;
  }
  g.fillStyle = '#555'; g.font = 'italic 20px Georgia'; g.fillText('San Martiño. Temporal.', 40, 570);
  return c;
}
