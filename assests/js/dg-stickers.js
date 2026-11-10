/* =====================================================================
   dg-stickers.js  |  CalmNest Diary Garden: sticker library

   Inline-SVG stickers (no image files, no external requests).
   Namespace: window.CalmNestDG.Stickers

   Sticker descriptor (frozen):
     { type, name, category, keywords: [...], svg: "<svg ...>...</svg>" }

   Type IDs look like "flowers-daisy" and satisfy the rule used by
   dg-storage.js: /^[a-z0-9][a-z0-9:_-]{0,47}$/i

   Public API
     list()                       all stickers
     find(type) / get(type)       one sticker, or null
     has(type)
     byCategory(categoryId)       "all" or empty returns everything
     categories()                 [{ id, label, icon, count }]
     search(query)                matches name, category and keywords
     svg(type, opts)              SVG markup string (falls back to FALLBACK_TYPE)
                                  opts: { className, label }
     element(type, opts)          a real <svg> element, or null
     isValidType(type)
     FALLBACK_TYPE
   ===================================================================== */
(function () {
  'use strict';

  const NS = (window.CalmNestDG = window.CalmNestDG || {});
  if (NS.Stickers) { return; }

  /* ------------------------------ constants ------------------------------ */
  const TYPE_RE = /^[a-z0-9][a-z0-9:_-]{0,47}$/i;
  const FALLBACK_TYPE = 'stars-sparkle';
  const INK = '#4a5b6b';

  /* Category ids match the data-cat values on the tabs in diary-garden.html */
  const CATEGORIES = Object.freeze([
    Object.freeze({ id: 'flowers', label: 'Flowers', icon: '🌸' }),
    Object.freeze({ id: 'cats', label: 'Cats', icon: '🐱' }),
    Object.freeze({ id: 'butterflies', label: 'Butterflies', icon: '🦋' }),
    Object.freeze({ id: 'stars', label: 'Stars', icon: '⭐' }),
    Object.freeze({ id: 'clouds', label: 'Clouds', icon: '☁️' }),
    Object.freeze({ id: 'ribbons', label: 'Ribbons', icon: '🎀' }),
    Object.freeze({ id: 'plants', label: 'Plants', icon: '🪴' })
  ]);
  const CAT_LABEL = {};
  CATEGORIES.forEach(function (c) { CAT_LABEL[c.id] = c.label; });

  /* ------------------------------ SVG helpers ------------------------------ */
  const esc = function (v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const num = function (n) { return Math.round(n * 100) / 100; };

  function open(opts) {
    opts = opts || {};
    let attrs = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" focusable="false"';
    if (opts.className) { attrs += ' class="' + esc(opts.className) + '"'; }
    if (opts.label) { attrs += ' role="img" aria-label="' + esc(opts.label) + '"'; }
    else { attrs += ' aria-hidden="true"'; }
    return '<svg ' + attrs + '>';
  }

  /* Repeat a shape around a centre point (default 50,50) */
  function ring(count, shape, start, cx, cy) {
    const x = cx === undefined ? 50 : cx;
    const y = cy === undefined ? 50 : cy;
    let out = '';
    for (let i = 0; i < count; i++) {
      out += '<g transform="rotate(' + num((start || 0) + (360 / count) * i) + ' ' + x + ' ' + y + ')">' + shape + '</g>';
    }
    return out;
  }

  /* Four-point concave sparkle */
  function sparkle(cx, cy, r, fill, stroke, sw) {
    const k = r * 0.14;
    return '<path d="M' + num(cx) + ' ' + num(cy - r) +
      ' Q' + num(cx + k) + ' ' + num(cy - k) + ' ' + num(cx + r) + ' ' + num(cy) +
      ' Q' + num(cx + k) + ' ' + num(cy + k) + ' ' + num(cx) + ' ' + num(cy + r) +
      ' Q' + num(cx - k) + ' ' + num(cy + k) + ' ' + num(cx - r) + ' ' + num(cy) +
      ' Q' + num(cx - k) + ' ' + num(cy - k) + ' ' + num(cx) + ' ' + num(cy - r) +
      'Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (sw || 2) + '" stroke-linejoin="round"/>';
  }

  function starPoints(cx, cy, R, r, n) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 === 0 ? R : r;
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      pts.push(num(cx + rad * Math.cos(a)) + ',' + num(cy + rad * Math.sin(a)));
    }
    return pts.join(' ');
  }

  /* ------------------------------ flowers ------------------------------ */
  function daisy() {
    const petal = '<ellipse cx="50" cy="24" rx="6.8" ry="15" fill="#ffffff" stroke="#d6e6f2" stroke-width="1.4"/>';
    return ring(12, petal, 0) +
      '<circle cx="50" cy="50" r="11.5" fill="#ffe08a" stroke="#f3c340" stroke-width="2"/>' +
      '<circle cx="46.5" cy="46.5" r="3.2" fill="#fff6cf" opacity=".9"/>';
  }

  function sakura() {
    const petal =
      '<path d="M50 50 C34 40 34 16 44 12 L50 18 L56 12 C66 16 66 40 50 50Z" fill="#fbd3de" stroke="#f1a3b8" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M50 44 L50 26" fill="none" stroke="#f6b7c8" stroke-width="1.2" stroke-linecap="round"/>';
    return ring(5, petal, 0) +
      '<circle cx="50" cy="50" r="5.5" fill="#f4a0b7"/>' +
      ring(8, '<circle cx="50" cy="41" r="1.7" fill="#f3c340"/>', 0);
  }

  function tulip() {
    return '<path d="M50 62 L50 92" fill="none" stroke="#7fb192" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M50 90 C34 90 24 78 22 62 C38 62 48 74 50 90Z" fill="#a6d3b3" stroke="#7fb192" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M50 84 C62 84 72 74 76 62 C60 62 52 72 50 84Z" fill="#cfe6d4" stroke="#7fb192" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M30 30 C28 50 38 62 50 62 C62 62 72 50 70 30 L60 40 L50 22 L40 40Z" fill="#f4a9be" stroke="#e98ea6" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M44 44 C44 51 46.5 56 50 58" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".6"/>';
  }

  function sunflower() {
    const outer = '<ellipse cx="50" cy="22" rx="5.2" ry="14" fill="#ffd95c" stroke="#f0b52a" stroke-width="1.2"/>';
    const inner = '<ellipse cx="50" cy="29" rx="4.6" ry="10" fill="#ffe9a6" stroke="#f3c340" stroke-width="1"/>';
    return ring(14, outer, 0) + ring(14, inner, 360 / 28) +
      '<circle cx="50" cy="50" r="15" fill="#a9784a" stroke="#8a5f38" stroke-width="2"/>' +
      '<circle cx="50" cy="50" r="9.5" fill="#8f6540"/>' +
      ring(8, '<circle cx="50" cy="39" r="1.3" fill="#c9a074"/>', 0) +
      '<circle cx="45" cy="45" r="3" fill="#c9a074" opacity=".6"/>';
  }

  function forgetMeNot() {
    return ring(5, '<circle cx="50" cy="30" r="13" fill="#bfe3f6" stroke="#8cc8ea" stroke-width="1.6"/>', 0) +
      ring(5, '<circle cx="50" cy="24" r="2" fill="#ffffff" opacity=".85"/>', 0) +
      '<circle cx="50" cy="50" r="8" fill="#ffe9a6" stroke="#f3c340" stroke-width="1.6"/>';
  }

  function peony() {
    return ring(8, '<ellipse cx="50" cy="25" rx="13" ry="16" fill="#f9c6d3" stroke="#eea3b8" stroke-width="1.4"/>', 0) +
      ring(7, '<ellipse cx="50" cy="34" rx="10" ry="12.5" fill="#f6aec2" stroke="#e98ea6" stroke-width="1.2"/>', 12) +
      ring(6, '<ellipse cx="50" cy="41" rx="6.5" ry="8" fill="#f3a0b7" stroke="#e98ea6" stroke-width="1"/>', 0) +
      '<circle cx="50" cy="50" r="4.5" fill="#e98ea6"/>' +
      '<path d="M46 50 Q50 45 54 50" fill="none" stroke="#fbd3de" stroke-width="1.2" stroke-linecap="round"/>';
  }

  function lavender() {
    let s = '<path d="M50 94 L50 22" fill="none" stroke="#7fb192" stroke-width="3" stroke-linecap="round"/>';
    s += '<ellipse cx="38" cy="82" rx="12" ry="4.5" transform="rotate(-35 38 82)" fill="#a6d3b3" stroke="#7fb192" stroke-width="1.2"/>';
    s += '<ellipse cx="62" cy="82" rx="12" ry="4.5" transform="rotate(35 62 82)" fill="#a6d3b3" stroke="#7fb192" stroke-width="1.2"/>';
    for (let i = 0; i < 6; i++) {
      const y = 24 + i * 9;
      const fill = i % 2 ? '#cdb8ee' : '#d9cdf2';
      s += '<ellipse cx="43" cy="' + y + '" rx="3.8" ry="6.2" transform="rotate(-28 43 ' + y + ')" fill="' + fill + '" stroke="#b39ae0" stroke-width="1"/>';
      s += '<ellipse cx="57" cy="' + y + '" rx="3.8" ry="6.2" transform="rotate(28 57 ' + y + ')" fill="' + fill + '" stroke="#b39ae0" stroke-width="1"/>';
    }
    s += '<ellipse cx="50" cy="14" rx="3.6" ry="6.8" fill="#cdb8ee" stroke="#b39ae0" stroke-width="1"/>';
    return s;
  }

  /* ------------------------------ cats ------------------------------ */
  function catFace(o) {
    const fur = o.fur;
    const shade = o.shade;
    const ear = o.ear || '#f9c6d3';
    let s = '';
    s += '<path d="M18 46 L22 16 L46 30Z" fill="' + fur + '" stroke="' + shade + '" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<path d="M82 46 L78 16 L54 30Z" fill="' + fur + '" stroke="' + shade + '" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<path d="M25 40 L26 25 L39 32Z" fill="' + ear + '"/>';
    s += '<path d="M75 40 L74 25 L61 32Z" fill="' + ear + '"/>';
    s += '<ellipse cx="50" cy="56" rx="34" ry="28" fill="' + fur + '" stroke="' + shade + '" stroke-width="2.2"/>';
    if (o.patch) {
      s += '<ellipse cx="37" cy="41" rx="12" ry="9" transform="rotate(-20 37 41)" fill="' + o.patch + '"/>';
    }
    if (o.stripes) {
      s += '<path d="M50 31 V39 M43 32.5 L44.5 39 M57 32.5 L55.5 39" fill="none" stroke="' + shade + '" stroke-width="2.2" stroke-linecap="round"/>';
    }
    if (o.sleepy) {
      s += '<path d="M31 56 Q37 62 43 56 M57 56 Q63 62 69 56" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round"/>';
    } else {
      s += '<ellipse cx="37" cy="56" rx="3.4" ry="4.4" fill="' + INK + '"/>';
      s += '<ellipse cx="63" cy="56" rx="3.4" ry="4.4" fill="' + INK + '"/>';
      s += '<circle cx="38.2" cy="54.4" r="1.3" fill="#ffffff"/>';
      s += '<circle cx="64.2" cy="54.4" r="1.3" fill="#ffffff"/>';
    }
    s += '<path d="M47.5 63 H52.5 L50 66Z" fill="#f4a0b5" stroke="#f4a0b5" stroke-width="1" stroke-linejoin="round"/>';
    s += '<path d="M50 66.5 Q50 71 45.5 70.5 M50 66.5 Q50 71 54.5 70.5" fill="none" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round"/>';
    s += '<ellipse cx="29" cy="65" rx="5" ry="3" fill="#f9c6d3" opacity=".85"/>';
    s += '<ellipse cx="71" cy="65" rx="5" ry="3" fill="#f9c6d3" opacity=".85"/>';
    s += '<path d="M13 58 L24 60 M13 66 L24 64 M87 58 L76 60 M87 66 L76 64" fill="none" stroke="' + shade + '" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>';
    if (o.zzz) {
      s += '<path d="M85 14 H93 L85 24 H93 M92 4 H97 L92 10 H97" fill="none" stroke="#8cc8ea" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return s;
  }

  const CREAM = { fur: '#fff1d6', shade: '#e2c796' };

  function catSitting() {
    const tail = 'M74 86 C92 86 94 64 84 58';
    return '<path d="' + tail + '" fill="none" stroke="' + CREAM.shade + '" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="' + tail + '" fill="none" stroke="' + CREAM.fur + '" stroke-width="5.5" stroke-linecap="round"/>' +
      '<path d="M50 46 C32 46 24 66 26 80 C27 90 36 93 50 93 C64 93 73 90 74 80 C76 66 68 46 50 46Z" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2.2"/>' +
      '<ellipse cx="50" cy="75" rx="11" ry="14" fill="#fffaf0" opacity=".85"/>' +
      '<ellipse cx="40" cy="91" rx="7" ry="4" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2"/>' +
      '<ellipse cx="60" cy="91" rx="7" ry="4" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2"/>' +
      '<g transform="translate(22 4) scale(.56)">' + catFace({ fur: CREAM.fur, shade: CREAM.shade, stripes: true }) + '</g>';
  }

  function catLoaf() {
    const tail = 'M88 76 C95 74 96 64 91 60';
    return '<path d="' + tail + '" fill="none" stroke="' + CREAM.shade + '" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="' + tail + '" fill="none" stroke="' + CREAM.fur + '" stroke-width="4.5" stroke-linecap="round"/>' +
      '<ellipse cx="50" cy="72" rx="38" ry="21" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2.2"/>' +
      '<g transform="translate(17 8) scale(.66)">' + catFace({ fur: CREAM.fur, shade: CREAM.shade, sleepy: true }) + '</g>' +
      '<ellipse cx="36" cy="86" rx="8" ry="4.5" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2"/>' +
      '<ellipse cx="64" cy="86" rx="8" ry="4.5" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2"/>';
  }

  function catPeek() {
    return '<g transform="translate(0 -4)">' + catFace({ fur: CREAM.fur, shade: CREAM.shade, stripes: true }) + '</g>' +
      '<rect x="10" y="66" width="80" height="18" rx="9" fill="#cfe6d4" stroke="#7fb192" stroke-width="2.2"/>' +
      '<ellipse cx="35" cy="66" rx="8" ry="5.5" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2"/>' +
      '<ellipse cx="65" cy="66" rx="8" ry="5.5" fill="' + CREAM.fur + '" stroke="' + CREAM.shade + '" stroke-width="2"/>';
  }

  /* ------------------------------ butterflies ------------------------------ */
  function butterfly(top, bottom, dot, line) {
    const wing =
      '<path d="M48 46 C40 18 14 10 10 28 C8 42 28 52 48 50Z" fill="' + top + '" stroke="' + line + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M48 52 C30 52 18 62 22 76 C26 90 44 82 48 58Z" fill="' + bottom + '" stroke="' + line + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<circle cx="24" cy="31" r="4.2" fill="' + dot + '"/>' +
      '<circle cx="30" cy="73" r="3" fill="' + dot + '"/>' +
      '<path d="M44 47 C34 36 24 32 17 34" fill="none" stroke="' + dot + '" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>';
    return wing +
      '<g transform="translate(100 0) scale(-1 1)">' + wing + '</g>' +
      '<rect x="46.6" y="34" width="6.8" height="40" rx="3.4" fill="#6f8397"/>' +
      '<path d="M49 36 C47 27 43 22 38 19 M51 36 C53 27 57 22 62 19" fill="none" stroke="#6f8397" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="38" cy="19" r="2" fill="#6f8397"/><circle cx="62" cy="19" r="2" fill="#6f8397"/>';
  }

  /* ------------------------------ stars ------------------------------ */
  function sparkleSticker(fill, stroke, accent) {
    return sparkle(50, 50, 40, fill, stroke, 2.5) +
      sparkle(80, 20, 10, accent, stroke, 1.5) +
      sparkle(20, 80, 7, accent, stroke, 1.3);
  }

  function luckyStar() {
    return '<polygon points="' + starPoints(50, 54, 42, 19, 5) + '" fill="#ffe9a6" stroke="#f3c340" stroke-width="4" stroke-linejoin="round"/>' +
      '<polygon points="' + starPoints(50, 54, 22, 10, 5) + '" fill="#fff6d0" opacity=".85" stroke="#fff6d0" stroke-width="2" stroke-linejoin="round"/>';
  }

  function shimmerTrio() {
    const fill = '#cfeaf9';
    const line = '#7fbcdf';
    return sparkle(40, 56, 26, fill, line, 2.2) +
      sparkle(72, 26, 14, '#ffffff', line, 1.8) +
      sparkle(76, 76, 10, fill, line, 1.6) +
      '<circle cx="18" cy="24" r="2.4" fill="#ffffff" stroke="' + line + '" stroke-width="1"/>' +
      '<circle cx="88" cy="52" r="1.8" fill="#ffffff" stroke="' + line + '" stroke-width="1"/>';
  }

  function crescentMoon() {
    return '<path d="M74 14 A38 38 0 1 0 74 86 A40 40 0 0 1 74 14Z" fill="#ffe9a6" stroke="#f3c340" stroke-width="3" stroke-linejoin="round"/>' +
      sparkle(76, 32, 9, '#fff0b8', '#f3c340', 1.5) +
      '<circle cx="34" cy="38" r="2.2" fill="#fff6d0"/>' +
      '<circle cx="30" cy="58" r="1.6" fill="#fff6d0"/>';
  }

  /* ------------------------------ clouds ------------------------------ */
  function cloudBody(fill, line) {
    const shapes = '<circle cx="34" cy="58" r="16"/><circle cx="54" cy="46" r="22"/><circle cx="74" cy="58" r="14"/><rect x="22" y="58" width="64" height="16" rx="8"/>';
    return '<g fill="' + line + '" stroke="' + line + '" stroke-width="5" stroke-linejoin="round">' + shapes + '</g>' +
      '<g fill="' + fill + '">' + shapes + '</g>';
  }

  function cloudFluffy() {
    return '<g transform="translate(0 6)">' + cloudBody('#ffffff', '#cfe3f2') +
      '<path d="M30 56 Q33 48 41 46" fill="none" stroke="#dcebf7" stroke-width="2.4" stroke-linecap="round"/></g>';
  }

  function cloudSleepy() {
    return '<g transform="translate(0 6)">' + cloudBody('#ffffff', '#cfe3f2') +
      '<path d="M42 58 Q46 62 50 58 M58 58 Q62 62 66 58" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M52 64 Q54 66.5 56 64" fill="none" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round"/>' +
      '<ellipse cx="38" cy="64" rx="4" ry="2.5" fill="#f9c6d3" opacity=".85"/>' +
      '<ellipse cx="70" cy="64" rx="4" ry="2.5" fill="#f9c6d3" opacity=".85"/></g>';
  }

  function raindrop(x, y) {
    return '<path transform="translate(' + x + ' ' + y + ')" d="M0 0 C0 0 -6 8 -6 12 C-6 15.3 -3.3 18 0 18 C3.3 18 6 15.3 6 12 C6 8 0 0 0 0Z" fill="#8cc8ea" stroke="#5aa9d6" stroke-width="1"/>';
  }

  function cloudRain() {
    return '<g transform="translate(0 -6)">' + cloudBody('#e3ecf4', '#b4c6d6') + '</g>' +
      raindrop(34, 76) + raindrop(54, 80) + raindrop(74, 76);
  }

  function cloudSunny() {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      rays += '<g transform="rotate(' + i * 45 + ' 68 32)"><line x1="68" y1="6" x2="68" y2="12" stroke="#f3c340" stroke-width="3" stroke-linecap="round"/></g>';
    }
    return rays +
      '<circle cx="68" cy="32" r="17" fill="#ffe08a" stroke="#f3c340" stroke-width="2"/>' +
      '<g transform="translate(-6 12)">' + cloudBody('#ffffff', '#cfe3f2') + '</g>';
  }

  function cloudSunset() {
    return sparkle(80, 20, 8, '#fff0b8', '#f3c340', 1.3) +
      sparkle(18, 30, 5, '#fff0b8', '#f3c340', 1.1) +
      '<g transform="translate(0 6)">' + cloudBody('#fde4ea', '#f2b8c8') +
      '<path d="M30 56 Q33 48 41 46" fill="none" stroke="#fff4f7" stroke-width="2.4" stroke-linecap="round"/></g>';
  }

  /* ------------------------------ ribbons ------------------------------ */
  function bow(light, mid, dark) {
    const loopL = 'M46 50 C34 32 12 30 11 45 C10 60 30 66 46 55Z';
    const loopR = 'M54 50 C66 32 88 30 89 45 C90 60 70 66 54 55Z';
    const edge = ' fill="' + mid + '" stroke="' + dark + '" stroke-width="2" stroke-linejoin="round"/>';
    return '<path d="M47 56 L29 90 L42 84 L50 60Z"' + edge +
      '<path d="M53 56 L71 90 L58 84 L50 60Z"' + edge +
      '<path d="' + loopL + '"' + edge +
      '<path d="' + loopR + '"' + edge +
      '<path d="M40 49 C30 40 20 38 17 44 M60 49 C70 40 80 38 83 44" fill="none" stroke="' + light + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<rect x="42" y="43" width="16" height="17" rx="6" fill="' + light + '" stroke="' + dark + '" stroke-width="2"/>';
  }

  function washi(base, stripe, edge) {
    const body = 'M8 36 L92 36 L88 40.7 L92 45.3 L88 50 L92 54.7 L88 59.3 L92 64 L8 64 L12 59.3 L8 54.7 L12 50 L8 45.3 L12 40.7Z';
    let stripes = '';
    for (let k = 0; k < 4; k++) {
      const x0 = 26 + k * 18;
      stripes += '<path d="M' + x0 + ' 36 L' + (x0 + 8) + ' 36 L' + (x0 + 2) + ' 64 L' + (x0 - 6) + ' 64Z" fill="' + stripe + '" opacity=".75"/>';
    }
    return '<g transform="rotate(-8 50 50)">' +
      '<path d="' + body + '" fill="' + base + '" stroke="' + edge + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      stripes + '</g>';
  }

  /* ------------------------------ plants ------------------------------ */
  function sprout() {
    return '<path d="M50 88 C50 72 50 62 50 50" fill="none" stroke="#7fb192" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M50 56 C36 58 22 50 20 34 C36 32 48 42 50 56Z" fill="#a6d3b3" stroke="#7fb192" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M50 50 C60 52 74 44 78 28 C62 26 52 36 50 50Z" fill="#cfe6d4" stroke="#7fb192" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M24 92 C28 80 40 76 50 76 C60 76 72 80 76 92Z" fill="#ecd3ae" stroke="#cfa874" stroke-width="2" stroke-linejoin="round"/>';
  }

  function clover() {
    const leaf =
      '<path d="M50 50 C34 40 28 24 38 18 C44 14 50 20 50 26 C50 20 56 14 62 18 C72 24 66 40 50 50Z" fill="#a6d3b3" stroke="#7fb192" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M50 46 V28" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>';
    return '<path d="M50 50 C62 62 72 78 84 92" fill="none" stroke="#7fb192" stroke-width="4" stroke-linecap="round"/>' +
      ring(4, leaf, 0);
  }

  function pottedPlant() {
    const leaf = function (rot, fill) {
      return '<ellipse cx="50" cy="40" rx="9" ry="21" transform="rotate(' + rot + ' 50 66)" fill="' + fill + '" stroke="#7fb192" stroke-width="1.8"/>' +
        '<path d="M50 24 V54" transform="rotate(' + rot + ' 50 66)" fill="none" stroke="#7fb192" stroke-width="1" opacity=".5"/>';
    };
    return leaf(-38, '#cfe6d4') + leaf(38, '#cfe6d4') + leaf(0, '#a6d3b3') +
      '<path d="M30 73 H70 L65.5 92 Q65 94 62.5 94 H37.5 Q35 94 34.5 92Z" fill="#fbd3de" stroke="#e98ea6" stroke-width="2" stroke-linejoin="round"/>' +
      '<rect x="26" y="62" width="48" height="11" rx="4.5" fill="#f4a9be" stroke="#e98ea6" stroke-width="2"/>' +
      '<circle cx="44" cy="81" r="1.7" fill="' + INK + '"/><circle cx="56" cy="81" r="1.7" fill="' + INK + '"/>' +
      '<path d="M47 85 Q50 88 53 85" fill="none" stroke="' + INK + '" stroke-width="1.5" stroke-linecap="round"/>' +
      '<ellipse cx="40" cy="85" rx="3" ry="1.9" fill="#f9c6d3"/><ellipse cx="60" cy="85" rx="3" ry="1.9" fill="#f9c6d3"/>';
  }

  function cactus() {
    const g = '#a6d3b3';
    const d = '#7fb192';
    const arm = function (p) {
      return '<path d="' + p + '" fill="none" stroke="' + d + '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="' + p + '" fill="none" stroke="' + g + '" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>';
    };
    return arm('M40 62 H30 Q24 62 24 56 V46') + arm('M60 54 H70 Q76 54 76 48 V38') +
      '<rect x="36" y="22" width="28" height="66" rx="14" fill="' + g + '" stroke="' + d + '" stroke-width="2.4"/>' +
      '<path d="M43 32 V42" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".6"/>' +
      '<circle cx="44" cy="50" r="1.8" fill="' + INK + '"/><circle cx="56" cy="50" r="1.8" fill="' + INK + '"/>' +
      '<path d="M47.5 55 Q50 58 52.5 55" fill="none" stroke="' + INK + '" stroke-width="1.5" stroke-linecap="round"/>' +
      '<ellipse cx="40" cy="55" rx="3" ry="2" fill="#f9c6d3" opacity=".9"/><ellipse cx="60" cy="55" rx="3" ry="2" fill="#f9c6d3" opacity=".9"/>' +
      ring(5, '<circle cx="50" cy="14.5" r="3.6" fill="#f4a9be"/>', 0, 50, 20) +
      '<circle cx="50" cy="20" r="2.4" fill="#ffe08a"/>' +
      '<path d="M30 80 H70 L65 94 Q64.5 96 62 96 H38 Q35.5 96 35 94Z" fill="#fbd3de" stroke="#e98ea6" stroke-width="2" stroke-linejoin="round"/>' +
      '<rect x="28" y="76" width="44" height="8" rx="3.5" fill="#f9c6d3" stroke="#e98ea6" stroke-width="2"/>';
  }

  function sprig() {
    let s = '<path d="M50 94 C48 70 52 40 50 12" fill="none" stroke="#7fb192" stroke-width="3" stroke-linecap="round"/>';
    const ys = [80, 64, 48, 32];
    for (let i = 0; i < ys.length; i++) {
      const y = ys[i];
      const f1 = i % 2 ? '#cfe6d4' : '#a6d3b3';
      const f2 = i % 2 ? '#a6d3b3' : '#cfe6d4';
      s += '<ellipse cx="38" cy="' + y + '" rx="11" ry="5.5" transform="rotate(-30 38 ' + y + ')" fill="' + f1 + '" stroke="#7fb192" stroke-width="1.6"/>';
      s += '<ellipse cx="62" cy="' + (y - 6) + '" rx="11" ry="5.5" transform="rotate(30 62 ' + (y - 6) + ')" fill="' + f2 + '" stroke="#7fb192" stroke-width="1.6"/>';
    }
    s += '<ellipse cx="50" cy="14" rx="5" ry="10" fill="#a6d3b3" stroke="#7fb192" stroke-width="1.6"/>';
    return s;
  }

  /* ------------------------------ registry ------------------------------ */
  const ITEMS = [];
  const INDEX = new Map();
  const INNER = new Map();

  function add(type, name, category, keywords, inner) {
    if (!TYPE_RE.test(type) || INDEX.has(type) || !CAT_LABEL[category]) {
      console.warn('[CalmNestDG.Stickers] skipped invalid or duplicate sticker:', type);
      return;
    }
    const item = Object.freeze({
      type: type,
      name: name,
      category: category,
      keywords: Object.freeze(keywords.slice()),
      svg: open() + inner + '</svg>'
    });
    ITEMS.push(item);
    INDEX.set(type, item);
    INNER.set(type, inner);
  }

  /* flowers */
  add('flowers-daisy', 'Daisy', 'flowers', ['white', 'spring', 'yellow'], daisy());
  add('flowers-sakura', 'Cherry Blossom', 'flowers', ['pink', 'spring', 'sakura', 'blossom'], sakura());
  add('flowers-tulip', 'Pink Tulip', 'flowers', ['pink', 'spring', 'tulip'], tulip());
  add('flowers-sunflower', 'Sunflower', 'flowers', ['yellow', 'summer', 'sun'], sunflower());
  add('flowers-forgetmenot', 'Forget-me-not', 'flowers', ['blue', 'small', 'memory'], forgetMeNot());
  add('flowers-peony', 'Peony', 'flowers', ['pink', 'soft', 'bloom'], peony());
  add('flowers-lavender', 'Lavender', 'flowers', ['purple', 'calm', 'sleep'], lavender());

  /* cats */
  add('cats-cream', 'Cream Cat', 'cats', ['kitten', 'cute', 'face', 'tabby'],
    catFace({ fur: CREAM.fur, shade: CREAM.shade, stripes: true }));
  add('cats-misty', 'Misty Cat', 'cats', ['kitten', 'grey', 'blue', 'face'],
    catFace({ fur: '#cfdbe8', shade: '#9db4cb' }));
  add('cats-calico', 'Calico Cat', 'cats', ['kitten', 'patch', 'orange', 'face'],
    catFace({ fur: '#fffaf0', shade: '#e2d2b6', patch: '#f3c98a' }));
  add('cats-sleepy', 'Sleepy Cat', 'cats', ['sleep', 'nap', 'rest', 'zzz'],
    catFace({ fur: CREAM.fur, shade: CREAM.shade, sleepy: true, zzz: true }));
  add('cats-sitting', 'Sitting Cat', 'cats', ['pose', 'tail', 'calm'], catSitting());
  add('cats-loaf', 'Cat Loaf', 'cats', ['cozy', 'sleep', 'rest', 'loaf'], catLoaf());
  add('cats-peek', 'Peeking Cat', 'cats', ['curious', 'hello', 'peek'], catPeek());

  /* butterflies */
  add('butterflies-sky', 'Sky Butterfly', 'butterflies', ['blue', 'calm', 'fly'], butterfly('#bfe3f6', '#8cc8ea', '#ffffff', '#6fb0d6'));
  add('butterflies-buttercup', 'Buttercup Butterfly', 'butterflies', ['yellow', 'sunny', 'fly'], butterfly('#ffe9a6', '#f7cf6a', '#fff8d9', '#e2a92a'));
  add('butterflies-blush', 'Blush Butterfly', 'butterflies', ['pink', 'soft', 'fly'], butterfly('#f9c6d3', '#f4a9be', '#ffffff', '#e98ea6'));
  add('butterflies-sage', 'Sage Butterfly', 'butterflies', ['green', 'garden', 'fly'], butterfly('#cfe6d4', '#a6d3b3', '#ffffff', '#7fb192'));
  add('butterflies-lilac', 'Lilac Butterfly', 'butterflies', ['purple', 'dreamy', 'fly'], butterfly('#e0d6f5', '#c3b3ea', '#ffffff', '#a592d8'));

  /* stars */
  add('stars-sparkle', 'Golden Sparkle', 'stars', ['gold', 'shine', 'twinkle'], sparkleSticker('#ffe08a', '#f3c340', '#fff0b8'));
  add('stars-blush', 'Blush Sparkle', 'stars', ['pink', 'shine', 'twinkle'], sparkleSticker('#f9c6d3', '#e98ea6', '#fde4ea'));
  add('stars-lucky', 'Lucky Star', 'stars', ['gold', 'wish', 'classic'], luckyStar());
  add('stars-shimmer', 'Shimmer Trio', 'stars', ['blue', 'shine', 'dreamy'], shimmerTrio());
  add('stars-moon', 'Crescent Moon', 'stars', ['night', 'sleep', 'moon'], crescentMoon());

  /* clouds */
  add('clouds-fluffy', 'Fluffy Cloud', 'clouds', ['white', 'sky', 'soft'], cloudFluffy());
  add('clouds-sleepy', 'Sleepy Cloud', 'clouds', ['face', 'cute', 'rest'], cloudSleepy());
  add('clouds-rain', 'Rain Cloud', 'clouds', ['rain', 'drops', 'weather'], cloudRain());
  add('clouds-sunny', 'Sunny Cloud', 'clouds', ['sun', 'warm', 'weather'], cloudSunny());
  add('clouds-sunset', 'Sunset Cloud', 'clouds', ['pink', 'evening', 'dusk'], cloudSunset());

  /* ribbons */
  add('ribbons-bow-pink', 'Pink Bow', 'ribbons', ['bow', 'pink', 'gift'], bow('#fde4ea', '#f4a9be', '#e98ea6'));
  add('ribbons-bow-butter', 'Butter Bow', 'ribbons', ['bow', 'yellow', 'gift'], bow('#fff4c7', '#ffe08a', '#e2a92a'));
  add('ribbons-bow-sky', 'Sky Bow', 'ribbons', ['bow', 'blue', 'gift'], bow('#e3f3fc', '#a9d7f0', '#6fb0d6'));
  add('ribbons-bow-sage', 'Sage Bow', 'ribbons', ['bow', 'green', 'gift'], bow('#e6f3ea', '#b7dcc2', '#7fb192'));
  add('ribbons-washi-pink', 'Pink Washi Tape', 'ribbons', ['tape', 'washi', 'pink', 'decor'], washi('#fbd3de', '#ffffff', '#f1a3b8'));
  add('ribbons-washi-sky', 'Sky Washi Tape', 'ribbons', ['tape', 'washi', 'blue', 'decor'], washi('#cfeaf9', '#ffffff', '#8cc8ea'));

  /* plants */
  add('plants-sprout', 'Little Sprout', 'plants', ['grow', 'seed', 'new'], sprout());
  add('plants-clover', 'Four-leaf Clover', 'plants', ['luck', 'green', 'clover'], clover());
  add('plants-potted', 'Potted Plant', 'plants', ['pot', 'home', 'leaves'], pottedPlant());
  add('plants-cactus', 'Happy Cactus', 'plants', ['cactus', 'pot', 'desert', 'cute'], cactus());
  add('plants-sprig', 'Leaf Sprig', 'plants', ['leaf', 'green', 'branch'], sprig());

  /* ------------------------------ public functions ------------------------------ */
  function isValidType(type) { return typeof type === 'string' && TYPE_RE.test(type); }

  function list() { return ITEMS.slice(); }

  function find(type) {
    return typeof type === 'string' ? (INDEX.get(type) || null) : null;
  }

  function has(type) { return find(type) !== null; }

  function byCategory(category) {
    if (!category || category === 'all') { return list(); }
    return ITEMS.filter(function (s) { return s.category === category; });
  }

  function categories() {
    return CATEGORIES.map(function (c) {
      return { id: c.id, label: c.label, icon: c.icon, count: byCategory(c.id).length };
    });
  }

  function search(query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { return list(); }
    return ITEMS.filter(function (s) {
      const hay = (s.name + ' ' + CAT_LABEL[s.category] + ' ' + s.keywords.join(' ')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
  }

  /* Always returns SVG markup. Unknown types fall back to FALLBACK_TYPE. */
  function svg(type, opts) {
    const key = INDEX.has(type) ? type : FALLBACK_TYPE;
    return open(opts) + INNER.get(key) + '</svg>';
  }

  /* Returns a real <svg> element, or null if the browser cannot build one */
  function element(type, opts) {
    try {
      const doc = new DOMParser().parseFromString(svg(type, opts), 'image/svg+xml');
      const root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
        return null;
      }
      return document.importNode(root, true);
    } catch (e) {
      return null;
    }
  }

  NS.Stickers = Object.freeze({
    FALLBACK_TYPE: FALLBACK_TYPE,
    list: list,
    find: find,
    get: find,
    has: has,
    byCategory: byCategory,
    categories: categories,
    search: search,
    svg: svg,
    element: element,
    isValidType: isValidType
  });
})();