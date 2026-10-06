/* Fotos de progreso.
 * Se comprimen en el móvil y se guardan en IndexedDB (no en localStorage, que se queda corto).
 * Nunca salen del dispositivo. Usa las globales de index.html (profile, db, app, $, toast...).
 */
const ANGLES = [['frente', 'Frente'], ['lado', 'Lado'], ['espalda', 'Espalda']];
const angleName = (k) => (ANGLES.find(a => a[0] === k) || [k, k])[1];

const PhotoStore = (() => {
  let dbp = null;
  function open() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('rutina-fotos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' }).createIndex('profile', 'profile');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  function req(mode, fn) {
    return open().then(idb => new Promise((res, rej) => {
      const t = idb.transaction('photos', mode);
      const r = fn(t.objectStore('photos'));
      t.oncomplete = () => res(r && r.result);
      t.onerror = t.onabort = () => rej(t.error);
    }));
  }
  return {
    add: (p) => req('readwrite', s => s.put(p)),
    remove: (id) => req('readwrite', s => s.delete(id)),
    list: (prof) => req('readonly', s => s.index('profile').getAll(prof)).then(a => (a || []).sort((x, y) => x.date - y.date))
  };
})();

const photoURLs = new Map();
function photoURL(p) {
  if (!photoURLs.has(p.id)) photoURLs.set(p.id, URL.createObjectURL(p.blob));
  return photoURLs.get(p.id);
}
function fmtDay(t) {
  const d = new Date(t), sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-ES', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// Reduce la foto a 1280 px como máximo y la pasa a JPEG (unos 150-300 KB)
function compressImage(file, max = 1280, q = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('No se pudo procesar la foto')), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Formato de imagen no compatible')); };
    img.src = url;
  });
}

/* ===================== HOJA "AÑADIR FOTO" ===================== */
let photoDraft = null;   // { after, session, dayId, angle, blob, url }
let pendingPhoto = null; // se abre al volver al inicio tras terminar un entreno

function openPhotoSheet(ctx) {
  photoDraft = Object.assign({ angle: 'frente' }, ctx);
  renderPhotoSheet('intro');
  const w = $('#sheetWrap');
  w.classList.add('open');
  w.setAttribute('aria-hidden', 'false');
  $('#sheet').scrollTop = 0;
}
function clearPhotoDraft() {
  if (photoDraft && photoDraft.url) URL.revokeObjectURL(photoDraft.url);
  photoDraft = null;
}

function renderPhotoSheet(stage) {
  const d = photoDraft;
  const head = '<div class="grabber"></div><button class="close-btn" id="closeSheet" aria-label="Cerrar">×</button>';
  let html = '';
  if (stage === 'intro') {
    html = `
      <div class="photo-hero">${ICON_CAM}</div>
      <h2>${d.after ? `¡Entreno guardado, ${profile}! 💪` : 'Nueva foto de progreso'}</h2>
      <p class="sheet-sub">${d.after ? '¿Te haces una foto post-entreno? Es opcional.' : 'Añade una foto para ver tu evolución.'} Solo se guarda en este móvil.</p>
      <div class="photo-tip"><b>Para comparar bien:</b> mismo sitio y luz, ropa parecida y la misma postura. Mejor de frente, de lado y de espaldas.</div>
      <div class="sheet-actions">
        <label class="btn-primary">${ICON_CAM}Hacer foto<input type="file" accept="image/*" capture data-photo-input hidden></label>
        <label class="btn-secondary">Elegir de la galería<input type="file" accept="image/*" data-photo-input hidden></label>
        ${d.after ? '<button class="btn-text" data-photo="done">Ahora no</button>' : ''}
      </div>`;
  } else if (stage === 'loading') {
    html = '<div class="photo-loading">Preparando la foto…</div>';
  } else if (stage === 'preview') {
    html = `
      <h2>¿Qué ángulo es?</h2>
      <p class="sheet-sub">Así podrás comparar fotos del mismo ángulo.</p>
      <img class="photo-preview" src="${d.url}" alt="Foto elegida">
      <div class="angle-chips" role="radiogroup" aria-label="Ángulo">
        ${ANGLES.map(([k, l]) => `<button role="radio" data-angle="${k}" aria-checked="${d.angle === k}">${l}</button>`).join('')}
      </div>
      <div class="sheet-actions">
        <button class="btn-primary" data-photo="save">Guardar foto</button>
        <button class="btn-text" data-photo="retake">Elegir otra</button>
      </div>`;
  } else if (stage === 'saved') {
    html = `
      <div class="photo-hero ok">${ICON.check}</div>
      <h2>Foto guardada</h2>
      <p class="sheet-sub">Queda guardada con este entreno y en la <b>Galería</b> para comparar.</p>
      <div class="sheet-actions">
        <button class="btn-primary" data-photo="another">Añadir otro ángulo</button>
        <button class="btn-secondary" data-photo="evo">Ver la galería</button>
        <button class="btn-text" data-photo="done">Listo</button>
      </div>`;
  }
  $('#sheet').innerHTML = head + `<div class="photo-sheet">${html}</div>`;
}

async function onPhotoPicked(input) {
  const file = input.files && input.files[0];
  if (!file || !photoDraft) return;
  renderPhotoSheet('loading');
  try {
    const blob = await compressImage(file);
    if (photoDraft.url) URL.revokeObjectURL(photoDraft.url);
    photoDraft.blob = blob;
    photoDraft.url = URL.createObjectURL(blob);
    renderPhotoSheet('preview');
  } catch (e) {
    toast(e.message || 'No se pudo abrir la foto');
    renderPhotoSheet('intro');
  }
}

async function savePhoto() {
  const d = photoDraft;
  if (!d || !d.blob) return;
  const rec = { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), profile, date: Date.now(), angle: d.angle, blob: d.blob };
  if (d.session) { rec.session = d.session; rec.dayId = d.dayId; }
  else if (d.pending) { rec.pending = d.pending; rec.dayId = d.pending; }
  try {
    await PhotoStore.add(rec);
  } catch (e) {
    toast('No se pudo guardar la foto en este móvil');
    return;
  }
  // Pide al navegador que no borre estos datos si le falta espacio
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  URL.revokeObjectURL(d.url);
  d.blob = null; d.url = null;
  d.lastAngle = d.angle;
  renderPhotoSheet('saved');
  refreshAfterPhotoChange();
}

function onPhotoSheetClick(e) {
  if (!photoDraft) return false;
  const ang = e.target.closest('[data-angle]');
  if (ang) {
    photoDraft.angle = ang.dataset.angle;
    $('#sheet').querySelectorAll('[data-angle]').forEach(b => b.setAttribute('aria-checked', b === ang));
    return true;
  }
  const act = e.target.closest('[data-photo]');
  if (!act) return false;
  const a = act.dataset.photo;
  if (a === 'save') savePhoto();
  else if (a === 'retake') renderPhotoSheet('intro');
  else if (a === 'another') {
    const i = ANGLES.findIndex(x => x[0] === photoDraft.lastAngle);
    photoDraft.angle = ANGLES[(i + 1) % ANGLES.length][0];
    renderPhotoSheet('intro');
  } else if (a === 'evo') { closeSheet(); location.hash = '#/galeria'; }
  else if (a === 'done') closeSheet();
  return true;
}

function refreshAfterPhotoChange() {
  const h = location.hash;
  if (h === '#/galeria') loadEvolution();
  else if (h.startsWith('#/dia/')) loadDayPhotos(h.split('/')[2]);
  else if (h.startsWith('#/entreno/')) { const s = db.sessions.find(x => x.date === +h.split('/')[2]); if (s) loadSessionPhotos(s); }
  else decorateHome();
}

/* ===================== FOTOS DENTRO DE CADA ENTRENO ===================== */
let sessPhotos = [];

// Durante el entreno las fotos quedan "pendientes" de ese día hasta que se termina
async function loadDayPhotos(dayId) {
  const box = $('#dayPhotos');
  if (!box) return;
  try { sessPhotos = (await PhotoStore.list(profile)).filter(p => p.pending === dayId); }
  catch (e) { box.innerHTML = '<div class="empty">Este navegador no permite guardar fotos.</div>'; return; }
  if (!sessPhotos.length) {
    box.innerHTML = `<button class="photo-cta" data-addday="${dayId}">${ICON_CAM}Añadir foto</button>`;
    return;
  }
  box.innerHTML = `<div class="thumbs">
    ${sessPhotos.map(p => `
      <button class="thumb" data-view="${p.id}" aria-label="Ver foto de ${angleName(p.angle)}">
        <img src="${photoURL(p)}" alt=""><span class="thumb-date">${angleName(p.angle)}</span>
      </button>`).join('')}
    <button class="thumb add" data-addday="${dayId}">${ICON_CAM}<span>Otra foto</span></button>
  </div>`;
}
async function claimPendingPhotos(dayId, sessionDate) {
  try {
    const ps = (await PhotoStore.list(profile)).filter(p => p.pending === dayId);
    for (const p of ps) { delete p.pending; p.session = sessionDate; p.dayId = dayId; await PhotoStore.add(p); }
    return ps.length;
  } catch (e) { return 0; }
}
async function removePendingPhotos(dayId) {
  try {
    const ps = (await PhotoStore.list(profile)).filter(p => p.pending === dayId);
    for (const p of ps) await PhotoStore.remove(p.id);
  } catch (e) {}
}
async function loadSessionPhotos(s) {
  const box = $('#sessPhotos');
  if (!box) return;
  try { sessPhotos = (await PhotoStore.list(profile)).filter(p => p.session === s.date); }
  catch (e) { box.innerHTML = '<div class="empty">Este navegador no permite guardar fotos.</div>'; return; }
  box.innerHTML = `<div class="thumbs">
    ${sessPhotos.map(p => `
      <button class="thumb" data-view="${p.id}" aria-label="Ver foto de ${angleName(p.angle)}">
        <img src="${photoURL(p)}" alt=""><span class="thumb-date">${angleName(p.angle)}</span>
      </button>`).join('')}
    <button class="thumb add" data-addphoto="${s.date}">${ICON_CAM}<span>Añadir foto</span></button>
  </div>`;
}
function onSessionClick(e) {
  const addDay = e.target.closest('[data-addday]');
  if (addDay) {
    const used = new Set(sessPhotos.map(p => p.angle));
    openPhotoSheet({ after: false, pending: addDay.dataset.addday, angle: (ANGLES.find(a => !used.has(a[0])) || ANGLES[0])[0] });
    return true;
  }
  const add = e.target.closest('[data-addphoto]');
  if (add) {
    const s = db.sessions.find(x => x.date === +add.dataset.addphoto);
    const used = new Set(sessPhotos.map(p => p.angle));
    const next = (ANGLES.find(a => !used.has(a[0])) || ANGLES[0])[0];
    openPhotoSheet({ after: false, session: s.date, dayId: s.dayId, angle: next });
    return true;
  }
  const v = e.target.closest('[data-view]');
  if (v) { openPhotoViewer(sessPhotos.find(p => p.id === v.dataset.view)); return true; }
  return false;
}

// Ver una foto en grande, ir a compararla o borrarla
let viewerPhoto = null;
function openPhotoViewer(p) {
  if (!p) return;
  viewerPhoto = p;
  $('#sheet').innerHTML = `
    <div class="grabber"></div>
    <button class="close-btn" id="closeSheet" aria-label="Cerrar">×</button>
    <h2>${angleName(p.angle)}</h2>
    <img class="viewer-img" src="${photoURL(p)}" alt="Foto de ${angleName(p.angle)}">
    <p class="viewer-meta">${fmtDay(p.date)}</p>
    <div class="sheet-actions">
      <button class="btn-primary" data-pv="compare">Comparar en la galería</button>
      <button class="btn-danger" data-pv="delete">Borrar foto</button>
    </div>`;
  const w = $('#sheetWrap');
  w.classList.add('open');
  w.setAttribute('aria-hidden', 'false');
  $('#sheet').scrollTop = 0;
}
async function onPhotoViewerClick(e) {
  const b = e.target.closest('[data-pv]');
  if (!b || !viewerPhoto) return false;
  const p = viewerPhoto;
  if (b.dataset.pv === 'compare') {
    evo.filter = p.angle; evo.b = p.id; evo.a = null; evo.target = 'a';
    closeSheet();
    location.hash = '#/galeria';
  } else if (b.dataset.pv === 'delete') {
    if (!confirm('¿Borrar esta foto? No se puede deshacer.')) return true;
    try { await PhotoStore.remove(p.id); } catch (err) { toast('No se pudo borrar'); return true; }
    const u = photoURLs.get(p.id);
    if (u) { URL.revokeObjectURL(u); photoURLs.delete(p.id); }
    closeSheet();
    refreshAfterPhotoChange();
  }
  return true;
}

/* ===================== INICIO: TARJETA Y MARCAS ===================== */
function evolutionCardHTML() {
  return `
    <a class="evo-card" href="#/galeria">
      <div class="evo-thumbs" id="evoThumbs"><span class="evo-ph">${ICON_CAM}</span></div>
      <div class="evo-text">
        <div class="evo-title">Galería</div>
        <div class="evo-sub" id="evoSub">Compara tus fotos de progreso</div>
      </div>
      <span class="day-go" aria-hidden="true">›</span>
    </a>`;
}
async function decorateHome() {
  let ps;
  try { ps = await PhotoStore.list(profile); } catch (e) { return; }
  const th = $('#evoThumbs'), sub = $('#evoSub');
  if (th && ps.length) {
    th.innerHTML = ps.slice(-3).reverse().map(p => `<img src="${photoURL(p)}" alt="">`).join('');
    sub.textContent = `${ps.length} ${ps.length === 1 ? 'foto' : 'fotos'} · compara antes y después`;
  } else if (th) {
    sub.textContent = 'Hazte una foto al terminar un entreno';
  }
  const withPhoto = new Set(ps.filter(p => p.session).map(p => String(p.session)));
  document.querySelectorAll('.hist-row[data-session]').forEach(r => {
    if (withPhoto.has(r.dataset.session) && !r.querySelector('.hist-cam')) {
      r.querySelector('.hist-when').insertAdjacentHTML('beforebegin', `<span class="hist-cam" title="Con foto">${ICON_CAM}</span>`);
    }
  });
}

/* ===================== GALERÍA (COMPARACIONES) ===================== */
const evo = { filter: 'frente', a: null, b: null, mode: 'slide', target: 'a', edit: false, photos: [] };

function renderEvolution() {
  releaseWakeLock();
  app.innerHTML = `
    <header class="day-top">
      <a href="#/" class="back" aria-label="Volver">‹</a>
      <div>
        <p class="eyebrow">${profile}</p>
        <h1>Galería</h1>
      </div>
    </header>
    <div id="evoBody"><div class="empty" style="margin-top:20px">Cargando fotos…</div></div>`;
  window.scrollTo(0, 0);
  loadEvolution();
}

async function loadEvolution() {
  try { evo.photos = await PhotoStore.list(profile); }
  catch (e) {
    const b = $('#evoBody');
    if (b) b.innerHTML = '<div class="empty" style="margin-top:20px">Este navegador no permite guardar fotos (¿modo incógnito?).</div>';
    return;
  }
  // Si el ángulo elegido no tiene fotos, salta al que más tenga
  const count = (k) => evo.photos.filter(p => k === 'todas' || p.angle === k).length;
  if (!count(evo.filter) && evo.photos.length) {
    evo.filter = ANGLES.map(a => a[0]).sort((x, y) => count(y) - count(x))[0];
  }
  drawEvolution();
}

function drawEvolution() {
  const body = $('#evoBody');
  if (!body) return;
  const all = evo.photos;
  const list = all.filter(p => evo.filter === 'todas' || p.angle === evo.filter);
  if (!list.some(p => p.id === evo.a)) evo.a = list.length ? list[0].id : null;
  if (!list.some(p => p.id === evo.b)) evo.b = list.length ? list[list.length - 1].id : null;

  if (!all.length) {
    body.innerHTML = `
      <div class="evo-empty">
        <div class="photo-hero">${ICON_CAM}</div>
        <h2>Aún no hay fotos</h2>
        <p>Las fotos van dentro de cada entreno: al terminarlo te pregunta si quieres hacerte una, y también puedes añadirla después desde su ficha en <b>Últimos entrenos</b>. Con dos o más de un mismo ángulo podrás compararlas aquí.</p>
        <p class="evo-note">Las fotos solo se guardan en este móvil.</p>
      </div>`;
    return;
  }

  const chips = [...ANGLES, ['todas', 'Todas']].map(([k, l]) => {
    const n = all.filter(p => k === 'todas' || p.angle === k).length;
    return `<button data-filter="${k}" aria-pressed="${evo.filter === k}">${l}<span>${n}</span></button>`;
  }).join('');

  let A = list.find(p => p.id === evo.a), B = list.find(p => p.id === evo.b);
  if (A && B && A.date > B.date) [A, B] = [B, A];

  let compare = '';
  if (A && B && A.id !== B.id) {
    const days = Math.round((startOfDay(B.date) - startOfDay(A.date)) / DAY_MS);
    const between = db.sessions.filter(s => s.date > A.date && s.date <= B.date + 60000).length;
    const view = evo.mode === 'slide'
      ? `<div class="cmp-slide" style="--pos:50%">
           <img src="${photoURL(B)}" alt="Después">
           <div class="cmp-before"><img src="${photoURL(A)}" alt="Antes"></div>
           <div class="cmp-handle" aria-hidden="true"><span>‹ ›</span></div>
           <span class="cmp-lbl l">Antes · ${fmtDay(A.date)}</span>
           <span class="cmp-lbl r">Después · ${fmtDay(B.date)}</span>
           <input type="range" min="0" max="100" value="50" class="cmp-range" aria-label="Desliza para comparar antes y después">
         </div>`
      : `<div class="cmp-side">
           <figure><img src="${photoURL(A)}" alt="Antes"><figcaption>Antes · ${fmtDay(A.date)}</figcaption></figure>
           <figure><img src="${photoURL(B)}" alt="Después"><figcaption>Después · ${fmtDay(B.date)}</figcaption></figure>
         </div>`;
    compare = `
      <div class="cmp-head">
        <div class="seg" role="tablist">
          <button data-mode="slide" aria-pressed="${evo.mode === 'slide'}">Deslizar</button>
          <button data-mode="side" aria-pressed="${evo.mode === 'side'}">Lado a lado</button>
        </div>
      </div>
      ${view}
      <div class="cmp-stats">
        <div><b>${days}</b><span>${days === 1 ? 'día' : 'días'} entre fotos</span></div>
        <div><b>${between}</b><span>${between === 1 ? 'entreno' : 'entrenos'} entre medias</span></div>
      </div>
      ${sessionLinks(A, B)}`;
  } else if (list.length === 1) {
    compare = `
      <figure class="cmp-single"><img src="${photoURL(list[0])}" alt="Foto de ${angleName(list[0].angle)}"><figcaption>${fmtDay(list[0].date)}</figcaption></figure>
      <p class="evo-hint">Con una segunda foto de ${angleName(evo.filter).toLowerCase()} podrás comparar el antes y el después.</p>`;
  } else if (!list.length) {
    compare = `<div class="empty">No hay fotos de ${angleName(evo.filter).toLowerCase()} todavía.</div>`;
  }

  const grid = list.slice().reverse().map(p => {
    const tag = p.id === evo.a ? 'A' : p.id === evo.b ? 'B' : '';
    const isBefore = tag && A && p.id === A.id;
    return `
      <button class="thumb ${tag ? 'sel' : ''}" data-pid="${p.id}" aria-label="Foto del ${fmtDay(p.date)}">
        <img src="${photoURL(p)}" alt="" loading="lazy">
        <span class="thumb-date">${fmtDay(p.date)}${evo.filter === 'todas' ? ' · ' + angleName(p.angle) : ''}</span>
        ${tag ? `<span class="thumb-tag">${isBefore ? 'Antes' : 'Después'}</span>` : ''}
        ${evo.edit ? `<span class="thumb-del" data-del="${p.id}" role="button" aria-label="Borrar foto">×</span>` : ''}
      </button>`;
  }).join('');

  body.innerHTML = `
    <div class="filter-chips">${chips}</div>
    ${compare}
    <div class="grid-head">
      <h2 class="section-title" style="margin:0">Todas las fotos</h2>
      <button class="btn-link" data-evo="edit">${evo.edit ? 'Hecho' : 'Editar'}</button>
    </div>
    ${list.length >= 2 && !evo.edit ? `
      <div class="pick-target">
        <span>Toca una foto para elegir</span>
        <div class="seg small">
          <button data-target="a" aria-pressed="${evo.target === 'a'}">Antes</button>
          <button data-target="b" aria-pressed="${evo.target === 'b'}">Después</button>
        </div>
      </div>` : ''}
    <div class="thumbs">${grid}</div>
    <div class="evo-foot"><p class="evo-note">Las fotos se añaden desde cada entreno. Solo se guardan en este móvil: si borras los datos del navegador, se pierden.</p></div>`;
}

function sessionLinks(A, B) {
  const link = (p, lbl) => {
    const s = p.session && db.sessions.find(x => x.date === p.session);
    if (!s) return '<span></span>';
    const d = DAYS.find(x => x.id === s.dayId) || DAYS[0];
    return `<a href="#/entreno/${s.date}">${lbl} ›<span>Día ${d.num} · ${d.name}</span></a>`;
  };
  if (!A.session && !B.session) return '';
  return `<div class="cmp-links">${link(A, 'Entreno de antes')}${link(B, 'Entreno de después')}</div>`;
}

async function onEvolutionClick(e) {
  const t = e.target;
  const del = t.closest('[data-del]');
  if (del) {
    if (!confirm('¿Borrar esta foto? No se puede deshacer.')) return true;
    try { await PhotoStore.remove(del.dataset.del); } catch (err) { toast('No se pudo borrar'); return true; }
    const u = photoURLs.get(del.dataset.del);
    if (u) { URL.revokeObjectURL(u); photoURLs.delete(del.dataset.del); }
    loadEvolution();
    return true;
  }
  const f = t.closest('[data-filter]');
  if (f) { evo.filter = f.dataset.filter; evo.a = evo.b = null; drawEvolution(); return true; }
  const m = t.closest('[data-mode]');
  if (m) { evo.mode = m.dataset.mode; drawEvolution(); return true; }
  const tg = t.closest('[data-target]');
  if (tg) { evo.target = tg.dataset.target; drawEvolution(); return true; }
  const th = t.closest('[data-pid]');
  if (th && !evo.edit) {
    evo[evo.target] = th.dataset.pid;
    evo.target = evo.target === 'a' ? 'b' : 'a';
    drawEvolution();
    const c = $('.cmp-slide, .cmp-side, .cmp-single');
    if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }
  const act = t.closest('[data-evo]');
  if (act) {
    if (act.dataset.evo === 'edit') { evo.edit = !evo.edit; drawEvolution(); }
    return true;
  }
  return false;
}

const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.2A1.5 1.5 0 0 1 9.8 5h4.4a1.5 1.5 0 0 1 1.2.6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
