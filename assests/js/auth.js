/* Shared sign-in for CalmNest. If Supabase is not configured or cannot
   be reached, every call fails softly and the rest of the site keeps working. */
(function () {
  'use strict';

  const PLACEHOLDER = 'YOUR_SUPABASE';

  function settings() {
    return window.CalmNestCloud || {};
  }

  function configured() {
    const url = String(settings().url || '').trim();
    const key = String(settings().anonKey || '').trim();
    if (!url || !key) return false;
    if (url.indexOf(PLACEHOLDER) !== -1 || key.indexOf(PLACEHOLDER) !== -1) return false;
    if (!/^https:\/\//i.test(url)) return false;
    if (key.length < 20) return false;
    if (isServiceRole(key)) return false;
    return true;
  }

  function isServiceRole(key) {
    try {
      const part = String(key).split('.')[1];
      if (!part) return false;
      const padded = part.replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(padded));
      return json && json.role === 'service_role';
    } catch (e) {
      return false;
    }
  }

  let client = null;

  function getClient() {
    if (client) return client;
    if (!configured()) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    try {
      client = window.supabase.createClient(settings().url, settings().anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      return client;
    } catch (e) {
      console.warn('[CalmNest] Sign-in could not start.', e);
      client = null;
      return null;
    }
  }

  function friendly(error, fallback) {
    const raw = error && error.message ? String(error.message) : '';
    if (!raw || /failed to fetch|network|load failed/i.test(raw)) {
      return 'The sign-in service could not be reached. You can keep using CalmNest on this device.';
    }
    if (/invalid login credentials/i.test(raw)) return 'That email and password do not match.';
    if (/already registered|already been registered/i.test(raw)) {
      return 'An account with that email already exists. Please sign in instead.';
    }
    if (/password/i.test(raw) && /at least|shortest|6/i.test(raw)) {
      return 'Please use a password of at least 6 characters.';
    }
    if (raw.length > 180) return fallback;
    return raw;
  }

  async function getSession() {
    try {
      await ready;
      const c = getClient();
      if (!c) return null;
      const { data, error } = await c.auth.getSession();
      if (error) {
        console.warn('[CalmNest] Session could not be read.', error);
        return null;
      }
      return data && data.session ? data.session : null;
    } catch (e) {
      console.warn('[CalmNest] Session could not be read.', e);
      return null;
    }
  }

  function paint(session) {
    const links = document.querySelectorAll('a[href="login.html"], a[data-calmnest-auth]');
    links.forEach(function (a) {
      if (session && session.user) {
        a.textContent = 'Sign out';
        a.setAttribute('data-calmnest-auth', 'out');
        a.setAttribute('title', session.user.email || 'Signed in');
        a.setAttribute('href', 'login.html');
      } else if (a.getAttribute('data-calmnest-auth') === 'out') {
        a.textContent = 'Sign in';
        a.removeAttribute('data-calmnest-auth');
        a.removeAttribute('title');
      }
    });
  }

  document.addEventListener('click', function (e) {
    const a = e.target && e.target.closest ? e.target.closest('a[data-calmnest-auth="out"]') : null;
    if (!a) return;
    e.preventDefault();
    signOut().then(function () { window.location.reload(); });
  });

  async function signIn(email, password) {
    try {
      await ready;
      if (!configured()) {
        return { ok: false, message: 'Add your Supabase URL and anon key in assests/js/supabase-config.js, then try again.' };
      }
      const c = getClient();
      if (!c) {
        return { ok: false, message: 'The sign-in library did not load. Check your connection and refresh this page.' };
      }
      const { data, error } = await c.auth.signInWithPassword({
        email: String(email || '').trim(),
        password: String(password || '')
      });
      if (error) return { ok: false, message: friendly(error, 'Sign-in did not work. Please try again.') };
      paint(data.session);
      return { ok: true, session: data.session };
    } catch (e) {
      return { ok: false, message: friendly(e, 'Sign-in did not work. Please try again.') };
    }
  }

  async function signUp(email, password, displayName) {
    try {
      await ready;
      if (!configured()) {
        return { ok: false, message: 'Add your Supabase URL and anon key in assests/js/supabase-config.js, then try again.' };
      }
      const c = getClient();
      if (!c) {
        return { ok: false, message: 'The sign-in library did not load. Check your connection and refresh this page.' };
      }
      const name = String(displayName || '').trim().slice(0, 80);
      const { data, error } = await c.auth.signUp({
        email: String(email || '').trim(),
        password: String(password || ''),
        options: {
          data: { display_name: name },
          emailRedirectTo: window.location.origin + '/login.html'
        }
      });
      if (error) return { ok: false, message: friendly(error, 'The account could not be created. Please try again.') };
      if (data && data.session) {
        paint(data.session);
        return { ok: true, session: data.session };
      }
      return {
        ok: true,
        needsConfirmation: true,
        message: 'Check your email to confirm your account, then sign in.'
      };
    } catch (e) {
      return { ok: false, message: friendly(e, 'The account could not be created. Please try again.') };
    }
  }

  async function signOut() {
    try {
      await ready;
      const c = getClient();
      if (c) await c.auth.signOut();
    } catch (e) {
      console.warn('[CalmNest] Sign-out did not finish.', e);
    }
    paint(null);
    return { ok: true };
  }

  const ready = (async function () {
    try {
      const c = getClient();
      if (c && c.auth && typeof c.auth.onAuthStateChange === 'function') {
        c.auth.onAuthStateChange(function (_event, session) { paint(session); });
      }
      paint(await (async function () {
        if (!c) return null;
        const { data, error } = await c.auth.getSession();
        if (error) return null;
        return data && data.session ? data.session : null;
      })());
    } catch (e) {
      console.warn('[CalmNest] Sign-in could not start.', e);
      paint(null);
    }
  })();

  window.CalmNestAuth = Object.freeze({
    ready: ready,
    configured: configured,
    client: getClient,
    getSession: getSession,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut
  });
})();
