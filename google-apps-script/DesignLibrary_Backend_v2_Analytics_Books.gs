// Design Library Analytics Backend — Google Apps Script
// Safe backend between Android app and Airtable.
// Store AIRTABLE_PAT in Project Settings > Script Properties.
// Do NOT paste the PAT into this source file.

const AIRTABLE_API = 'https://api.airtable.com/v0';
const BASE_ID = 'appAc2U1bp0Z5fs2E';
const STATS_TABLE_ID = 'tblcJ3AbevSLWgjae';
const EVENTS_TABLE_ID = 'tblMq8DNAUMtk0b7E';

// The current Airtable primary fields contain a hidden BOM character.
const STATS_RESOURCE_ID = '\uFEFFResourceID';
const EVENTS_EVENT_ID = '\uFEFFEventID';

const COUNTERS = {
  view: ['ViewsCount', 'LastViewedAt'],
  download: ['DownloadsCount', 'LastDownloadedAt'],
  share: ['SharesCount', 'LastSharedAt'],
  copy: ['CopiesCount', 'LastCopiedAt']
};

// 29 categories migrated from the previous books application.
// The Android app sends only categoryIndex; arbitrary Airtable bases are never accepted.
const BOOK_CATEGORIES = [
  ['أحدث 1200 كتاب', 'appd6ZyojA0LEFLh9', 'RecentBooks'],
  ['تصميم الأزياء والنسيج والطباعة', 'appXP28Tmn63kcjnY', 'RecentBooks'],
  ['التصميم الصناعي والحلي وعلوم الهندسة', 'apperIkXQ7iRGprhf', 'RecentBooks'],
  ['هندسة العمارة والتصميم الداخلي والنحت وما يتعلق بها', 'appFHjnZOo5bxFeqv', 'RecentBooks'],
  ['تصميم الجرافيك والإعلان والطباعة والفوتوغرافيا', 'appknoX75R1XHmgew', 'RecentBooks'],
  ['الفن والزخرفة والزجاج والخزف', 'apptUqYoOYUbC7sdl', 'RecentBooks'],
  ['علوم الحاسب وبرامج الجرافيك', 'app8VcusBQXJXmUKU', 'RecentBooks'],
  ['مجالات الزراعة والهندسة الزراعية', 'appgpodG0rNXiiTj1', 'RecentBooks'],
  ['مجالات الإبداع للمصمم الصغير وقصص الأطفال', 'appnjVrMgLourzkKm', 'RecentBooks'],
  ['الاعتماد والجودة والإدارة وتطوير الذات', 'appbxp3nGbyZ38Krr', 'RecentBooks'],
  ['علم النفس والتربية', 'appAmdXqeLjBpI946', 'RecentBooks'],
  ['اقتصاد', 'appfRddivVYPfT6aE', 'RecentBooks'],
  ['معاجم وقواميس', 'appK6PBWKcK9JrwcD', 'RecentBooks'],
  ['علم وهندسة في جميع المجالات', 'appGG7oysuKKdPoWi', 'RecentBooks'],
  ['فكر وفلسفة ومعارف عامة', 'app0DnljhJuY737DA', 'RecentBooks'],
  ['سلاسل الكتب وإصدارات دور النشر (1)', 'appF2Uo8CBLiVJcEP', 'RecentBooks'],
  ['سلاسل الكتب وإصدارات دور النشر (2)', 'appQ2N95c4Ju9Zwoj', 'RecentBooks'],
  ['المركز القومي للترجمة', 'apptnFCXZ9DANb7Uh', 'RecentBooks'],
  ['مناهج البحث العلمي', 'appudVhsKwaMqbhkq', 'RecentBooks'],
  ['كتب إسلامية', 'appnkEDhhx8um8IBV', 'RecentBooks'],
  ['كتب التاريخ', 'app9xtpa6RHlKlkPQ', 'RecentBooks'],
  ['روايات وأدب عربي وعالمي', 'appVhvu4DnjCEmUjD', 'RecentBooks'],
  ['كتب وروايات متنوعة — الجزء الأول', 'appTBmlkLnofysc5P', 'RecentBooks'],
  ['كتب تصميم وفن وعلم وهندسة — الجزء الثاني', 'appJTHR7xSUnJpbjy', 'RecentBooks'],
  ['كتب وروايات متنوعة — الجزء الثالث', 'appwkwfEUMAc7tDGE', 'RecentBooks'],
  ['كتب وروايات متنوعة — الجزء الرابع', 'appdbW4Azo3OBwoQd', 'RecentBooks'],
  ['كتب وروايات متنوعة — الجزء الخامس', 'appMRXhlEG00h2cLz', 'RecentBooks'],
  ['كتب وروايات متنوعة — الجزء السادس', 'appXhewtVLx2GTCbJ', 'RecentBooks'],
  ['كتب وروايات متنوعة — الجزء السابع', 'appItGNZr0fTNOXS7', 'RecentBooks']
];

function doGet() {
  return json_({ ok: true, service: 'Design Library Analytics', status: 'ready' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.op === 'event') return json_(handleEvent_(body));
    if (body.op === 'stats') return json_(handleStats_(body));
    if (body.op === 'books_list') return json_(handleBooksList_(body));
    if (body.op === 'books_view') return json_(handleBookView_(body));
    return json_({ ok: false, error: 'Unknown op' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function pat_() {
  const value = PropertiesService.getScriptProperties().getProperty('AIRTABLE_PAT');
  if (!value) throw new Error('AIRTABLE_PAT is not configured in Script Properties');
  return value;
}

function cleanText_(value, maxLen) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function validResourceId_(value) {
  return /^(gdrive_[A-Za-z0-9_-]{6,160}|res_[a-z0-9]{3,32})$/.test(value);
}

function escapeFormula_(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function airtable_(path, method, body) {
  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + pat_(),
      'Content-Type': 'application/json'
    }
  };
  if (body !== undefined) options.payload = JSON.stringify(body);

  const res = UrlFetchApp.fetch(AIRTABLE_API + '/' + path, options);
  const status = res.getResponseCode();
  const text = res.getContentText();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; }
  catch (_) { parsed = { raw: text }; }

  if (status < 200 || status >= 300) {
    throw new Error('Airtable ' + status + ': ' + text);
  }
  return parsed;
}

function findStatRecord_(resourceId) {
  const formula = '{' + STATS_RESOURCE_ID + "}='" + escapeFormula_(resourceId) + "'";
  const qs = 'maxRecords=1&filterByFormula=' + encodeURIComponent(formula);
  const data = airtable_(BASE_ID + '/' + STATS_TABLE_ID + '?' + qs, 'get');
  return data.records && data.records.length ? data.records[0] : null;
}

function publicStats_(fields) {
  fields = fields || {};
  return {
    ViewsCount: Number(fields.ViewsCount || 0),
    DownloadsCount: Number(fields.DownloadsCount || 0),
    SharesCount: Number(fields.SharesCount || 0),
    CopiesCount: Number(fields.CopiesCount || 0)
  };
}

function createStatRecord_(meta, action, language) {
  const fields = {};
  fields[STATS_RESOURCE_ID] = meta.resourceId;
  fields.ResourceTitle = meta.resourceTitle;
  fields.Category = meta.category;
  fields.ViewsCount = 0;
  fields.DownloadsCount = 0;
  fields.SharesCount = 0;
  fields.CopiesCount = 0;
  fields.Language = language;

  const pair = COUNTERS[action];
  fields[pair[0]] = 1;
  fields[pair[1]] = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');

  const data = airtable_(BASE_ID + '/' + STATS_TABLE_ID, 'post', {
    records: [{ fields: fields }],
    typecast: true
  });
  return data.records[0];
}

function incrementStatRecord_(record, meta, action, language) {
  const pair = COUNTERS[action];
  const counterField = pair[0];
  const dateField = pair[1];

  const fields = {};
  fields[counterField] = Number((record.fields || {})[counterField] || 0) + 1;
  fields[dateField] = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  fields.Language = language;
  if (meta.resourceTitle) fields.ResourceTitle = meta.resourceTitle;
  if (meta.category) fields.Category = meta.category;

  const data = airtable_(BASE_ID + '/' + STATS_TABLE_ID, 'patch', {
    records: [{ id: record.id, fields: fields }],
    typecast: true
  });
  return data.records[0];
}

function createEvent_(meta, action, language, appVersion) {
  const fields = {};
  fields[EVENTS_EVENT_ID] = Utilities.getUuid();
  fields.ResourceID = meta.resourceId;
  fields.ResourceTitle = meta.resourceTitle;
  fields.Category = meta.category;
  fields.Action = action;
  fields.EventTimestamp = new Date().toISOString();
  fields.Language = language;
  fields.AppVersion = Number(appVersion) || 52;

  airtable_(BASE_ID + '/' + EVENTS_TABLE_ID, 'post', {
    records: [{ fields: fields }],
    typecast: true
  });
}

function handleEvent_(body) {
  const action = cleanText_(body.action, 16).toLowerCase();
  if (!COUNTERS[action]) return { ok: false, error: 'Unsupported action' };

  const resourceId = cleanText_(body.resourceId, 180);
  if (!validResourceId_(resourceId)) return { ok: false, error: 'Invalid resourceId' };

  const meta = {
    resourceId: resourceId,
    resourceTitle: cleanText_(body.resourceTitle, 180),
    category: cleanText_(body.category, 160)
  };
  const language = body.language === 'en' ? 'en' : 'ar';
  const appVersion = Number(body.appVersion || 52);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let record;
  try {
    record = findStatRecord_(resourceId);
    record = record
      ? incrementStatRecord_(record, meta, action, language)
      : createStatRecord_(meta, action, language);
  } finally {
    lock.releaseLock();
  }

  try { createEvent_(meta, action, language, appVersion); } catch (_) {}

  return {
    ok: true,
    resourceId: resourceId,
    stats: publicStats_(record.fields)
  };
}

function handleStats_(body) {
  const raw = Array.isArray(body.ids) ? body.ids : [];
  const seen = {};
  const ids = [];

  raw.forEach(function(v) {
    const id = cleanText_(v, 180);
    if (validResourceId_(id) && !seen[id] && ids.length < 120) {
      seen[id] = true;
      ids.push(id);
    }
  });

  if (!ids.length) return { ok: true, stats: {} };

  const out = {};
  const batchSize = 15;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const parts = batch.map(function(id) {
      return '{' + STATS_RESOURCE_ID + "}='" + escapeFormula_(id) + "'";
    });
    const formula = 'OR(' + parts.join(',') + ')';
    const qs = 'pageSize=100&filterByFormula=' + encodeURIComponent(formula);
    const data = airtable_(BASE_ID + '/' + STATS_TABLE_ID + '?' + qs, 'get');

    (data.records || []).forEach(function(record) {
      const id = (record.fields || {})[STATS_RESOURCE_ID];
      if (id) out[id] = publicStats_(record.fields);
    });

    if (i + batchSize < ids.length) Utilities.sleep(220);
  }

  return { ok: true, stats: out };
}

function bookCategory_(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= BOOK_CATEGORIES.length) {
    throw new Error('Invalid categoryIndex');
  }
  return BOOK_CATEGORIES[i];
}

function encodePathPart_(value) {
  return encodeURIComponent(String(value || '')).replace(/%2F/gi, '/');
}

function bookFieldString_(fields, names) {
  fields = fields || {};
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (!Object.prototype.hasOwnProperty.call(fields, name) || fields[name] === null || fields[name] === undefined) continue;
    const v = fields[name];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  }
  return '';
}

function bookAttachmentOrString_(fields, names) {
  fields = fields || {};
  for (let i = 0; i < names.length; i++) {
    const v = fields[names[i]];
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length && v[0] && v[0].url) return String(v[0].url);
  }
  return '';
}

function bookRecordPublic_(record) {
  const fields = (record && record.fields) || {};
  let downloads = bookFieldString_(fields, ['downloads', 'Downloads']);
  let url = bookFieldString_(fields, ['url', 'URL', 'link', 'Link']);
  if (!url && /^https?:\/\//i.test(downloads)) url = downloads;
  return {
    id: String((record && record.id) || ''),
    title: bookFieldString_(fields, ['title', 'Title', 'name', 'Name']),
    subtitle: bookFieldString_(fields, ['subtitle', 'Subtitle', 'description', 'Description']),
    url: url,
    downloads: downloads,
    date: bookFieldString_(fields, ['date', 'Date']),
    views: bookFieldString_(fields, ['Views', 'views']),
    image: bookAttachmentOrString_(fields, ['image', 'Image', 'cover', 'Cover'])
  };
}

function handleBooksList_(body) {
  const category = bookCategory_(body.categoryIndex);
  const baseId = category[1];
  const tableName = category[2];
  const pageSize = Math.max(1, Math.min(Number(body.pageSize || 50), 50));
  const offset = cleanText_(body.offset || '', 500);

  let path = encodePathPart_(baseId) + '/' + encodePathPart_(tableName) + '?pageSize=' + pageSize;
  if (offset) path += '&offset=' + encodeURIComponent(offset);

  const data = airtable_(path, 'get');
  return {
    ok: true,
    categoryIndex: Number(body.categoryIndex),
    categoryTitle: category[0],
    offset: String(data.offset || ''),
    records: (data.records || []).map(bookRecordPublic_)
  };
}

function handleBookView_(body) {
  const category = bookCategory_(body.categoryIndex);
  const recordId = cleanText_(body.recordId || '', 80);
  if (!/^rec[A-Za-z0-9]{10,}$/.test(recordId)) throw new Error('Invalid recordId');

  const baseId = category[1];
  const tableName = category[2];
  const path = encodePathPart_(baseId) + '/' + encodePathPart_(tableName) + '/' + encodePathPart_(recordId);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const current = airtable_(path, 'get');
    const fields = (current && current.fields) || {};
    let value = Number(fields.Views || fields.views || 0);
    if (!Number.isFinite(value)) value = 0;
    const next = Math.round(value) + 1;
    const payload = { fields: { Views: next }, typecast: true };
    const updated = airtable_(path, 'patch', payload);
    const actual = Number((updated.fields || {}).Views || next);
    return { ok: true, views: Number.isFinite(actual) ? Math.round(actual) : next };
  } finally {
    lock.releaseLock();
  }
}
