// Puntuación del juego, sin conversión a IQ ni baremos psicométricos.
const TASKS = {
  radio: ['power', 'tune', 'clear', 'tx', 'msg'],
  linterna: ['gears', 'kero'],
  archivo: ['call', 'letter', 'page'],
  carta: ['cross', 'cover', 'sw'],
};
export function reasoningReport(state, personalIq = null) {
  const credits = state.st?.cr || {};
  const rows = Object.entries(state.players || {}).map(([pid, p]) => {
    const tasks = [...new Set((p.r0 || p.r || []).flatMap(r => TASKS[r] || []))];
    const done = tasks.filter(k => credits[k] === pid).length;
    return { pid, name: p.n, done, total: tasks.length, score: tasks.length ? Math.round(done / tasks.length * 100) : null, iq: p.iq ?? (pid === 'solo' ? personalIq : null) };
  });
  const scored = rows.filter(r => r.score !== null), iqRows = rows.filter(r => Number.isFinite(r.iq));
  return {
    rows,
    mean: scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : null,
    iqMean: iqRows.length ? Math.round(iqRows.reduce((s, r) => s + r.iq, 0) / iqRows.length) : null,
    iqCount: iqRows.length,
  };
}
