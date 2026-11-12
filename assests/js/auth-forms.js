(function () {
  'use strict';

  const form = document.getElementById('authForm');
  const msg = document.getElementById('authMsg');
  if (!form || !msg || !window.CalmNestAuth) return;

  function show(text, ok) {
    msg.hidden = !text;
    msg.textContent = text || '';
    msg.className = 'auth-msg ' + (ok ? 'ok' : 'bad');
  }

  window.CalmNestAuth.ready.then(function () {
    if (!window.CalmNestAuth.configured()) {
      show('Sign-in is not connected yet. Add your Supabase URL and anon key in assests/js/supabase-config.js. The rest of CalmNest still works on this device.', false);
    }
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      show('Please enter your email and password.', false);
      return;
    }
    if (password.length < 6) {
      show('Please use a password of at least 6 characters.', false);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const signup = form.dataset.mode === 'signup';
      const result = signup
        ? await window.CalmNestAuth.signUp(email, password, form.displayName ? form.displayName.value : '')
        : await window.CalmNestAuth.signIn(email, password);
      if (!result.ok) {
        show(result.message, false);
        return;
      }
      if (result.needsConfirmation) {
        show(result.message, true);
        form.reset();
        return;
      }
      window.location.href = 'index.html';
    } catch (err) {
      show('Something went wrong. Please try again.', false);
    } finally {
      button.disabled = false;
    }
  });
})();
