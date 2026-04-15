// ============ VibeCon Builder Cards ============
// Live-preview split UI. Card data lives in URL hash — zero-delay QR scanning.

// ---------- Supabase ----------
const _sb = window.supabase.createClient(
  "https://fuumjemjsdruyswnloxb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1dW1qZW1qc2RydXlzd25sb3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDE0NTQsImV4cCI6MjA4NDQxNzQ1NH0.FLenY_66EYMJIIJp9WQRyihWUwy8YY9aN1Kw06dQs1Y"
);
async function uploadAvatarToStorage(dataUrl) {
  const blob = await fetch(dataUrl).then(r => r.blob());
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { data, error } = await _sb.storage.from("avatars").upload(filename, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return _sb.storage.from("avatars").getPublicUrl(data.path).data.publicUrl;
}

const FIELDS = ["name", "building", "pitch", "twitter", "linkedin", "avatar"];
const avatarFallback = (seed) =>
  `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(seed || "vibecon")}`;

let uploadedPhoto = null;
let thumbPhoto = null;
const AVATAR_LS = (name) => "vibecon_avatar_" + (name || "default").toLowerCase();
const STORAGE_KEY = "vibecon_collection_v1";
const SELF_KEY = "vibecon_self_v1";

// ---------- URL-safe base64 ----------
function encodeCard(data) {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeCard(str) {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { return null; }
}

// ---------- Card ID from name ----------
function cardIdFor(name) {
  const s = (name || "vibecon").toLowerCase();
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return "#VC-" + String(Math.abs(h) % 9000 + 1000);
}

// ---------- Collection storage ----------
function getCollection() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function addToCollection(card) {
  const list = getCollection();
  const key = (card.name || "") + "|" + (card.building || "");
  if (list.some(c => (c.name || "") + "|" + (c.building || "") === key)) return false;
  list.push({ ...card, addedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return true;
}
function removeFromCollection(name, building) {
  const list = getCollection().filter(c =>
    !((c.name || "") === (name || "") && (c.building || "") === (building || ""))
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ---------- Toast ----------
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

// ---------- Mount ----------
const app = document.getElementById("app");
function mount(id) {
  const tpl = document.getElementById(id);
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));
}
function setTabs(active) {
  document.querySelectorAll(".tabs a").forEach(a => {
    a.classList.toggle("active", a.dataset.tab === active);
  });
}

// ---------- Live update ----------
const DEFAULTS = {
  name: "Your name",
  building: "Your project",
  pitch: '"your one-line pitch goes here"',
  twitter: "@handle",
  linkedin: "linkedin",
};

function updateCard(data) {
  app.querySelector(".card-id").textContent = cardIdFor(data.name);
  FIELDS.forEach(f => {
    const raw = (data[f] || "").toString().trim();
    app.querySelectorAll(`[data-field="${f}"]`).forEach(el => {
      if (f === "pitch") el.textContent = raw ? `"${raw}"` : DEFAULTS.pitch;
      else el.textContent = raw || DEFAULTS[f];
    });
  });
  const av = app.querySelector("#card-avatar");
  if (av) {
    const saved = localStorage.getItem(AVATAR_LS(data.name));
    if (uploadedPhoto) { av.src = uploadedPhoto; av.style.imageRendering = ""; }
    else if (saved) { av.src = saved; av.style.imageRendering = ""; }
    else if (data.avatar && data.avatar.startsWith("px:")) { av.src = decodePixelThumb(data.avatar); av.style.imageRendering = "pixelated"; }
    else if (data.avatar) { av.src = data.avatar; av.style.imageRendering = ""; }
    else { av.src = avatarFallback(data.name || "vibecon"); av.style.imageRendering = ""; }
  }

  const qrEl = document.getElementById("qr");
  if (!qrEl) return;
  const url = location.origin + location.pathname + "#c=" + encodeCard(data);
  try {
    new QRious({
      element: qrEl,
      value: url,
      size: 400,
      level: "M",
      background: "#ffffff",
      foreground: "#0a0a14",
      padding: 10,
    });
  } catch (e) {
    console.error("QR render failed", e);
  }
  qrEl.style.width = "200px";
  qrEl.style.height = "200px";
}

function readForm() {
  const form = document.getElementById("card-form");
  const fd = new FormData(form);
  const data = {};
  FIELDS.forEach(f => { data[f] = (fd.get(f) || "").toString(); });
  data.avatar = thumbPhoto || "";
  return data;
}

// ---------- Views ----------
function renderCreate(prefill) {
  mount("view-create");
  setTabs("create");

  const form = document.getElementById("card-form");
  if (prefill) {
    FIELDS.forEach(f => {
      const el = form.elements.namedItem(f);
      if (el && prefill[f] != null) el.value = prefill[f];
    });
  }

  const refresh = () => updateCard(readForm());
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);

  // Photo upload
  buildPhotoUpload(refresh);
  const savedAv = localStorage.getItem(AVATAR_LS((prefill && prefill.name) || readForm().name));
  if (savedAv) {
    uploadedPhoto = savedAv;
    // restore px: pixel thumbs or real Supabase URLs
    if (prefill && prefill.avatar && (prefill.avatar.startsWith("px:") || prefill.avatar.startsWith("http"))) thumbPhoto = prefill.avatar;
  } else if (prefill && prefill.avatar && (prefill.avatar.startsWith("px:") || prefill.avatar.startsWith("http"))) {
    thumbPhoto = prefill.avatar;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.name.trim()) { toast("Add your name first"); return; }
    addToCollection(data);
    // mark this as the user's own card so scanning it doesn't re-add it
    localStorage.setItem(SELF_KEY, (data.name || "") + "|" + (data.building || ""));
    history.replaceState(null, "", "#c=" + encodeCard(data));
    updateCard(data);
    toast("Card saved. Share away ↗");
  });

  document.getElementById("btn-copy").addEventListener("click", async () => {
    const d = readForm();
    const link = location.origin + location.pathname + "#c=" + encodeCard(d);
    const text =
      `${d.name || "Builder"} — ${d.building || ""}\n` +
      `"${d.pitch || ""}"\n` +
      (d.twitter ? `Twitter: ${d.twitter}\n` : "") +
      (d.linkedin ? `LinkedIn: ${d.linkedin}\n` : "") +
      link;
    try { await navigator.clipboard.writeText(text); toast("Card info copied"); }
    catch { prompt("Copy:", text); }
  });

  document.getElementById("btn-download").addEventListener("click", async () => {
    const card = document.getElementById("card");
    const canvas = await html2canvas(card, { backgroundColor: "#0a0a14", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = "vibecon-card.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  document.getElementById("btn-view").addEventListener("click", () => {
    location.hash = "collection";
  });

  refresh();
}

function renderCardOnly(data) {
  document.body.classList.add("card-only-mode");
  mount("view-cardonly");
  updateCard(data);

  document.getElementById("btn-download").addEventListener("click", async () => {
    const card = document.getElementById("card");
    const canvas = await html2canvas(card, { backgroundColor: "#0a0a14", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = (data.name || "vibecon-card").replace(/\s+/g, "-").toLowerCase() + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

// ---------- Photo upload ----------
function buildPhotoUpload(refresh) {
  const slot = document.getElementById("upload-slot");
  const fileInput = document.getElementById("photo-input");

  const renderSlot = () => {
    if (uploadedPhoto) {
      slot.innerHTML = `<img src="${uploadedPhoto}" alt="" /><button type="button" class="photo-remove" aria-label="Remove photo">×</button>`;
      slot.querySelector(".photo-remove").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadedPhoto = null;
        thumbPhoto = null;
        const name = readForm().name || "default";
        localStorage.removeItem(AVATAR_LS(name));
        fileInput.value = "";
        renderSlot();
        refresh();
      });
    } else {
      slot.innerHTML = `
        <div class="upload-placeholder">
          <div class="big">📷</div>
          <div>tap to upload your photo</div>
        </div>`;
    }
  };

  renderSlot();

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      uploadedPhoto = await resizeImage(file, 512);
      thumbPhoto = null; // will be set after upload
      const name = readForm().name || "default";
      localStorage.setItem(AVATAR_LS(name), uploadedPhoto);
      renderSlot();
      refresh();
      // Upload to Supabase storage — gives a real URL for the QR
      thumbPhoto = await uploadAvatarToStorage(uploadedPhoto);
      refresh();
    } catch (err) {
      console.error("Avatar upload failed:", err);
      thumbPhoto = null;
      refresh();
    }
  });
}

function makePixelThumb(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const S = 16;
      const cv = document.createElement("canvas");
      cv.width = S; cv.height = S;
      cv.getContext("2d").drawImage(img, 0, 0, S, S);
      const d = cv.getContext("2d").getImageData(0, 0, S, S).data;
      let bits = "";
      for (let i = 0; i < d.length; i += 4) {
        const r = Math.min(3, Math.round(d[i] / 85));
        const g = Math.min(3, Math.round(d[i+1] / 85));
        const b = Math.min(3, Math.round(d[i+2] / 85));
        bits += r.toString(2).padStart(2,'0') + g.toString(2).padStart(2,'0') + b.toString(2).padStart(2,'0');
      }
      const bytes = [];
      for (let i = 0; i < bits.length; i += 8)
        bytes.push(parseInt(bits.substr(i, 8).padEnd(8,'0'), 2));
      resolve("px:" + btoa(String.fromCharCode(...bytes)));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function decodePixelThumb(data) {
  const b64 = data.slice(3);
  const raw = atob(b64);
  let bits = "";
  for (let i = 0; i < raw.length; i++)
    bits += raw.charCodeAt(i).toString(2).padStart(8,'0');
  const S = 16;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  const id = ctx.createImageData(S, S);
  for (let p = 0; p < S * S; p++) {
    const off = p * 6;
    const r = parseInt(bits.substr(off,   2), 2) * 85;
    const g = parseInt(bits.substr(off+2, 2), 2) * 85;
    const b = parseInt(bits.substr(off+4, 2), 2) * 85;
    id.data[p*4]   = r;
    id.data[p*4+1] = g;
    id.data[p*4+2] = b;
    id.data[p*4+3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return cv.toDataURL("image/png");
}

function resizeImage(file, maxDim, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
      else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function renderCollection() {
  mount("view-collection");
  setTabs("collection");
  const list = getCollection();
  const grid = document.getElementById("collection-grid");
  const empty = document.getElementById("collection-empty");
  if (!list.length) { empty.hidden = false; return; }
  list.sort((a, b) => b.addedAt - a.addedAt).forEach(c => {
    const el = document.createElement("div");
    el.className = "mini";
    el.innerHTML = `<button class="remove" title="Remove">×</button><h3></h3><div class="p"></div><div class="m"></div>`;
    el.querySelector("h3").textContent = c.name || "Unknown";
    el.querySelector(".p").textContent = c.building || "";
    el.querySelector(".m").textContent = "met " + new Date(c.addedAt).toLocaleDateString();
    el.addEventListener("click", (e) => {
      if (e.target.closest(".remove")) return;
      location.hash = "c=" + encodeCard(c);
    });
    el.querySelector(".remove").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`Remove ${c.name || "this card"} from your collection?`)) return;
      removeFromCollection(c.name, c.building);
      el.remove();
      if (!getCollection().length) empty.hidden = false;
      toast("Removed");
    });
    grid.appendChild(el);
  });
}

// ---------- Router ----------
function route() {
  document.body.classList.remove("card-only-mode");
  const h = location.hash.slice(1);
  if (h.startsWith("c=")) {
    const data = decodeCard(h.slice(2));
    if (!data) { renderCreate(); return; }
    const selfKey = localStorage.getItem(SELF_KEY);
    const key = (data.name || "") + "|" + (data.building || "");
    if (selfKey === key) {
      // It's the user's own card — show full create view so they can edit/share.
      renderCreate(data);
    } else {
      // Inbound scan — show ONLY the card.
      renderCardOnly(data);
      setTimeout(() => {
        if (addToCollection(data)) {
          toast("Added " + (data.name || "builder") + " to your collection");
        }
      }, 500);
    }
  } else if (h === "collection") {
    renderCollection();
  } else {
    renderCreate();
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
