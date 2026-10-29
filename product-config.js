// Product configs contain data only. Never evaluate expressions from a config.
export function formatText(template, values) {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, key) => String(values[key] ?? ''));
}

const DATE_WORDS = {
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  },
  sv: {
    months: ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'],
    days: ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
  }
};

export function dateParts(value, lang = 'en') {
  const words = DATE_WORDS[lang] || DATE_WORDS.en;
  const date = new Date(value + 'T12:00:00');
  if (isNaN(date)) return null;
  return {
    wd: words.days[date.getDay()],
    day: String(date.getDate()),
    month: words.months[date.getMonth()],
    year: String(date.getFullYear())
  };
}

export function validateProduct(p) {
  const fail = () => { throw new Error('Invalid invitation configuration.'); };
  if (!p || p.schemaVersion !== 1 || typeof p.title !== 'string' || !p.title.trim()) fail();
  if (p.lang !== undefined && !['en', 'sv'].includes(p.lang)) fail();
  if (!Array.isArray(p.fields) || !p.fields.length || !Array.isArray(p.more)) fail();
  const keys = new Set();
  for (const f of [...p.fields, ...p.more]) {
    if (!Array.isArray(f) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(f[0]) || keys.has(f[0]) || typeof f[1] !== 'string' || typeof f[2] !== 'string' || !Number.isInteger(f[3]) || f[3] < 0) fail();
    if (f[4] && !['text', 'date', 'select'].includes(f[4])) fail();
    if (f[4] === 'select' && (!Array.isArray(f[5]) || !f[5].length || f[5].some(s => typeof s !== 'string') || !f[5].includes(f[2]))) fail();
    keys.add(f[0]);
  }
  // Only the shared date and closing helpers are required by the renderer.
  // Product-specific fields such as venue or RSVP may be omitted when a
  // shorter invitation type does not use them.
  for (const required of ['date', 'closing', 'monogram']) if (!keys.has(required)) fail();
  if (!Array.isArray(p.themes) || !p.themes.length || new Set(p.themes).size !== p.themes.length) fail();
  for (const key of p.themes) {
    const t = p.themeStyles?.[key];
    if (!/^[a-z][a-z0-9_-]*$/.test(key) || !t || typeof t.name !== 'string' || typeof t.sw !== 'string') fail();
    for (const color of [t.ink, t.seal]) if (!Array.isArray(color) || color.length !== 3 || color.some(n => !Number.isFinite(n) || n < 0 || n > 255)) fail();
    if (!/^assets\/[a-zA-Z0-9_-]+\.mp4$/.test(t.video) || !/^assets\/[a-zA-Z0-9_-]+\.jpg$/.test(t.card)) fail();
  }
  if (!p.monogram || !Array.isArray(p.monogram.fields) || p.monogram.fields.some(k => !keys.has(k)) || typeof p.monogram.separator !== 'string' || typeof p.monogram.fallback !== 'string' || typeof p.monogram.hint !== 'string') fail();
  if (!p.reply || typeof p.reply.withDate !== 'string' || typeof p.reply.withoutDate !== 'string' || typeof p.dateLine !== 'string' || typeof p.fileName !== 'string') fail();
  const checkRows = rows => {
    if (!Array.isArray(rows) || !rows.length) fail();
    for (const row of rows) {
      if (!row || !['text', 'date', 'divider'].includes(row.type) || !Number.isFinite(row.y) || (row.delay !== undefined && (!Number.isFinite(row.delay) || row.delay < 0))) fail();
      if (row.type === 'text' && (typeof row.text !== 'string' || !['script', 'serif', 'ital'].includes(row.font) || !['gold', 'ink'].includes(row.color) || !Number.isFinite(row.size) || row.size <= 0)) fail();
      if (row.options !== undefined) {
        if (!row.options || typeof row.options !== 'object' || Array.isArray(row.options)) fail();
        for (const key of Object.keys(row.options)) if (!['weight', 'track', 'caps', 'maxw', 'cx', 'shimmer'].includes(key)) fail();
        for (const key of ['weight', 'track', 'maxw', 'cx']) if (row.options[key] !== undefined && (!Number.isFinite(row.options[key]) || row.options[key] < 0)) fail();
        for (const key of ['caps', 'shimmer']) if (row.options[key] !== undefined && typeof row.options[key] !== 'boolean') fail();
      }
    }
  };
  if (!Array.isArray(p.scenes) || !p.scenes.length || !p.card || !Number.isFinite(p.card.offsetY)) fail();
  for (const scene of p.scenes) {
    if (!Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.start < 0 || scene.end <= scene.start) fail();
    checkRows(scene.rows);
  }
  checkRows(p.card.rows);
  return p;
}

export async function loadProduct(search = location.search) {
  const key = new URLSearchParams(search).get('p') || 'wedding';
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key)) throw new Error('Invalid invitation link.');
  const response = await fetch(`products/${key}.json`);
  if (!response.ok) throw new Error('Invitation configuration could not be loaded.');
  return { key, product: validateProduct(await response.json()) };
}
