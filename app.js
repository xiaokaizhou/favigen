// Favigen — 100% client-side favicon generator. No upload, no backend.
const SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 512];
const $ = (id) => document.getElementById(id);

const state = { img: null, blobUrl: null };

// ---- file handling ----
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f); });
$('pick').addEventListener('click', () => $('file').click());
const drop = $('drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

function loadFile(file) {
  if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
  state.blobUrl = URL.createObjectURL(file);
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  const el = isSvg ? new Image() : new Image();
  el.onload = () => { state.img = el; render(); };
  el.onerror = () => alert('Could not load that image.');
  el.src = state.blobUrl;
}

// ---- render pipeline ----
function drawAt(size) {
  const img = state.img;
  const padPct = +$('pad').value / 100;
  const roundPct = +$('round').value / 100;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const transparent = $('bgTransparent').checked;
  if (!transparent) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, size, size, size * roundPct * 0.5);
    ctx.fill();
  }
  const inner = size * (1 - padPct * 2);
  const off = (size - inner) / 2;
  roundRect(ctx, off, off, inner, inner, inner * roundPct * 0.5);
  ctx.save();
  ctx.clip();
  ctx.drawImage(img, off, off, inner, inner);
  ctx.restore();
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render() {
  if (!state.img) return;
  $('controls').hidden = false;
  $('preview').hidden = false;
  const sizesEl = $('sizes'); sizesEl.innerHTML = '';
  const prev = $('prevGrid'); prev.innerHTML = '';
  for (const s of SIZES) {
    const c = drawAt(s);
    const cell = document.createElement('div'); cell.className = 'size';
    const shown = Math.min(64, s);
    const disp = document.createElement('canvas'); disp.width = disp.height = shown;
    disp.getContext('2d').drawImage(c, 0, 0, shown, shown);
    cell.appendChild(disp);
    const lbl = document.createElement('span'); lbl.textContent = s + 'px'; cell.appendChild(lbl);
    sizesEl.appendChild(cell);
    // preview at a couple sizes
    if ([16, 32, 64, 180, 512].includes(s)) {
      const pi = document.createElement('div'); pi.className = 'prev-item';
      const pc = document.createElement('canvas'); pc.width = pc.height = s; pc.getContext('2d').drawImage(c, 0, 0, s, s);
      pi.appendChild(pc); const pl = document.createElement('span'); pl.textContent = s + 'px'; pi.appendChild(pl);
      prev.appendChild(pi);
    }
    // stash for download
    c._png = c.toDataURL('image/png');
    c._size = s;
    c._blob = null;
  }
  // cache blobs lazily
  window.__canvases = SIZES.map(s => null);
  document.querySelectorAll('#sizes .size').forEach(() => {});
  // attach to a map
  window.__rendered = SIZES.map(s => drawAt(s));
  $('dlZip').disabled = false; $('dlIco').disabled = false; $('dlApple').disabled = false;
}

['bgTransparent','pad','round'].forEach(id => $(id).addEventListener('input', () => {
  $('padVal').textContent = $('pad').value + '%';
  $('roundVal').textContent = $('round').value + '%';
  render();
}));

$('reset').addEventListener('click', () => { state.img = null; if (state.blobUrl) URL.revokeObjectURL(state.blobUrl); state.blobUrl = null; $('controls').hidden = true; $('preview').hidden = true; $('file').value = ''; });

// ---- encoding helpers ----
async function canvasToBlob(c) { return await new Promise(r => c.toBlob(r, 'image/png')); }

async function downloadZip() {
  const canvases = window.__rendered;
  const files = [];
  for (const c of canvases) files.push({ name: `favicon-${c._size}.png`, blob: await canvasToBlob(c) });
  const zip = await buildZip(files);
  triggerDownload(new Blob([zip], { type: 'application/zip' }), 'favigen-favicons.zip');
}

$('dlZip').addEventListener('click', downloadZip);
$('dlIco').addEventListener('click', async () => {
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const canvases = icoSizes.map(s => drawAt(s));
  const bufs = [];
  for (const c of canvases) bufs.push({ w: c._size, h: c._size, png: await canvasToPngBytes(c) });
  const ico = buildIco(bufs);
  triggerDownload(new Blob([ico], { type: 'image/x-icon' }), 'favicon.ico');
});
$('dlApple').addEventListener('click', async () => {
  const c = drawAt(180);
  triggerDownload(await canvasToBlob(c), 'apple-touch-icon.png');
});

async function canvasToPngBytes(c) {
  const b = await canvasToBlob(c);
  return new Uint8Array(await b.arrayBuffer());
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---- minimal PNG->ZIP (store, no compression) encoder ----
// Builds a valid ZIP using stored (uncompressed) entries. PNGs are already
// deflate-compressed so store is fine and keeps this dependency-free.
async function buildZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u32 = (n) => [n & 255, (n>>8)&255, (n>>16)&255, (n>>24)&255];
  const u16 = (n) => [n & 255, (n>>8)&255];
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const crc = crc32(data);
    const local = [
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      name, data
    ];
    const start = offset;
    chunks.push(concat(local)); offset += chunks[chunks.length-1].length;
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(start), name
    ]));
  }
  const cdStart = offset;
  const cd = concat(central);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(cdStart), u16(0)
  ]);
  return concat([...chunks, cd, end]);
}
function concat(arrs) {
  let len = 0; for (const a of arrs) len += a.length;
  const out = new Uint8Array(len); let p = 0;
  for (const a of arrs) { out.set(a, p); p += a.length; }
  return out;
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

// ---- minimal ICO encoder (PNG payloads) ----
function buildIco(entries) {
  // header + dir entries + image data (PNG wrapped)
  const header = concat([[0,0,1,0, u16(entries.length)]].map(x=>x)); // 6 bytes: reserved, type, count
  const dir = [];
  const data = [];
  let off = 6 + entries.length * 16;
  for (const e of entries) {
    const bw = e.w >= 256 ? 0 : e.w;
    const bh = e.h >= 256 ? 0 : e.h;
    dir.push(concat([[bw, bh, 0, 0, 1, 32, u32(e.png.length), u32(off)].map(x=>x)]));
    data.push(e.png); off += e.png.length;
  }
  return concat([header, concat(dir), concat(data)]);
}

// keep worker happy
export {};
