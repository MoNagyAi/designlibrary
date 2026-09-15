const AIRTABLE_API = 'https://api.airtable.com/v0';
const DEFAULT_BASE_ID = 'appAc2U1bp0Z5fs2E';
const DEFAULT_STATS_TABLE_ID = 'tblcJ3AbevSLWgjae';
const DEFAULT_EVENTS_TABLE_ID = 'tblMq8DNAUMtk0b7E';
const STATS_RESOURCE_ID = '\uFEFFResourceID';
const EVENTS_EVENT_ID = '\uFEFFEventID';

const COUNTERS = {
  view: ['ViewsCount', 'LastViewedAt'],
  download: ['DownloadsCount', 'LastDownloadedAt'],
  share: ['SharesCount', 'LastSharedAt'],
  copy: ['CopiesCount', 'LastCopiedAt'],
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function validResourceId(value) {
  return /^(gdrive_[A-Za-z0-9_-]{6,160}|res_[a-z0-9]{3,32})$/.test(value);
}

function escapeFormulaString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function airtable(env, path, options = {}) {
  if (!env.AIRTABLE_PAT) throw new Error('AIRTABLE_PAT is not configured');
  const response = await fetch(`${AIRTABLE_API}/${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.AIRTABLE_PAT}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Airtable ${response.status}: ${text}`);
  return body;
}

function idsConfig(env) {
  return {
    baseId: env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID,
    statsTableId: env.AIRTABLE_STATS_TABLE_ID || DEFAULT_STATS_TABLE_ID,
    eventsTableId: env.AIRTABLE_EVENTS_TABLE_ID || DEFAULT_EVENTS_TABLE_ID,
  };
}

async function findStatRecord(env, resourceId) {
  const { baseId, statsTableId } = idsConfig(env);
  const formula = `{${STATS_RESOURCE_ID}}='${escapeFormulaString(resourceId)}'`;
  const qs = new URLSearchParams({ maxRecords: '1', filterByFormula: formula });
  const data = await airtable(env, `${baseId}/${statsTableId}?${qs.toString()}`);
  return data.records && data.records.length ? data.records[0] : null;
}

async function createStatRecord(env, meta, action, language) {
  const { baseId, statsTableId } = idsConfig(env);
  const fields = {
    [STATS_RESOURCE_ID]: meta.resourceId,
    ResourceTitle: meta.resourceTitle,
    Category: meta.category,
    ViewsCount: 0,
    DownloadsCount: 0,
    SharesCount: 0,
    CopiesCount: 0,
    Language: language,
  };
  const [counterField, dateField] = COUNTERS[action];
  fields[counterField] = 1;
  fields[dateField] = new Date().toISOString().slice(0, 10);
  const data = await airtable(env, `${baseId}/${statsTableId}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return data.records[0];
}

async function incrementStatRecord(env, record, meta, action, language) {
  const { baseId, statsTableId } = idsConfig(env);
  const [counterField, dateField] = COUNTERS[action];
  const current = Number(record.fields?.[counterField] || 0);
  const fields = {
    [counterField]: current + 1,
    [dateField]: new Date().toISOString().slice(0, 10),
    Language: language,
  };
  if (meta.resourceTitle) fields.ResourceTitle = meta.resourceTitle;
  if (meta.category) fields.Category = meta.category;
  const data = await airtable(env, `${baseId}/${statsTableId}`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: record.id, fields }], typecast: true }),
  });
  return data.records[0];
}

async function createEvent(env, meta, action, language, appVersion) {
  const { baseId, eventsTableId } = idsConfig(env);
  const fields = {
    [EVENTS_EVENT_ID]: crypto.randomUUID(),
    ResourceID: meta.resourceId,
    ResourceTitle: meta.resourceTitle,
    Category: meta.category,
    Action: action,
    EventTimestamp: new Date().toISOString(),
    Language: language,
    AppVersion: Number(appVersion) || 52,
  };
  await airtable(env, `${baseId}/${eventsTableId}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
}

function publicStats(fields = {}) {
  return {
    ViewsCount: Number(fields.ViewsCount || 0),
    DownloadsCount: Number(fields.DownloadsCount || 0),
    SharesCount: Number(fields.SharesCount || 0),
    CopiesCount: Number(fields.CopiesCount || 0),
  };
}

async function handleEvent(env, body) {
  const action = cleanText(body.action, 16).toLowerCase();
  if (!COUNTERS[action]) return json({ error: 'Unsupported action' }, 400);

  const resourceId = cleanText(body.resourceId, 180);
  if (!validResourceId(resourceId)) return json({ error: 'Invalid resourceId' }, 400);

  const meta = {
    resourceId,
    resourceTitle: cleanText(body.resourceTitle, 180),
    category: cleanText(body.category, 160),
  };
  const language = body.language === 'en' ? 'en' : 'ar';
  const appVersion = Number(body.appVersion || 52);

  let record = await findStatRecord(env, resourceId);
  record = record
    ? await incrementStatRecord(env, record, meta, action, language)
    : await createStatRecord(env, meta, action, language);

  try { await createEvent(env, meta, action, language, appVersion); } catch (_) {}

  return json({ ok: true, resourceId, stats: publicStats(record.fields) });
}

async function handleStats(env, body) {
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map(v => cleanText(v, 180)).filter(validResourceId))].slice(0, 120)
    : [];
  if (!ids.length) return json({ ok: true, stats: {} });

  const { baseId, statsTableId } = idsConfig(env);
  const out = {};
  const batchSize = 15;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const formula = `OR(${batch.map(id => `{${STATS_RESOURCE_ID}}='${escapeFormulaString(id)}'`).join(',')})`;
    const qs = new URLSearchParams({ pageSize: '100', filterByFormula: formula });
    const data = await airtable(env, `${baseId}/${statsTableId}?${qs.toString()}`);
    for (const record of (data.records || [])) {
      const id = record.fields?.[STATS_RESOURCE_ID];
      if (id) out[id] = publicStats(record.fields);
    }
    if (i + batchSize < ids.length) await new Promise(r => setTimeout(r, 220));
  }
  return json({ ok: true, stats: out });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    try {
      if (body.op === 'event') return await handleEvent(env, body);
      if (body.op === 'stats') return await handleStats(env, body);
      return json({ error: 'Unknown op' }, 400);
    } catch (error) {
      return json({ error: String(error?.message || error) }, 500);
    }
  },
};
