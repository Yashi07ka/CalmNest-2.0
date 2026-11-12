/* Syncs Diary Garden with Supabase after local saves.
   localStorage stays the source the page uses. Remote errors are ignored
   so the garden keeps working offline or before the keys are filled in.
   This file never deletes a local page because the cloud is missing it. */
(function () {
  'use strict';

  const NS = (window.CalmNestDG = window.CalmNestDG || {});
  const Storage = NS.Storage;
  if (!Storage || NS.Cloud) return;

  const APP_NAME = 'CalmNest Diary Garden';
  let pushTimer = null;
  let pulling = false;
  const pending = { entries: new Set(), collections: new Set() };

  function warn(label, err) {
    console.warn('[CalmNest] ' + label, err && err.message ? err.message : err);
  }

  async function sessionClient() {
    const auth = window.CalmNestAuth;
    if (!auth || typeof auth.configured !== 'function' || !auth.configured()) return null;
    try {
      if (auth.ready) await auth.ready;
      const session = await auth.getSession();
      if (!session || !session.user) return null;
      const client = auth.client();
      if (!client) return null;
      return { client: client, userId: session.user.id };
    } catch (e) {
      warn('Diary sync is unavailable.', e);
      return null;
    }
  }

  function chunks(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  async function flush() {
    if (pulling) {
      pushTimer = window.setTimeout(flush, 400);
      return;
    }
    const ctx = await sessionClient();
    if (!ctx) return;
    const entryDeletes = Array.from(pending.entries);
    const collectionDeletes = Array.from(pending.collections);
    pending.entries.clear();
    pending.collections.clear();

    try {
      const exported = Storage.exportData();
      const data = exported && exported.data ? exported.data : { entries: [], collections: [] };
      const entries = (data.entries || []).filter(function (e) {
        return entryDeletes.indexOf(e.id) === -1;
      });
      const collections = (data.collections || []).filter(function (c) {
        return collectionDeletes.indexOf(c.id) === -1;
      });

      if (entryDeletes.length) {
        const { error } = await ctx.client.from('calmnest_diary_entries').delete().in('id', entryDeletes);
        if (error) {
          entryDeletes.forEach(function (id) { pending.entries.add(id); });
          throw error;
        }
      }
      if (collectionDeletes.length) {
        const { error } = await ctx.client.from('calmnest_collections').delete().in('id', collectionDeletes);
        if (error) {
          collectionDeletes.forEach(function (id) { pending.collections.add(id); });
          throw error;
        }
      }

      const entryRows = entries.map(function (e) {
        return {
          id: e.id,
          user_id: ctx.userId,
          entry_date: e.date,
          mood: e.mood,
          title: e.title || '',
          body: e.text || '',
          stickers: e.stickers || [],
          created_at: e.createdAt,
          updated_at: e.updatedAt
        };
      });
      for (let i = 0; i < chunks(entryRows, 100).length; i++) {
        const { error } = await ctx.client.from('calmnest_diary_entries').upsert(chunks(entryRows, 100)[i], { onConflict: 'user_id,id' });
        if (error) throw error;
      }

      const collectionRows = collections.map(function (c) {
        return {
          id: c.id,
          user_id: ctx.userId,
          name: c.name,
          accent: c.accent,
          created_at: c.createdAt,
          updated_at: c.updatedAt
        };
      });
      if (collectionRows.length) {
        const { error } = await ctx.client.from('calmnest_collections').upsert(collectionRows, { onConflict: 'user_id,id' });
        if (error) throw error;
      }

      for (let i = 0; i < collections.length; i++) {
        const c = collections[i];
        const removed = await ctx.client.from('calmnest_collection_entries').delete().eq('collection_id', c.id);
        if (removed.error) throw removed.error;
        const links = (c.entryIds || []).map(function (entryId) {
          return { user_id: ctx.userId, collection_id: c.id, entry_id: entryId };
        });
        if (!links.length) continue;
        const inserted = await ctx.client.from('calmnest_collection_entries').insert(links);
        if (inserted.error) throw inserted.error;
      }
    } catch (e) {
      warn('Diary changes are saved on this device. Online sync will retry later.', e);
    }
  }

  function schedulePush() {
    if (pushTimer) window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(function () {
      pushTimer = null;
      flush();
    }, 400);
  }

  async function pull() {
    const ctx = await sessionClient();
    if (!ctx) return;
    pulling = true;
    try {
      const entriesRes = await ctx.client.from('calmnest_diary_entries').select('id,entry_date,mood,title,body,stickers,created_at,updated_at');
      const collectionsRes = await ctx.client.from('calmnest_collections').select('id,name,accent,created_at,updated_at');
      const linksRes = await ctx.client.from('calmnest_collection_entries').select('collection_id,entry_id');
      if (entriesRes.error) throw entriesRes.error;
      if (collectionsRes.error) throw collectionsRes.error;
      if (linksRes.error) throw linksRes.error;

      const membership = {};
      (linksRes.data || []).forEach(function (link) {
        if (!membership[link.collection_id]) membership[link.collection_id] = [];
        membership[link.collection_id].push(link.entry_id);
      });

      const payload = {
        app: APP_NAME,
        schema: 1,
        entries: (entriesRes.data || []).map(function (row) {
          return {
            id: row.id,
            date: row.entry_date,
            mood: row.mood,
            title: row.title || '',
            text: row.body || '',
            stickers: Array.isArray(row.stickers) ? row.stickers : [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
          };
        }),
        collections: (collectionsRes.data || []).map(function (row) {
          return {
            id: row.id,
            name: row.name,
            accent: row.accent,
            entryIds: membership[row.id] || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
          };
        })
      };

      if (!payload.entries.length && !payload.collections.length) return;
      const merged = Storage.applyImport(payload, 'merge');
      if (!merged.ok) warn('Online diary pages could not be merged.', merged);
    } catch (e) {
      warn('Online diary pages could not be loaded. Your saved pages on this device are unchanged.', e);
    } finally {
      pulling = false;
    }
  }

  Storage.init();
  Storage.subscribe(function (evt) {
    if (!evt) return;
    if (evt.type === 'entry-deleted' && evt.id) pending.entries.add(evt.id);
    if (evt.type === 'collection-deleted' && evt.id) pending.collections.add(evt.id);
    if (pulling || evt.type === 'external') return;
    schedulePush();
  });

  pull().then(function () {
    if (!pulling) schedulePush();
  });

  NS.Cloud = Object.freeze({ schedulePush: schedulePush });
})();
