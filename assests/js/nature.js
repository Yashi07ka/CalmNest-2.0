const stage = document.getElementById('stage');
const label = document.getElementById('label');
const photo = document.getElementById('photo');
const fileIn = document.getElementById('file');
const clearBtn = document.getElementById('clear');
const nameIn = document.getElementById('name');
const savedBox = document.getElementById('saved');
const toastEl = document.getElementById('toast');
const cap = s => s[0].toUpperCase() + s.slice(1);

let photoUrl = null;

function update() {
  label.textContent = `${cap(stage.dataset.preset)} · ${cap(stage.dataset.mood)}${photoUrl ? ' · Custom image' : ''}`;
}

function bindGroup(id, key) {
  const group = document.getElementById(id);
  group.addEventListener('click', e => {
    const b = e.target.closest('.opt'); if (!b) return;
    group.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-pressed', x === b));
    stage.dataset[key] = b.dataset.v;
    update();
  });
}
bindGroup('presets', 'preset');
bindGroup('moods', 'mood');

// Rain drops
const rain = document.getElementById('rain');
for (let i = 0; i < 70; i++) {
  const d = document.createElement('i');
  d.style.left = Math.random() * 100 + '%';
  d.style.animationDuration = (0.7 + Math.random() * 0.7) + 's';
  d.style.animationDelay = (-Math.random() * 2) + 's';
  d.style.opacity = 0.4 + Math.random() * 0.6;
  rain.appendChild(d);
}

// Upload + preview
fileIn.addEventListener('change', () => {
  const f = fileIn.files[0]; if (!f) return;
  if (!f.type.startsWith('image/')) return toast('Please choose an image file.');
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(f);
  photo.style.backgroundImage = `url("${photoUrl}")`;
  stage.classList.add('has-photo');
  clearBtn.hidden = false;
  update();
});
clearBtn.addEventListener('click', () => {
  stage.classList.remove('has-photo');
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null; fileIn.value = ''; clearBtn.hidden = true; update();
});

// ---- Save My Scene (frontend placeholder) ----
// Later: replace the body of saveScene() with a fetch() POST to your Flask route.
// Uploaded images are NOT saved here; they will need real file upload handling on the backend.
function saveScene(payload) {
  const all = JSON.parse(localStorage.getItem('calmnest_scenes') || '[]');
  all.unshift({ ...payload, savedAt: new Date().toISOString() });
  localStorage.setItem('calmnest_scenes', JSON.stringify(all.slice(0, 6)));
}

document.getElementById('save').addEventListener('click', () => {
  const payload = {
    name: nameIn.value.trim() || `${cap(stage.dataset.preset)} ${stage.dataset.mood}`,
    preset: stage.dataset.preset,
    mood: stage.dataset.mood,
    hasCustomImage: !!photoUrl
  };
  try { saveScene(payload); toast(`Saved “${payload.name}” ✨`); renderSaved(); }
  catch { toast('Could not save in this browser.'); }
});

function renderSaved() {
  let all = [];
  try { all = JSON.parse(localStorage.getItem('calmnest_scenes') || '[]'); } catch {}
  savedBox.innerHTML = all.length ? '<span class="lbl">Saved scenes</span>' : '';
  all.forEach(s => {
    const b = document.createElement('button');
    b.textContent = `${s.name} · ${cap(s.preset)}, ${cap(s.mood)}`;
    b.onclick = () => {
      stage.dataset.preset = s.preset; stage.dataset.mood = s.mood;
      document.querySelectorAll('#presets .opt').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === s.preset));
      document.querySelectorAll('#moods .opt').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === s.mood));
      nameIn.value = s.name; update();
    };
    savedBox.appendChild(b);
  });
}

let tt;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

update(); renderSaved();