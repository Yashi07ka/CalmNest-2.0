(() => {
  'use strict';

  /* ------------------------------------------------------------------
     TRACK DATA
     • Tracks with an "engine" are generated live in the browser.
     • To add a real audio file, drop it in assets/audio/ and add:
         { id:'my-track', cat:'piano', icon:'🎹', title:'My Track',
           desc:'Short description.', tags:['study'],
           src:'assets/audio/my-track.mp3' }
       Only use audio you have the right to use (check the licence).
  ------------------------------------------------------------------ */
  const CATS = {
    piano:  { label: 'Calm Piano',     icon: '🎹', bg: '#fff0bd', g: 'g-piano'  },
    rain:   { label: 'Rain Sounds',    icon: '🌧', bg: '#dcecfa', g: 'g-rain'   },
    nature: { label: 'Nature Sounds',  icon: '🌿', bg: '#d8f0e0', g: 'g-nature' },
    focus:  { label: 'Focus Music',    icon: '🎧', bg: '#e6ecfb', g: 'g-focus'  }
  };

  const TRACKS = [
    { id:'morning-keys', cat:'piano', icon:'🎹', title:'Morning Keys',
      desc:'Bright, unhurried piano notes drifting over a soft room.', tags:['relax','morning','study'],
      engine:'piano', opts:{ root:261.63, scale:[0,2,4,7,9,12,14], decay:4.5, gap:[1.6,3.4] } },
    { id:'midnight-keys', cat:'piano', icon:'🌙', title:'Midnight Keys',
      desc:'Slower, lower, gentler. For late evenings and winding down.', tags:['sleep','night','relax'],
      engine:'piano', opts:{ root:220, scale:[0,3,5,7,10,12,15], decay:5.5, gap:[2.6,4.8] } },

    { id:'soft-rain', cat:'rain', icon:'🌦', title:'Soft Rain',
      desc:'Light rain on leaves with the occasional drop. Easy on the ears.', tags:['sleep','relax','study'],
      engine:'rain', opts:{ hp:900, lp:7000, level:.3, drops:.35 } },
    { id:'cozy-downpour', cat:'rain', icon:'🌧', title:'Cozy Downpour',
      desc:'Heavier rain with a deep, warm rumble. Rain on a window, indoors.', tags:['sleep','cozy','storm'],
      engine:'rain', opts:{ hp:450, lp:5200, level:.4, drops:.6, rumble:true } },

    { id:'ocean-waves', cat:'nature', icon:'🌊', title:'Ocean Waves',
      desc:'Slow waves rolling in and out, with a touch of sea foam.', tags:['sea','beach','sleep','relax'],
      engine:'ocean', opts:{} },
    { id:'forest-morning', cat:'nature', icon:'🌲', title:'Forest Morning',
      desc:'A trickling stream with birdsong somewhere in the trees.', tags:['birds','stream','morning','relax'],
      engine:'forest', opts:{} },

    { id:'brown-focus', cat:'focus', icon:'🧠', title:'Deep Focus Hum',
      desc:'Smooth brown noise that masks distractions. Good for deep work.', tags:['study','work','noise','concentrate'],
      engine:'brown', opts:{} },
    { id:'warm-pad', cat:'focus', icon:'☁️', title:'Warm Focus Pad',
      desc:'A slow, glowing chord that breathes quietly in the background.', tags:['study','ambient','concentrate','calm'],
      engine:'pad', opts:{ freqs:[110, 164.81, 220, 277.18] } }
  ];

  /* ------------------------------ helpers ------------------------------ */
  const $ = id => document.getElementById(id);
  const grid = $('grid'), catsEl = $('cats'), search = $('search'), countEl = $('count'), emptyEl = $('empty');
  const player = $('player'), pPlay = $('pPlay'), pTitle = $('pTitle'), pSub = $('pSub'), pBar = $('pBar'),
        pTime = $('pTime'), pVol = $('pVol'), pLen = $('pLen'), pLenWrap = $('pLenWrap'), pStop = $('pStop'),
        toastEl = $('toast');
  const byId = Object.fromEntries(TRACKS.map(t => [t.id, t]));
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  let tt;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  /* ------------------------------ state ------------------------------ */
  let vol = 0.7, activeCat = 'all', query = '', seeking = false;
  const S = { id: null, playing: false, elapsed: 0, last: 0, len: 600, audio: null };
  const cur = () => byId[S.id] || null;

  /* ------------------------- Web Audio engines ------------------------- */
  let ctx = null, master = null, voice = null, cleanup = null, impulseBuf = null;
  const noiseBufs = {};

  function getCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = vol;
    master.connect(ctx.destination);
    return ctx;
  }
  function noiseSrc(type) {
    if (!noiseBufs[type]) {
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      if (type === 'white') {
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } else {
        let last = 0;
        for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      }
      noiseBufs[type] = buf;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBufs[type]; s.loop = true;
    return s;
  }
  function filter(type, freq, q) {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f;
  }
  function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function getImpulse() {
    if (!impulseBuf) {
      const len = ctx.sampleRate * 2.6;
      impulseBuf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = impulseBuf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    return impulseBuf;
  }
  function bag() {
    const fns = [];
    return { add: f => fns.push(f), end: () => fns.forEach(f => { try { f(); } catch (e) {} }) };
  }

  const ENGINES = {
    rain(out, o) {
      const k = bag();
      const n = noiseSrc('white'), hp = filter('highpass', o.hp), lp = filter('lowpass', o.lp), g = gain(o.level);
      n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out); n.start(); k.add(() => n.stop());
      if (o.rumble) {
        const r = noiseSrc('brown'), rl = filter('lowpass', 220), rg = gain(.8);
        r.connect(rl); rl.connect(rg); rg.connect(out); r.start(); k.add(() => r.stop());
      }
      const id = setInterval(() => {
        if (Math.random() > o.drops) return;
        const t = ctx.currentTime, osc = ctx.createOscillator(), dg = ctx.createGain();
        osc.frequency.value = 1800 + Math.random() * 3200;
        dg.gain.setValueAtTime(.025, t); dg.gain.exponentialRampToValueAtTime(.0001, t + .06);
        osc.connect(dg); dg.connect(out); osc.start(t); osc.stop(t + .08);
      }, 90);
      k.add(() => clearInterval(id));
      return k.end;
    },

    ocean(out) {
      const k = bag();
      const n = noiseSrc('brown'), lp = filter('lowpass', 650), g = gain(.5);
      n.connect(lp); lp.connect(g); g.connect(out);
      const foam = noiseSrc('white'), bp = filter('bandpass', 2400, .6), fg = gain(.04);
      foam.connect(bp); bp.connect(fg); fg.connect(out);
      const lfo = ctx.createOscillator(); lfo.frequency.value = .11;
      const l1 = gain(.4), l2 = gain(.035);
      lfo.connect(l1); l1.connect(g.gain); lfo.connect(l2); l2.connect(fg.gain);
      n.start(); foam.start(); lfo.start();
      k.add(() => n.stop()); k.add(() => foam.stop()); k.add(() => lfo.stop());
      return k.end;
    },

    forest(out) {
      const k = bag();
      const n = noiseSrc('white'), bp = filter('bandpass', 1400, .8), g = gain(.17);
      n.connect(bp); bp.connect(g); g.connect(out);
      const n2 = noiseSrc('white'), bp2 = filter('bandpass', 3200, 1.2), g2 = gain(.06);
      n2.connect(bp2); bp2.connect(g2); g2.connect(out);
      const lfo = ctx.createOscillator(); lfo.frequency.value = .3;
      const lg = gain(420); lfo.connect(lg); lg.connect(bp.frequency);
      n.start(); n2.start(); lfo.start();
      k.add(() => n.stop()); k.add(() => n2.stop()); k.add(() => lfo.stop());

      let alive = true, timer;
      const chirp = () => {
        const t = ctx.currentTime, osc = ctx.createOscillator(), cg = ctx.createGain(), f = 2200 + Math.random() * 1800;
        osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(f * 1.35, t + .1);
        cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(.05, t + .02); cg.gain.exponentialRampToValueAtTime(.0001, t + .14);
        osc.connect(cg); cg.connect(out); osc.start(t); osc.stop(t + .2);
      };
      const song = () => {
        if (!alive) return;
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) setTimeout(() => alive && chirp(), i * 170);
        timer = setTimeout(song, 2500 + Math.random() * 5000);
      };
      timer = setTimeout(song, 1200);
      k.add(() => { alive = false; clearTimeout(timer); });
      return k.end;
    },

    piano(out, o) {
      const conv = ctx.createConvolver(); conv.buffer = getImpulse();
      const wet = gain(.55), dry = gain(.8);
      conv.connect(wet); wet.connect(out); dry.connect(out);
      let alive = true, timer;
      const hz = s => o.root * Math.pow(2, s / 12);
      const note = (semi, vel) => {
        const t = ctx.currentTime, f = hz(semi), env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(vel, t + .012);
        env.gain.exponentialRampToValueAtTime(.0001, t + o.decay);
        [[1, 1], [2, .3], [3, .1], [4, .04]].forEach(([m, a]) => {
          const osc = ctx.createOscillator(), og = gain(a);
          osc.type = 'sine'; osc.frequency.value = f * m;
          osc.connect(og); og.connect(env); osc.start(t); osc.stop(t + o.decay + .1);
        });
        env.connect(dry); env.connect(conv);
      };
      const pick = () => o.scale[Math.floor(Math.random() * o.scale.length)] + (Math.random() < .25 ? 12 : 0);
      const next = () => {
        if (!alive) return;
        note(pick(), .15);
        if (Math.random() < .35) setTimeout(() => alive && note(pick(), .1), 180 + Math.random() * 320);
        timer = setTimeout(next, (o.gap[0] + Math.random() * (o.gap[1] - o.gap[0])) * 1000);
      };
      next();
      return () => { alive = false; clearTimeout(timer); };
    },

    brown(out) {
      const k = bag();
      const n = noiseSrc('brown'), lp = filter('lowpass', 1200), g = gain(.55);
      n.connect(lp); lp.connect(g); g.connect(out); n.start(); k.add(() => n.stop());
      return k.end;
    },

    pad(out, o) {
      const k = bag();
      const lp = filter('lowpass', 800), pg = gain(.7);
      lp.connect(pg); pg.connect(out);
      o.freqs.forEach(f => [-4, 4].forEach(cents => {
        const osc = ctx.createOscillator(), og = gain(.05);
        osc.type = 'sine'; osc.frequency.value = f; osc.detune.value = cents;
        osc.connect(og); og.connect(lp); osc.start(); k.add(() => osc.stop());
      }));
      const lfo = ctx.createOscillator(); lfo.frequency.value = .07;
      const lg = gain(.25); lfo.connect(lg); lg.connect(pg.gain); lfo.start(); k.add(() => lfo.stop());
      return k.end;
    }
  };

  function startEngine(t) {
    stopEngine(true);
    voice = ctx.createGain();
    const now = ctx.currentTime;
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(1, now + 1.5);
    voice.connect(master);
    cleanup = ENGINES[t.engine](voice, t.opts || {});
  }
  function stopEngine(immediate) {
    if (!voice) return;
    const v = voice, c = cleanup;
    voice = null; cleanup = null;
    const done = () => { try { c && c(); } catch (e) {} try { v.disconnect(); } catch (e) {} };
    if (immediate) return done();
    const now = ctx.currentTime;
    v.gain.cancelScheduledValues(now);
    v.gain.setValueAtTime(v.gain.value, now);
    v.gain.linearRampToValueAtTime(0, now + .6);
    setTimeout(done, 700);
  }

  /* ------------------------------ playback ------------------------------ */
  function select(id) {
    if (byId[id].broken) return toast('That audio file couldn’t be loaded. Check its path in music.js.');
    if (S.id === id) { S.playing ? pause() : resume(); return; }
    halt();
    S.id = id; S.elapsed = 0;
    resume();
  }

  function halt() {
    stopEngine();
    if (S.audio) {
      const a = S.audio; S.audio = null;
      a.pause(); a.removeAttribute('src'); a.load();
    }
    S.playing = false;
  }

  function resume() {
    const t = cur(); if (!t) return;
    if (t.src) {
      if (!S.audio) {
        const a = new Audio();
        a.preload = 'metadata';
        a.addEventListener('playing', () => { if (a === S.audio) { S.playing = true; ui(); } });
        a.addEventListener('pause',   () => { if (a === S.audio) { S.playing = false; ui(); } });
        a.addEventListener('ended',   () => { if (a === S.audio) { S.playing = false; a.currentTime = 0; ui(); } });
        a.addEventListener('error',   () => { if (a === S.audio) failFile(t); });
        a.src = t.src;
        S.audio = a;
      }
      S.audio.volume = vol;
      S.audio.play().catch(err => { if (err && err.name !== 'AbortError') failFile(t); });
    } else {
      const c = getCtx();
      if (!c) { toast('Your browser doesn’t support Web Audio, so these sounds can’t play.'); S.id = null; ui(); return; }
      c.resume();
      startEngine(t);
      S.playing = true; S.last = performance.now();
    }
    ui();
  }

  function pause() {
    const t = cur(); if (!t) return;
    if (t.src) { S.audio && S.audio.pause(); }
    else { stopEngine(); S.playing = false; }
    ui();
  }

  function failFile(t) {
    t.broken = true;
    halt(); S.id = null; S.elapsed = 0;
    toast('Couldn’t load “' + t.title + '”. Check that the file exists at ' + t.src);
    ui();
  }

  function finishSession() {
    stopEngine(); S.playing = false; S.elapsed = 0;
    toast('Session complete. Hope you feel a little lighter 🌿');
    ui();
  }

  setInterval(() => {
    const t = cur(); if (!t) return;
    if (!t.src && S.playing) {
      const now = performance.now();
      S.elapsed += (now - S.last) / 1000; S.last = now;
      if (S.elapsed >= S.len) return finishSession();
    }
    renderPlayer();
  }, 250);

  /* ------------------------------ rendering ------------------------------ */
  function buildCats() {
    const items = [{ key: 'all', label: 'All sounds', icon: '✨', bg: '#fff', n: TRACKS.length }]
      .concat(Object.keys(CATS).map(k => ({ key: k, label: CATS[k].label, icon: CATS[k].icon, bg: CATS[k].bg, n: TRACKS.filter(t => t.cat === k).length })));
    catsEl.innerHTML = items.map(c =>
      `<button class="cat reveal" data-cat="${c.key}" aria-pressed="${c.key === 'all'}" style="--bg:${c.bg}">
         <span class="ci">${c.icon}</span><strong>${c.label}</strong><small>${c.n} ${c.n === 1 ? 'sound' : 'sounds'}</small>
       </button>`).join('');
    catsEl.querySelectorAll('.reveal').forEach(el => revealObs && revealObs.observe(el));
  }

  function buildGrid() {
    grid.innerHTML = TRACKS.map(t => {
      const c = CATS[t.cat];
      return `<article class="card track reveal" data-id="${t.id}" data-cat="${t.cat}">
        <div class="cover ${c.g}"><span class="emo" aria-hidden="true">${t.icon}</span><div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>
        <div class="tbody"><span class="pill">${c.label}</span><h3>${t.title}</h3><p>${t.desc}</p></div>
        <div class="tfoot"><small>${t.src ? 'Audio file' : 'Live-generated · endless'}</small>
          <button class="play" aria-label="Play ${t.title}">▶</button></div>
      </article>`;
    }).join('');
    grid.querySelectorAll('.reveal').forEach(el => revealObs && revealObs.observe(el));
  }

  function applyFilter() {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    grid.querySelectorAll('.track').forEach(el => {
      const t = byId[el.dataset.id];
      const hay = (t.title + ' ' + CATS[t.cat].label + ' ' + t.desc + ' ' + t.tags.join(' ')).toLowerCase();
      const show = (activeCat === 'all' || t.cat === activeCat) && words.every(w => hay.includes(w));
      el.hidden = !show; if (show) { n++; el.classList.add('in'); }
    });
    emptyEl.hidden = n > 0;
    countEl.textContent = n === 1 ? '1 sound' : n + ' sounds';
  }

  function ui() {
    grid.querySelectorAll('.track').forEach(el => {
      const t = byId[el.dataset.id], isCur = S.id === t.id, btn = el.querySelector('.play');
      el.classList.toggle('active', isCur);
      el.classList.toggle('playing', isCur && S.playing);
      el.classList.toggle('unavail', !!t.broken);
      btn.textContent = isCur && S.playing ? '⏸' : '▶';
      btn.setAttribute('aria-label', (isCur && S.playing ? 'Pause ' : 'Play ') + t.title);
    });
    renderPlayer();
  }

  function renderPlayer() {
    const t = cur();
    player.classList.toggle('show', !!t);
    if (!t) return;
    pTitle.textContent = t.title;
    pSub.textContent = CATS[t.cat].label + (t.src ? ' · audio file' : ' · live-generated');
    pPlay.textContent = S.playing ? '⏸' : '▶';
    pPlay.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
    let el, total;
    if (t.src) {
      el = S.audio ? S.audio.currentTime : 0;
      total = S.audio && isFinite(S.audio.duration) ? S.audio.duration : 0;
      pBar.disabled = !total;
    } else {
      el = S.elapsed; total = S.len; pBar.disabled = true;
    }
    pBar.max = total || 1;
    if (!seeking) pBar.value = el;
    pBar.style.setProperty('--p', (total ? Math.min(100, el / total * 100) : 0) + '%');
    pTime.textContent = fmt(el) + ' / ' + (total ? fmt(total) : '--:--');
    pLenWrap.hidden = !!t.src;
  }

  /* ------------------------------ events ------------------------------ */
  grid.addEventListener('click', e => {
    const b = e.target.closest('.play'); if (!b) return;
    select(b.closest('.track').dataset.id);
  });

  catsEl.addEventListener('click', e => {
    const b = e.target.closest('.cat'); if (!b) return;
    activeCat = (b.dataset.cat === activeCat) ? 'all' : b.dataset.cat;
    catsEl.querySelectorAll('.cat').forEach(x => x.setAttribute('aria-pressed', x.dataset.cat === activeCat));
    applyFilter();
  });

  search.addEventListener('input', () => { query = search.value; applyFilter(); });
  $('reset').addEventListener('click', () => {
    query = ''; search.value = ''; activeCat = 'all';
    catsEl.querySelectorAll('.cat').forEach(x => x.setAttribute('aria-pressed', x.dataset.cat === 'all'));
    applyFilter();
  });

  pPlay.addEventListener('click', () => { S.playing ? pause() : resume(); });
  pStop.addEventListener('click', () => { halt(); S.id = null; S.elapsed = 0; ui(); });

  pVol.addEventListener('input', () => {
    vol = +pVol.value;
    pVol.style.setProperty('--p', vol * 100 + '%');
    if (master) master.gain.value = vol;
    if (S.audio) S.audio.volume = vol;
  });
  pLen.addEventListener('change', () => {
    S.len = +pLen.value;
    const t = cur(); if (t && !t.src && S.elapsed >= S.len) finishSession(); else renderPlayer();
  });

  pBar.addEventListener('pointerdown', () => { seeking = true; });
  pBar.addEventListener('pointerup', () => { seeking = false; });
  pBar.addEventListener('input', () => {
    const t = cur();
    if (t && t.src && S.audio && isFinite(S.audio.duration)) {
      S.audio.currentTime = +pBar.value;
      pBar.style.setProperty('--p', (+pBar.value / +pBar.max * 100) + '%');
    }
  });

  /* ------------------------------ init ------------------------------ */
  // Same scroll-reveal behaviour as main.js, applied to the cards built here
  const revealObs = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); } }), { threshold: .1 })
    : null;

  buildCats();
  buildGrid();
  pVol.style.setProperty('--p', vol * 100 + '%');
  applyFilter();
  ui();
})();

/* CalmNest: Local Audio Upload */
const localAudioInput = document.getElementById("localAudio");
const localPlayer = document.getElementById("localPlayer");
const uploadStatus = document.getElementById("uploadStatus");

let localAudioURL = null;

if (localAudioInput && localPlayer && uploadStatus) {
  localAudioInput.addEventListener("change", function () {
    const file = this.files[0];

    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      uploadStatus.textContent = "Please choose a valid audio file.";
      return;
    }

    if (localAudioURL) {
      URL.revokeObjectURL(localAudioURL);
    }

    localAudioURL = URL.createObjectURL(file);
    localPlayer.src = localAudioURL;
    localPlayer.load();

    uploadStatus.textContent = "Selected: " + file.name;

    localPlayer.play().catch(() => {
      uploadStatus.textContent =
        "Selected: " + file.name + " — press Play to listen.";
    });
  });
}
