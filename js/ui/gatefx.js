// Fondo vivo de la portada: Cabo Néboa en plena tormenta (canvas 2D, ligero).
// Todo responde al mundo de la Sala 0: el faro da 3 destellos cada 15 s, Punta Insua 2 cada 10 s,
// la luz roja fija del Facho, el mar de fondo, los relámpagos y una vieja radio cuyas ráfagas coinciden con los destellos.
export function gateFx(canvas, { reduce = false } = {}) {
  const g = canvas.getContext('2d');
  let w = 0, h = 0, dpr = Math.min(2, devicePixelRatio || 1), raf = 0;
  const t0 = performance.now();
  const drops = [];
  let clouds = null, px = 0, py = 0, tpx = 0, tpy = 0;
  // capa de nubes pre-renderizada (ruido suave) que se desplaza lentamente
  const makeClouds = () => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const img = x.createImageData(512, 256);
    const rnd = mulberry(1996);
    const grid = []; for (let i = 0; i < 33 * 17; i++) grid.push(rnd());
    const val = (u, v, s) => {
      const gx = u / 512 * s, gy = v / 256 * (s / 2);
      const i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0;
      const at = (i, j) => grid[((j % 17 + 17) % 17) * 33 + ((i % s + s) % s)];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (at(i0, j0) * (1 - sx) + at(i0 + 1, j0) * sx) * (1 - sy) + (at(i0, j0 + 1) * (1 - sx) + at(i0 + 1, j0 + 1) * sx) * sy;
    };
    for (let v = 0; v < 256; v++) for (let u = 0; u < 512; u++) {
      const n = val(u, v, 4) * 0.55 + val(u, v, 8) * 0.28 + val(u, v, 16) * 0.17;
      const a = Math.max(0, Math.min(1, (n - 0.42) * 2.6)) * (0.35 + 0.65 * (1 - v / 256));
      const k = (v * 512 + u) * 4;
      img.data[k] = 40; img.data[k + 1] = 52; img.data[k + 2] = 68; img.data[k + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  };
  const resize = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops.length = 0;
    const n = Math.round(w * h / (reduce ? 16000 : 7000));
    for (let i = 0; i < n; i++) drops.push({ x: Math.random() * w, y: Math.random() * h, l: 8 + Math.random() * 18, v: 650 + Math.random() * 550, a: 0.12 + Math.random() * 0.25 });
  };
  clouds = makeClouds();
  resize();
  addEventListener('resize', resize);
  const onMove = (e) => { tpx = (e.clientX / innerWidth - 0.5); tpy = (e.clientY / innerHeight - 0.5); };
  if (!reduce) addEventListener('pointermove', onMove);
  let flash = 0, nextFlash = 4 + Math.random() * 5, bolt = null;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    px += (tpx - px) * 0.04; py += (tpy - py) * 0.04;
    nextFlash -= dt;
    if (nextFlash <= 0) {
      flash = 1; nextFlash = 7 + Math.random() * 11;
      if (!reduce) bolt = { x: w * (0.15 + Math.random() * 0.5), life: 0.35, seed: Math.random() * 1000 };
    }
    flash = Math.max(0, flash - dt * 3.2);
    if (bolt) { bolt.life -= dt; if (bolt.life <= 0) bolt = null; }
    const fl = reduce ? flash * 0.3 : flash * (0.6 + 0.4 * Math.abs(Math.sin(t * 40)));
    const portrait = h > w * 1.1;
    const seaY = h * (portrait ? 0.86 : 0.74);
    // cielo
    const sky = g.createLinearGradient(0, 0, 0, seaY);
    sky.addColorStop(0, `rgb(${8 + fl * 70},${11 + fl * 80},${17 + fl * 100})`);
    sky.addColorStop(1, `rgb(${16 + fl * 50},${21 + fl * 55},${29 + fl * 70})`);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // nubes en dos capas (paralaje)
    if (clouds) {
      g.save(); g.globalAlpha = 0.55 + fl * 0.45; g.imageSmoothingEnabled = true;
      for (const [sp, sc, yo, al] of [[6, 1.6, -0.05, 0.9], [14, 1.15, 0.12, 0.6]]) {
        const cw = w * sc, ch = seaY * 0.9 * sc;
        const off = ((t * sp + px * 30 * sc) % cw + cw) % cw;
        g.globalAlpha = (0.5 + fl * 0.5) * al;
        for (let k = -1; k < 2; k++) g.drawImage(clouds, k * cw - off, seaY * yo + py * 12, cw, ch);
      }
      g.restore();
    }
    // rayo
    if (bolt) {
      g.save(); g.strokeStyle = `rgba(220,230,255,${Math.min(1, bolt.life * 3)})`; g.lineWidth = 2; g.shadowColor = 'rgba(180,200,255,.9)'; g.shadowBlur = 18;
      g.beginPath(); let bx = bolt.x, by = 0; g.moveTo(bx, by);
      const r = mulberry(Math.floor(bolt.seed));
      while (by < seaY * 0.95) { bx += (r() - 0.5) * 46; by += 18 + r() * 34; g.lineTo(bx, by); }
      g.stroke(); g.restore();
    }
    // costa lejana con el Facho (roja fija) y Punta Insua (2 destellos cada 10 s)
    g.fillStyle = '#05070a';
    g.beginPath(); g.moveTo(0, seaY); g.lineTo(0, seaY - h * 0.03); g.quadraticCurveTo(w * 0.12, seaY - h * 0.075, w * 0.26, seaY - h * 0.02); g.lineTo(w * 0.3, seaY); g.fill();
    glow(g, w * 0.13, seaY - h * 0.068, 3.2, 'rgba(255,60,40,', 0.9, 16);
    const ins = t % 10, insOn = (ins < 0.35) || (ins > 1.2 && ins < 1.55);
    if (insOn) glow(g, w * 0.47, seaY - h * 0.012, 2.4, 'rgba(255,240,210,', 0.95, 18);
    // mar de fondo
    const sea = g.createLinearGradient(0, seaY, 0, h);
    sea.addColorStop(0, `rgb(${10 + fl * 30},${14 + fl * 34},${19 + fl * 42})`); sea.addColorStop(1, '#030405');
    g.fillStyle = sea; g.fillRect(0, seaY, w, h - seaY);
    // el faro de Cabo Néboa
    const lx = w * (w > h ? 0.8 : 0.78) + px * 14, base = seaY + h * 0.02;
    const th = Math.min(h * (portrait ? 0.15 : 0.26), 230), tw = Math.max(14, th * 0.11);
    const ly = base - th;
    // haz: un giro cada 15 s, tres paneles juntos → tres destellos y quince segundos de noche
    const rot = (t * Math.PI * 2 / 15) % (Math.PI * 2);
    let toward = 0;
    for (const off of [-0.36, 0, 0.36]) {
      const a = rot + off;
      const dir = Math.cos(a), tw2 = Math.sin(a);
      toward = Math.max(toward, tw2);
      const len = w * 1.25;
      const spread = 0.05 + 0.1 * Math.max(0, tw2);
      const alpha = 0.04 + 0.2 * Math.max(0, tw2);
      const ex = lx + dir * len, ey = ly - 6 - tw2 * 24;
      const gr = g.createLinearGradient(lx, ly, ex, ey);
      gr.addColorStop(0, `rgba(255,226,170,${alpha})`); gr.addColorStop(1, 'rgba(255,226,170,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(ex, ey - len * spread); g.lineTo(ex, ey + len * spread * 0.6); g.closePath(); g.fill();
      if (tw2 > 0.93) glow(g, lx, ly, 26, 'rgba(255,236,190,', (tw2 - 0.93) * 10, portrait ? 40 : 60);
    }
    // reflejo del haz en el mar
    g.save(); g.globalAlpha = 0.18 + toward * 0.3;
    const rf = g.createLinearGradient(lx, base, lx, h);
    rf.addColorStop(0, 'rgba(255,220,160,.5)'); rf.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = rf; g.fillRect(lx - 6 - toward * 30, base, 12 + toward * 60, h - base); g.restore();
    // acantilado y torre
    g.fillStyle = '#04060a';
    g.beginPath(); g.moveTo(lx - w * 0.22, h); g.lineTo(lx - w * 0.16, seaY + h * 0.01); g.quadraticCurveTo(lx - tw * 2, base - h * 0.012, lx, base - 2); g.quadraticCurveTo(lx + tw * 3, base + h * 0.01, lx + w * 0.3, seaY + h * 0.05); g.lineTo(w + 10, h); g.fill();
    g.fillStyle = '#080b10';
    g.beginPath(); g.moveTo(lx - tw * 0.7, base); g.lineTo(lx - tw * 0.48, ly + tw * 0.9); g.lineTo(lx + tw * 0.48, ly + tw * 0.9); g.lineTo(lx + tw * 0.7, base); g.fill();
    g.fillRect(lx - tw * 0.75, ly + tw * 0.75, tw * 1.5, tw * 0.18);
    g.fillStyle = `rgba(255,214,150,${0.35 + toward * 0.5})`; g.fillRect(lx - tw * 0.36, ly - tw * 0.05, tw * 0.72, tw * 0.8);
    g.fillStyle = '#080b10'; g.beginPath(); g.moveTo(lx - tw * 0.48, ly - tw * 0.05); g.quadraticCurveTo(lx, ly - tw * 0.75, lx + tw * 0.48, ly - tw * 0.05); g.fill();
    glow(g, lx, ly + tw * 0.32, 5, 'rgba(255,230,180,', 0.95, 30);
    // olas que rompen en el cabo
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.5 + i * 0.27) % 1;
      g.strokeStyle = `rgba(190,205,220,${(1 - ph) * 0.18})`; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(lx - w * 0.02, base + h * 0.012, w * (0.03 + ph * 0.12), h * (0.004 + ph * 0.012), 0, Math.PI, Math.PI * 2); g.stroke();
    }
    // lluvia
    g.strokeStyle = `rgba(160,180,210,${0.22 + fl * 0.4})`; g.lineWidth = 1;
    g.beginPath();
    for (const d of drops) {
      d.y += d.v * dt; d.x += d.v * dt * 0.2;
      if (d.y > h) { d.y = -20; d.x = Math.random() * w; }
      if (d.x > w) d.x -= w;
      g.moveTo(d.x, d.y); g.lineTo(d.x - d.l * 0.2, d.y - d.l);
    }
    g.stroke();
    // la vieja radio: osciloscopio con ráfagas cuando pasa cada destello
    const oy = h - Math.max(26, h * 0.035);
    const ph = t % 15;
    const burst = [0, 0.86, 1.72].some(c => ph >= c && ph < c + 0.25);
    g.strokeStyle = burst ? 'rgba(143,224,201,.75)' : 'rgba(143,224,201,.28)'; g.lineWidth = 1.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const n = (Math.random() - 0.5) * (burst ? 26 : 4) + Math.sin(x * 0.045 + t * 6) * 2.5 * Math.sin(t * 0.7);
      x ? g.lineTo(x, oy + n) : g.moveTo(x, oy + n);
    }
    g.stroke();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { stop: () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', onMove); } };
}

function glow(g, x, y, r, rgba, a, R) {
  const gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, rgba + a + ')'); gr.addColorStop(0.25, rgba + (a * 0.35) + ')'); gr.addColorStop(1, rgba + '0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 6.3); g.fill();
  g.fillStyle = rgba + Math.min(1, a + 0.2) + ')'; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
