/* =====================================================================
   dg-storage.js  |  CalmNest Diary Garden: data layer

   The ONLY file that touches localStorage. It never touches the DOM
   (except the optional downloadBackup helper), so it can be swapped for
   Flask/SQLite calls later without changing the UI modules.

   Namespace: window.CalmNestDG.Storage

   Every operation returns either { ok: true, ... } or
   { ok: false, error: "code", message: "text safe to show the user" }.
   Nothing here throws.

   Data shapes
     Entry      { id, date "YYYY-MM-DD", mood, title, text,
                  stickers [{ type, x, y, size, rot }], createdAt, updatedAt }
     Collection { id, name, accent, entryIds [], createdAt, updatedAt }
     "All Thoughts" is virtual (id "all"): it is never stored.

   Public API
     init()                              setup; safe to call more than once
     isPersistent(), getWarnings()
     todayISO()
     subscribe(fn)                       returns an unsubscribe function
     listEntries({collectionId, query, sort})   sort: "new" | "old"
     getEntry(id)
     createEntry(input), updateEntry(id, input), deleteEntry(id)
     getEntryCollectionIds(entryId), setEntryCollections(entryId, ids)
     listTabs(), getCollection(id), getStats()
     createCollection(name, accent), renameCollection(id, name, accent)
     deleteCollection(id)                entries are NOT deleted
     exportData(), downloadBackup()
     readFileText(file), parseImport(text), applyImport(payload, mode)
     hasPreImportBackup(), restorePreImport()
   ===================================================================== */
(function () {
  'use strict';

  const NS = (window.CalmNestDG = window.CalmNestDG || {});
  if (NS.Storage) { return; }

  /* ------------------------------ constants ------------------------------ */
  const PREFIX = 'calmnest.dg.v1.';
  const KEYS = Object.freeze({
    entries: PREFIX + 'entries',
    collections: PREFIX + 'collections',
    meta: PREFIX + 'meta',
    corruptEntries: PREFIX + 'corrupt.entries',
    corruptCollections: PREFIX + 'corrupt.collections',
    preImport: PREFIX + 'backup.preimport'
  });
  const SCHEMA = 1;
  const APP_NAME = 'CalmNest Diary Garden';
  const ALL_ID = 'all';
  const ALL_NAME = 'All Thoughts';
  const MOODS = Object.freeze(['joyful', 'calm', 'hopeful', 'tired', 'anxious', 'low']);
  const ACCENTS = Object.freeze(['sky', 'butter', 'pink', 'sage']);
  const LIMITS = Object.freeze({
    title: 60,
    text: 2000,
    collectionName: 40,
    collections: 50,
    stickers: 30,
    minSize: 28,
    maxSize: 160,
    defaultSize: 64,
    importBytes: 5 * 1024 * 1024
  });
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const STICKER_RE = /^[a-z0-9][a-z0-9:_-]{0,47}$/i;
  const CONTROL_KEEP_NEWLINES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  /* ------------------------------ small helpers ------------------------------ */
  const pad = (n) => String(n).padStart(2, '0');
  const nowIso = () => new Date().toISOString();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round1 = (n) => Math.round(n * 10) / 10;
  const fail = (error, message) => ({ ok: false, error: error, message: message });

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isIsoDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) { return false; }
    const y = +s.slice(0, 4);
    const m = +s.slice(5, 7);
    const d = +s.slice(8, 10);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  const validIso = (s) => typeof s === 'string' && !isNaN(Date.parse(s));
  const normIso = (s, fallback) => (validIso(s) ? new Date(s).toISOString() : fallback);

  function cleanLine(v, max) {
    if (typeof v !== 'string') { return ''; }
    return v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function cleanText(v, max) {
    if (typeof v !== 'string') { return ''; }
    return v.replace(/\r\n?/g, '\n').replace(CONTROL_KEEP_NEWLINES, '').trim().slice(0, max);
  }

  function randomPart() {
    try {
      const a = new Uint32Array(2);
      window.crypto.getRandomValues(a);
      return a[0].toString(36) + a[1].toString(36);
    } catch (e) {
      return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
  }

  function uid(prefix, taken) {
    let id;
    do {
      id = prefix + Date.now().toString(36) + randomPart().slice(0, 8);
    } while (taken && taken.has(id));
    return id;
  }

  function isQuota(err) {
    return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 || err.code === 1014);
  }

  /* ------------------------------ validation ------------------------------ */
  function cleanSticker(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string' || !STICKER_RE.test(raw.type)) {
      return null;
    }
    const x = Number(raw.x);
    const y = Number(raw.y);
    const size = Number(raw.size);
    const rot = Number(raw.rot);
    return {
      type: raw.type,
      x: round1(clamp(isFinite(x) ? x : 50, 0, 100)),
      y: round1(clamp(isFinite(y) ? y : 50, 0, 100)),
      size: Math.round(clamp(isFinite(size) ? size : LIMITS.defaultSize, LIMITS.minSize, LIMITS.maxSize)),
      rot: Math.round(clamp(isFinite(rot) ? rot : 0, -180, 180))
    };
  }

  /* strict = true for user input (create / update); false when loading data */
  function cleanFields(raw, strict) {
    if (!raw || typeof raw !== 'object') {
      return fail('invalid', 'Something went wrong with that page.');
    }
    const text = cleanText(raw.text, LIMITS.text);
    const title = cleanLine(raw.title, LIMITS.title);
    if (strict) {
      if (!isIsoDate(raw.date)) { return fail('bad-date', 'Please choose a valid date.'); }
      if (MOODS.indexOf(raw.mood) === -1) { return fail('bad-mood', 'Please pick how you are feeling.'); }
      if (!text) { return fail('empty-text', 'Write a few words before saving.'); }
    } else if (!text && !title) {
      return fail('empty', 'Empty page.');
    }
    const stickers = [];
    if (Array.isArray(raw.stickers)) {
      for (let i = 0; i < raw.stickers.length && stickers.length < LIMITS.stickers; i++) {
        const s = cleanSticker(raw.stickers[i]);
        if (s) { stickers.push(s); }
      }
    }
    return {
      ok: true,
      fields: {
        date: isIsoDate(raw.date) ? raw.date : '',
        mood: MOODS.indexOf(raw.mood) !== -1 ? raw.mood : 'calm',
        title: title,
        text: text,
        stickers: stickers
      }
    };
  }

  function cleanEntryRecord(raw, taken) {
    const r = cleanFields(raw, false);
    if (!r.ok) { return null; }
    const created = normIso(raw.createdAt, nowIso());
    const updated = normIso(raw.updatedAt, created);
    let id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : null;
    if (!id || taken.has(id)) { id = uid('e', taken); }
    taken.add(id);
    return {
      id: id,
      date: r.fields.date || created.slice(0, 10),
      mood: r.fields.mood,
      title: r.fields.title,
      text: r.fields.text,
      stickers: r.fields.stickers,
      createdAt: created,
      updatedAt: updated
    };
  }

  const normName = (v) => cleanLine(v, LIMITS.collectionName);
  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
  const isReserved = (name) => sameName(name, ALL_NAME);

  function uniqueName(name, used) {
    let n = name;
    let i = 2;
    while (isReserved(n) || used.has(n.toLowerCase())) {
      const suffix = ' (' + i + ')';
      i += 1;
      n = name.slice(0, LIMITS.collectionName - suffix.length) + suffix;
    }
    used.add(n.toLowerCase());
    return n;
  }

  function cleanCollectionRecord(raw, taken, used) {
    if (!raw || typeof raw !== 'object') { return null; }
    const name = uniqueName(normName(raw.name) || 'Untitled garden', used);
    let id = typeof raw.id === 'string' && ID_RE.test(raw.id) && raw.id !== ALL_ID ? raw.id : null;
    if (!id || taken.has(id)) { id = uid('c', taken); }
    taken.add(id);
    const seen = new Set();
    const entryIds = [];
    if (Array.isArray(raw.entryIds)) {
      raw.entryIds.forEach(function (x) {
        if (typeof x === 'string' && !seen.has(x)) { seen.add(x); entryIds.push(x); }
      });
    }
    const created = normIso(raw.createdAt, nowIso());
    return {
      id: id,
      name: name,
      accent: ACCENTS.indexOf(raw.accent) !== -1 ? raw.accent : ACCENTS[0],
      entryIds: entryIds,
      createdAt: created,
      updatedAt: normIso(raw.updatedAt, created)
    };
  }

  function sanitizeCollections(list) {
    const taken = new Set();
    const used = new Set();
    const out = [];
    list.forEach(function (raw) {
      const c = cleanCollectionRecord(raw, taken, used);
      if (c) { out.push(c); }
    });
    return out;
  }

  /* Drop collection references to entries that no longer exist */
  function reconcile(entries, collections) {
    const ids = new Set(entries.map(function (e) { return e.id; }));
    return collections.map(function (c) {
      const seen = new Set();
      const entryIds = [];
      c.entryIds.forEach(function (id) {
        if (ids.has(id) && !seen.has(id)) { seen.add(id); entryIds.push(id); }
      });
      return Object.assign({}, c, { entryIds: entryIds });
    });
  }

  /* ------------------------------ state ------------------------------ */
  const state = { entries: [], collections: [] };
  let ready = false;
  let persistent = false;
  let warnings = [];
  const listeners = [];

  function subscribe(fn) {
    if (typeof fn !== 'function') { return function () {}; }
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i !== -1) { listeners.splice(i, 1); }
    };
  }

  function notify(evt) {
    listeners.slice().forEach(function (fn) {
      try { fn(evt); } catch (e) { console.error('[CalmNestDG.Storage] listener error', e); }
    });
  }

  function storageAvailable() {
    try {
      const ls = window.localStorage;
      const k = PREFIX + 'probe';
      ls.setItem(k, '1');
      ls.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readList(key, corruptKey, label) {
    let raw = null;
    try { raw = window.localStorage.getItem(key); } catch (e) { return []; }
    if (raw === null) { return []; }
    try {
      const v = JSON.parse(raw);
      if (!Array.isArray(v)) { throw new Error('not a list'); }
      return v;
    } catch (e) {
      let kept = false;
      try { window.localStorage.setItem(corruptKey, raw); kept = true; } catch (e2) { /* quota */ }
      warnings.push('Your saved ' + label + ' could not be read' +
        (kept ? ', so a copy was set aside and the list was reset.' : ' and had to be reset.'));
      return [];
    }
  }

  function loadState() {
    const rawE = readList(KEYS.entries, KEYS.corruptEntries, 'diary pages');
    const rawC = readList(KEYS.collections, KEYS.corruptCollections, 'collections');
    const taken = new Set();
    const entries = rawE.map(function (r) { return cleanEntryRecord(r, taken); }).filter(Boolean);
    if (entries.length < rawE.length) {
      warnings.push((rawE.length - entries.length) + ' saved page(s) could not be read and were skipped.');
    }
    state.entries = entries;
    state.collections = reconcile(entries, sanitizeCollections(rawC));
  }

  function checkMeta() {
    try {
      const raw = window.localStorage.getItem(KEYS.meta);
      if (!raw) { return; }
      const meta = JSON.parse(raw);
      if (meta && typeof meta.version === 'number' && meta.version > SCHEMA) {
        warnings.push('This garden was saved by a newer version. Some details may not display correctly.');
      }
    } catch (e) { /* ignore */ }
  }

  function onExternalChange(e) {
    if (e.key !== null && e.key !== KEYS.entries && e.key !== KEYS.collections) { return; }
    const prior = warnings;
    warnings = [];
    loadState();
    warnings = prior.concat(warnings);
    notify({ type: 'external' });
  }

  function init() {
    if (ready) { return status(); }
    ready = true;
    warnings = [];
    persistent = storageAvailable();
    if (persistent) {
      loadState();
      checkMeta();
      window.addEventListener('storage', onExternalChange);
    } else {
      warnings.push('Saving is not available in this browser (private mode or blocked storage). ' +
        'Your pages will last only until you close this tab. Export a backup before leaving.');
    }
    return status();
  }

  function status() { return { ok: true, persistent: persistent, warnings: warnings.slice() }; }
  function ensureInit() { if (!ready) { init(); } }
  function isPersistent() { ensureInit(); return persistent; }
  function getWarnings() { ensureInit(); return warnings.slice(); }

  /* Write both lists; roll back if anything fails. Commits to memory on success. */
  function persist(nextEntries, nextCollections) {
    if (!persistent) {
      state.entries = nextEntries;
      state.collections = nextCollections;
      return { ok: true };
    }
    const ls = window.localStorage;
    let prevE = null;
    let prevC = null;
    try {
      prevE = ls.getItem(KEYS.entries);
      prevC = ls.getItem(KEYS.collections);
    } catch (e) { /* ignore */ }

    const restore = function (key, prev) {
      if (prev === null) { ls.removeItem(key); } else { ls.setItem(key, prev); }
    };

    try {
      ls.setItem(KEYS.entries, JSON.stringify(nextEntries));
      ls.setItem(KEYS.collections, JSON.stringify(nextCollections));
    } catch (err) {
      try { restore(KEYS.entries, prevE); restore(KEYS.collections, prevC); } catch (e2) { /* ignore */ }
      return isQuota(err)
        ? fail('storage-full', 'Your browser storage is full. Export a backup and remove some pages, then try again.')
        : fail('storage-failed', 'Your browser would not let this be saved. Try exporting a backup.');
    }
    try { ls.setItem(KEYS.meta, JSON.stringify({ version: SCHEMA, updatedAt: nowIso() })); } catch (e3) { /* optional */ }

    state.entries = nextEntries;
    state.collections = nextCollections;
    return { ok: true };
  }

  /* ------------------------------ entries ------------------------------ */
  function applyMembership(collections, entryId, wantedIds) {
    const want = new Set(wantedIds.filter(function (x) { return typeof x === 'string'; }));
    return collections.map(function (c) {
      const has = c.entryIds.indexOf(entryId) !== -1;
      const should = want.has(c.id);
      if (has === should) { return c; }
      const entryIds = should
        ? c.entryIds.concat([entryId])
        : c.entryIds.filter(function (x) { return x !== entryId; });
      return Object.assign({}, c, { entryIds: entryIds, updatedAt: nowIso() });
    });
  }

  function listEntries(opts) {
    ensureInit();
    opts = opts || {};
    let list = state.entries;
    const cid = opts.collectionId || ALL_ID;

    if (cid !== ALL_ID) {
      const c = state.collections.find(function (x) { return x.id === cid; });
      if (!c) { return []; }
      const set = new Set(c.entryIds);
      list = list.filter(function (e) { return set.has(e.id); });
    }

    const words = String(opts.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length) {
      list = list.filter(function (e) {
        const hay = (e.title + ' ' + e.text + ' ' + e.mood).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      });
    }

    const dir = opts.sort === 'old' ? 1 : -1;
    list = list.slice().sort(function (a, b) {
      let cmp = 0;
      if (a.date !== b.date) { cmp = a.date < b.date ? -1 : 1; }
      else if (a.createdAt !== b.createdAt) { cmp = a.createdAt < b.createdAt ? -1 : 1; }
      return cmp * dir;
    });
    return clone(list);
  }

  function getEntry(id) {
    ensureInit();
    const e = state.entries.find(function (x) { return x.id === id; });
    return e ? clone(e) : null;
  }

  function getEntryCollectionIds(entryId) {
    ensureInit();
    return state.collections
      .filter(function (c) { return c.entryIds.indexOf(entryId) !== -1; })
      .map(function (c) { return c.id; });
  }

  function createEntry(input) {
    ensureInit();
    const f = cleanFields(input, true);
    if (!f.ok) { return f; }
    const ts = nowIso();
    const entry = Object.assign(
      { id: uid('e', new Set(state.entries.map(function (e) { return e.id; }))) },
      f.fields,
      { createdAt: ts, updatedAt: ts }
    );
    const nextEntries = state.entries.concat([entry]);
    let nextColls = state.collections;
    if (Array.isArray(input.collectionIds)) {
      nextColls = applyMembership(nextColls, entry.id, input.collectionIds);
    }
    const r = persist(nextEntries, nextColls);
    if (!r.ok) { return r; }
    notify({ type: 'entry-created', id: entry.id });
    return { ok: true, entry: clone(entry) };
  }

  function updateEntry(id, input) {
    ensureInit();
    const idx = state.entries.findIndex(function (e) { return e.id === id; });
    if (idx === -1) { return fail('not-found', 'That page could not be found. It may have been deleted.'); }
    const f = cleanFields(input, true);
    if (!f.ok) { return f; }
    const entry = Object.assign({}, state.entries[idx], f.fields, { updatedAt: nowIso() });
    const nextEntries = state.entries.slice();
    nextEntries[idx] = entry;
    let nextColls = state.collections;
    if (Array.isArray(input.collectionIds)) {
      nextColls = applyMembership(nextColls, id, input.collectionIds);
    }
    const r = persist(nextEntries, nextColls);
    if (!r.ok) { return r; }
    notify({ type: 'entry-updated', id: id });
    return { ok: true, entry: clone(entry) };
  }

  function deleteEntry(id) {
    ensureInit();
    const nextEntries = state.entries.filter(function (e) { return e.id !== id; });
    if (nextEntries.length === state.entries.length) {
      return fail('not-found', 'That page could not be found. It may already be deleted.');
    }
    const nextColls = state.collections.map(function (c) {
      return c.entryIds.indexOf(id) === -1
        ? c
        : Object.assign({}, c, {
            entryIds: c.entryIds.filter(function (x) { return x !== id; }),
            updatedAt: nowIso()
          });
    });
    const r = persist(nextEntries, nextColls);
    if (!r.ok) { return r; }
    notify({ type: 'entry-deleted', id: id });
    return { ok: true };
  }

  function setEntryCollections(entryId, collectionIds) {
    ensureInit();
    if (!state.entries.some(function (e) { return e.id === entryId; })) {
      return fail('not-found', 'That page could not be found.');
    }
    const next = applyMembership(state.collections, entryId, Array.isArray(collectionIds) ? collectionIds : []);
    const r = persist(state.entries, next);
    if (!r.ok) { return r; }
    notify({ type: 'membership-changed', id: entryId });
    return { ok: true };
  }

  /* ------------------------------ collections ------------------------------ */
  function validateName(name, exceptId) {
    const n = normName(name);
    if (!n) { return fail('empty-name', 'Please give your collection a name.'); }
    if (isReserved(n)) {
      return fail('reserved-name', 'The name "All Thoughts" is already used. Please choose a different name.');
    }
    const clash = state.collections.some(function (c) { return c.id !== exceptId && sameName(c.name, n); });
    if (clash) { return fail('duplicate-name', 'You already have a collection with that name.'); }
    return { ok: true, name: n };
  }

  function listTabs() {
    ensureInit();
    const tabs = [{ id: ALL_ID, name: ALL_NAME, accent: 'butter', count: state.entries.length, virtual: true }];
    state.collections.forEach(function (c) {
      tabs.push({ id: c.id, name: c.name, accent: c.accent, count: c.entryIds.length, virtual: false });
    });
    return tabs;
  }

  function getCollection(id) {
    ensureInit();
    if (id === ALL_ID) {
      return { id: ALL_ID, name: ALL_NAME, accent: 'butter', count: state.entries.length, virtual: true };
    }
    const c = state.collections.find(function (x) { return x.id === id; });
    if (!c) { return null; }
    const copy = clone(c);
    copy.count = copy.entryIds.length;
    copy.virtual = false;
    return copy;
  }

  function createCollection(name, accent) {
    ensureInit();
    if (state.collections.length >= LIMITS.collections) {
      return fail('too-many', 'You have reached the limit of ' + LIMITS.collections + ' collections.');
    }
    const v = validateName(name, null);
    if (!v.ok) { return v; }
    const ts = nowIso();
    const col = {
      id: uid('c', new Set(state.collections.map(function (c) { return c.id; }))),
      name: v.name,
      accent: ACCENTS.indexOf(accent) !== -1 ? accent : ACCENTS[state.collections.length % ACCENTS.length],
      entryIds: [],
      createdAt: ts,
      updatedAt: ts
    };
    const r = persist(state.entries, state.collections.concat([col]));
    if (!r.ok) { return r; }
    notify({ type: 'collection-created', id: col.id });
    return { ok: true, collection: clone(col) };
  }

  function renameCollection(id, name, accent) {
    ensureInit();
    const idx = state.collections.findIndex(function (c) { return c.id === id; });
    if (idx === -1) { return fail('not-found', 'That collection could not be found.'); }
    const v = validateName(name, id);
    if (!v.ok) { return v; }
    const next = state.collections.slice();
    next[idx] = Object.assign({}, next[idx], {
      name: v.name,
      accent: ACCENTS.indexOf(accent) !== -1 ? accent : next[idx].accent,
      updatedAt: nowIso()
    });
    const r = persist(state.entries, next);
    if (!r.ok) { return r; }
    notify({ type: 'collection-updated', id: id });
    return { ok: true, collection: clone(next[idx]) };
  }

  function deleteCollection(id) {
    ensureInit();
    const next = state.collections.filter(function (c) { return c.id !== id; });
    if (next.length === state.collections.length) {
      return fail('not-found', 'That collection could not be found.');
    }
    const r = persist(state.entries, next);
    if (!r.ok) { return r; }
    notify({ type: 'collection-deleted', id: id });
    return { ok: true };
  }

  function getStats() {
    ensureInit();
    return { entries: state.entries.length, collections: state.collections.length };
  }

  /* ------------------------------ export / import ------------------------------ */
  function exportData() {
    ensureInit();
    const data = {
      app: APP_NAME,
      schema: SCHEMA,
      exportedAt: nowIso(),
      entries: clone(state.entries),
      collections: clone(state.collections)
    };
    return {
      ok: true,
      data: data,
      json: JSON.stringify(data, null, 2),
      filename: 'calmnest-garden-backup-' + todayISO() + '.json',
      counts: { entries: data.entries.length, collections: data.collections.length }
    };
  }

  function downloadBackup() {
    const r = exportData();
    try {
      const blob = new Blob([r.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (e) {
      return fail('download-failed', 'Your browser could not create the backup file.');
    }
    return { ok: true, filename: r.filename, counts: r.counts };
  }

  /* Resolves (never rejects) with { ok, text } or an error object */
  function readFileText(file) {
    return new Promise(function (resolve) {
      if (!file) { resolve(fail('no-file', 'Please choose a backup file.')); return; }
      if (file.size > LIMITS.importBytes) {
        resolve(fail('too-large', 'That file is too large to be a CalmNest backup.'));
        return;
      }
      const done = function (text) { resolve({ ok: true, text: text }); };
      const bad = function () { resolve(fail('read-failed', 'That file could not be read.')); };
      if (typeof file.text === 'function') {
        file.text().then(done, bad);
        return;
      }
      try {
        const reader = new FileReader();
        reader.onload = function () { done(String(reader.result)); };
        reader.onerror = bad;
        reader.readAsText(file);
      } catch (e) { bad(); }
    });
  }

  /* Validate and clean a backup-shaped object. Changes nothing. */
  function cleanPayload(obj) {
    const generic = 'This does not look like a CalmNest garden backup.';
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { return fail('bad-format', generic); }
    if (obj.app !== undefined && obj.app !== APP_NAME) {
      return fail('wrong-app', 'This file was not made by CalmNest Diary Garden.');
    }
    if (typeof obj.schema === 'number' && obj.schema > SCHEMA) {
      return fail('newer-version', 'This backup was made by a newer version of the garden and cannot be read here.');
    }
    if (!Array.isArray(obj.entries)) { return fail('bad-format', generic); }

    const rawCollections = Array.isArray(obj.collections) ? obj.collections : [];
    const taken = new Set();
    const entries = obj.entries.map(function (r) { return cleanEntryRecord(r, taken); }).filter(Boolean);
    const collections = reconcile(entries, sanitizeCollections(rawCollections));
    return {
      ok: true,
      payload: { entries: entries, collections: collections },
      summary: {
        entries: entries.length,
        collections: collections.length,
        skippedEntries: obj.entries.length - entries.length,
        skippedCollections: rawCollections.length - collections.length,
        exportedAt: validIso(obj.exportedAt) ? obj.exportedAt : null
      }
    };
  }

  function parseImport(text) {
    ensureInit();
    if (typeof text !== 'string' || !text.trim()) { return fail('bad-json', 'That file is empty.'); }
    let obj;
    try {
      obj = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (e) {
      return fail('bad-json', 'That file is not valid JSON, so it cannot be a CalmNest backup.');
    }
    const r = cleanPayload(obj);
    if (!r.ok) { return r; }
    if (!r.payload.entries.length && !r.payload.collections.length) {
      return fail('empty-backup', 'That backup has no pages or collections in it.');
    }
    return r;
  }

  function mergeInto(payload) {
    const entriesOut = state.entries.slice();
    const index = new Map();
    entriesOut.forEach(function (e, i) { index.set(e.id, i); });
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    payload.entries.forEach(function (imp) {
      if (!index.has(imp.id)) {
        index.set(imp.id, entriesOut.length);
        entriesOut.push(imp);
        added += 1;
      } else {
        const i = index.get(imp.id);
        if (Date.parse(imp.updatedAt) > Date.parse(entriesOut[i].updatedAt)) {
          entriesOut[i] = imp;
          updated += 1;
        } else {
          unchanged += 1;
        }
      }
    });

    const collOut = clone(state.collections);
    let cAdded = 0;
    let cMerged = 0;
    let cSkipped = 0;
    payload.collections.forEach(function (ic) {
      const target = collOut.find(function (c) { return c.id === ic.id; }) ||
        collOut.find(function (c) { return sameName(c.name, ic.name); });
      if (target) {
        const seen = new Set(target.entryIds);
        let changed = false;
        ic.entryIds.forEach(function (id) {
          if (!seen.has(id)) { seen.add(id); target.entryIds.push(id); changed = true; }
        });
        if (changed) { target.updatedAt = nowIso(); }
        cMerged += 1;
      } else if (collOut.length >= LIMITS.collections) {
        cSkipped += 1;
      } else {
        collOut.push(clone(ic));
        cAdded += 1;
      }
    });

    return {
      entries: entriesOut,
      collections: reconcile(entriesOut, collOut),
      summary: {
        mode: 'merge',
        entriesAdded: added,
        entriesUpdated: updated,
        entriesUnchanged: unchanged,
        collectionsAdded: cAdded,
        collectionsMerged: cMerged,
        collectionsSkipped: cSkipped
      }
    };
  }

  function applyImport(payload, mode) {
    ensureInit();
    if (mode !== 'merge' && mode !== 'replace') {
      return fail('bad-mode', 'Please choose merge or replace.');
    }
    const cleaned = cleanPayload(payload);
    if (!cleaned.ok) { return cleaned; }
    const p = cleaned.payload;
    if (!p.entries.length && !p.collections.length) {
      return fail('empty-backup', 'That backup has no pages or collections in it.');
    }

    if (mode === 'merge') {
      const m = mergeInto(p);
      const r = persist(m.entries, m.collections);
      if (!r.ok) { return r; }
      notify({ type: 'imported', mode: 'merge' });
      return { ok: true, summary: m.summary };
    }

    /* replace: keep a safety copy of what is about to be overwritten */
    let safetyCopy = false;
    if (persistent && (state.entries.length || state.collections.length)) {
      try {
        window.localStorage.setItem(KEYS.preImport, JSON.stringify({
          savedAt: nowIso(),
          entries: state.entries,
          collections: state.collections
        }));
        safetyCopy = true;
      } catch (e) { /* quota: carry on without it */ }
    }
    const r2 = persist(p.entries, p.collections);
    if (!r2.ok) { return r2; }
    notify({ type: 'imported', mode: 'replace' });
    return {
      ok: true,
      summary: { mode: 'replace', entries: p.entries.length, collections: p.collections.length, safetyCopy: safetyCopy }
    };
  }

  function hasPreImportBackup() {
    ensureInit();
    if (!persistent) { return false; }
    try { return window.localStorage.getItem(KEYS.preImport) !== null; } catch (e) { return false; }
  }

  function restorePreImport() {
    ensureInit();
    if (!persistent) { return fail('no-backup', 'There is no earlier garden to restore.'); }
    let raw = null;
    try { raw = window.localStorage.getItem(KEYS.preImport); } catch (e) { /* ignore */ }
    if (!raw) { return fail('no-backup', 'There is no earlier garden to restore.'); }
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { return fail('bad-backup', 'The saved copy could not be read.'); }
    const cleaned = cleanPayload({ entries: obj && obj.entries, collections: obj && obj.collections });
    if (!cleaned.ok) { return fail('bad-backup', 'The saved copy could not be read.'); }
    const r = persist(cleaned.payload.entries, cleaned.payload.collections);
    if (!r.ok) { return r; }
    notify({ type: 'restored' });
    return { ok: true, entries: cleaned.payload.entries.length, collections: cleaned.payload.collections.length };
  }

  /* ------------------------------ public API ------------------------------ */
  NS.Storage = Object.freeze({
    KEYS: KEYS,
    LIMITS: LIMITS,
    MOODS: MOODS,
    ACCENTS: ACCENTS,
    ALL_ID: ALL_ID,
    ALL_NAME: ALL_NAME,
    init: init,
    isPersistent: isPersistent,
    getWarnings: getWarnings,
    todayISO: todayISO,
    subscribe: subscribe,
    listEntries: listEntries,
    getEntry: getEntry,
    createEntry: createEntry,
    updateEntry: updateEntry,
    deleteEntry: deleteEntry,
    getEntryCollectionIds: getEntryCollectionIds,
    setEntryCollections: setEntryCollections,
    listTabs: listTabs,
    getCollection: getCollection,
    getStats: getStats,
    createCollection: createCollection,
    renameCollection: renameCollection,
    deleteCollection: deleteCollection,
    exportData: exportData,
    downloadBackup: downloadBackup,
    readFileText: readFileText,
    parseImport: parseImport,
    applyImport: applyImport,
    hasPreImportBackup: hasPreImportBackup,
    restorePreImport: restorePreImport
  });
})();