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

const natureImages = {
  forest: [
    'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1440942574812-185bf7cf6c49?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1438185074000-4b84f7ffc075?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1400&q=85'
  ],

  ocean: [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1482938289607-e9573fc25ebb?auto=format&fit=crop&w=1400&q=85'
  ],

  mountains: [
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1439853849133-aaf5b7b5f55b?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=85'
  ]
};

let currentNaturePreset = null;


function update() {
  const preset = stage.dataset.preset;

  label.textContent =
    `${cap(preset)} · ${cap(stage.dataset.mood)}${photoUrl ? ' · Custom image' : ''}`;

  if (!photoUrl && currentNaturePreset !== preset) {
    const images = natureImages[preset];
    const randomImage = images[Math.floor(Math.random() * images.length)];

    photo.style.backgroundImage = `url("${randomImage}")`;

    currentNaturePreset = preset;
    stage.classList.add('has-photo');
  }
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

// Saved scenes stay in localStorage. A signed-in session also copies them to
// Supabase. Uploaded images are still only a temporary preview.
const SCENE_PRESETS = ['forest', 'ocean', 'mountains'];
const SCENE_MOODS = ['morning', 'sunset', 'rainy'];
let scenePaint = 0;

function readScenes() {
  try {
    const parsed = JSON.parse(localStorage.getItem('calmnest_scenes') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function sceneKey(scene) {
  if (scene && typeof scene.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(scene.id)) return scene.id;
  const basis = [scene && scene.savedAt, scene && scene.name, scene && scene.preset, scene && scene.mood].join('|');
  let hash = 0;
  for (let i = 0; i < basis.length; i++) hash = (Math.imul(31, hash) + basis.charCodeAt(i)) | 0;
  return 's' + Math.abs(hash).toString(36);
}

function saveScene(payload) {
  const all = readScenes();
  all.unshift({
    ...payload,
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    savedAt: new Date().toISOString()
  });
  localStorage.setItem('calmnest_scenes', JSON.stringify(all.slice(0, 6)));
  uploadScene(all[0]);
}

function uploadScene(scene) {
  if (!scene || SCENE_PRESETS.indexOf(scene.preset) === -1 || SCENE_MOODS.indexOf(scene.mood) === -1) return;
  const auth = window.CalmNestAuth;
  if (!auth || typeof auth.configured !== 'function' || !auth.configured()) return;
  Promise.resolve()
    .then(async () => {
      if (auth.ready) await auth.ready;
      const session = await auth.getSession();
      const client = auth.client();
      if (!session || !session.user || !client) return;
      const { error } = await client.from('calmnest_scenes').upsert({
        id: sceneKey(scene),
        user_id: session.user.id,
        name: String(scene.name || 'Untitled scene').slice(0, 40),
        preset: scene.preset,
        mood: scene.mood,
        has_custom_image: !!scene.hasCustomImage,
        saved_at: scene.savedAt || new Date().toISOString()
      }, { onConflict: 'user_id,id' });
      if (error) throw error;
    })
    .catch((err) => {
      console.warn('[CalmNest] This scene is saved on this device. Online sync was skipped.', err);
    });
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

function paintScenes(all) {
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

function renderSaved() {
  const gen = ++scenePaint;
  const local = readScenes();
  paintScenes(local);
  refreshScenesFromCloud(gen, local);
}

async function refreshScenesFromCloud(gen, local) {
  try {
    const auth = window.CalmNestAuth;
    if (!auth || typeof auth.configured !== 'function' || !auth.configured()) return;
    if (auth.ready) await auth.ready;
    if (gen !== scenePaint) return;
    const session = await auth.getSession();
    const client = auth.client();
    if (!session || !client) return;
    local.forEach(uploadScene);
    const { data, error } = await client.from('calmnest_scenes')
      .select('id,name,preset,mood,has_custom_image,saved_at')
      .order('saved_at', { ascending: false });
    if (error) throw error;
    if (gen !== scenePaint || !Array.isArray(data)) return;
    const seen = new Set(local.map(sceneKey));
    const extras = [];
    data.forEach(row => {
      if (seen.has(row.id)) return;
      if (SCENE_PRESETS.indexOf(row.preset) === -1 || SCENE_MOODS.indexOf(row.mood) === -1) return;
      seen.add(row.id);
      extras.push({
        id: row.id,
        name: row.name,
        preset: row.preset,
        mood: row.mood,
        hasCustomImage: !!row.has_custom_image,
        savedAt: row.saved_at
      });
    });
    if (extras.length) paintScenes(local.concat(extras));
  } catch (err) {
    console.warn('[CalmNest] Saved scenes on this device are unchanged.', err);
  }
}

let tt;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

update(); renderSaved();