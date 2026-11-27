// Boot aplikasi: penyimpanan, lisensi, kunci PIN, router satu-tugas-satu-layar, scanner USB global, autosave.

import { Qmas } from './store.js';
import { adapterIDB, mintaPenyimpananPermanen } from './db.js';
import { periksa } from './license.js';
import { pasangScannerUSB, bip } from './scanner.js';
import { buatQmas, namaBerkas, catatCadangan } from './backup.js';
import { perluCadangan, dukungFolder, pilihFolder, izinFolder, tulisKeFolder } from './autosave.js';
import * as nat from './native.js';
import { h, tombol, dialog, gagal, berhasil } from './ui/dom.js';
import { ikon } from './ui/ikon.js';
import * as utama from './ui/layar-utama.js';
import * as stok from './ui/layar-stok.js';
import * as tutupBuku from './ui/layar-tutup.js';
import * as data from './ui/layar-data.js';

const adapter = adapterIDB();
const state = { lisensi: { penuh: false, pesan: '' }, terkunci: true, sibuk: 0, perubahan: null, perluIzinFolder: false, izinPermanen: true, tutup: null };

// Catat waktu perubahan data (untuk jadwal "setiap ada perubahan").
const tulisAsli = adapter.tulis.bind(adapter);
adapter.tulis = async (ops) => {
  await tulisAsli(ops);
  if (ops.some((o) => o.tabel !== 'lokal')) {
    state.perubahan = new Date();
    if (nat.ada()) nat.jadwalSnapshot(q); // APK: snapshot terbaru untuk cadangan native saat aplikasi tertutup
  }
};

const q = new Qmas(adapter, { penuh: () => state.lisensi.penuh });
const root = document.getElementById('app');

const RUTE = {
  '': utama.beranda, tutup: tutupBuku.tutup, 'hasil-tutup': tutupBuku.hasilTutup, tambah: utama.tambah, label: utama.label, 'riwayat-tambah': utama.riwayatTambah,
  stok: stok.stok, hari: stok.hari, barang: stok.barang, riwayat: stok.riwayat, cek: stok.cek, hasil: stok.hasil,
  cadang: data.cadang, pindah: data.pindah, pengaturan: data.pengaturan,
};

const ctx = {
  q,
  get lisensi() { return state.lisensi; },
  get perluIzinFolder() { return state.perluIzinFolder; },
  get izinPermanen() { return state.izinPermanen; },
  saatScan: null,
  saatTutup: null,
  labelBaru: null,
  nav(path) { if (location.hash === '#' + path) render(); else location.hash = '#' + path; },
  segarkan() { render(); },
  sibuk(b) { state.sibuk = Math.max(0, state.sibuk + (b ? 1 : -1)); },
  catatPerubahan() { state.perubahan = new Date(); },
  terapkanHuruf(v) { document.documentElement.dataset.huruf = v; },
  /** Mode siang/malam: atribut di <html> dipakai CSS; warna bilah browser HP ikut berganti. */
  terapkanTema(v) {
    const t = v === 'malam' ? 'malam' : 'siang';
    document.documentElement.dataset.tema = t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'malam' ? '#14130f' : '#075c24');
  },
  async muatUlangPengaturan() { await muatLisensi(); const p0 = await q.pengaturan(); ctx.terapkanHuruf(p0.ukuranHuruf); ctx.terapkanTema(p0.tema); await ctx.sinkronAutosave(); },
  /** APK: kirim pengaturan cadangan otomatis ke penjadwal native. */
  async sinkronAutosave() {
    if (!nat.ada()) return;
    try { await nat.atur((await q.pengaturan()).autosave); } catch (e) { console.warn('Atur jadwal native gagal', e); }
  },
  beriIzinFolder, pilihFolderAutosave,
};

async function muatLisensi() {
  state.lisensi = await periksa((await q.pengaturan()).lisensi);
}

// ---------- router ----------
let nomorRender = 0;
async function render() {
  const n = ++nomorRender;
  ctx.saatTutup?.();
  ctx.saatScan = null; ctx.saatTutup = null;
  const kotakUmpan = document.getElementById('umpan');
  if (!kotakUmpan.dataset.undo) kotakUmpan.className = 'umpan sembunyi'; // pesan "Batalkan 10 detik" tetap tampil
  const [, rute = '', param = ''] = (location.hash.slice(1) || '/').split('/');
  if (rute === 'cek' && !param) { location.replace('#/tutup'); return; } // tautan lama Cek Stok Fisik
  const fn = RUTE[rute] || utama.beranda;
  let hasil;
  try { hasil = await fn(ctx, param); } catch (e) { hasil = { judul: 'Terjadi masalah', node: h('div', { class: 'pesan merah' }, `Layar gagal dimuat: ${e.message}`), bantuan: [] }; }
  if (n !== nomorRender) return;
  const beranda = !rute;
  root.replaceChildren(
    h('header', { class: 'bar' }, h('h1', { class: 'judul' }, hasil.merek ? h('span', { class: 'merek' }, ikon('merek', 26)) : null, hasil.judul), hasil.subjudul ? h('p', { class: 'subjudul' }, hasil.subjudul) : null),
    hasil.node);
  bantuanLayar = hasil.bantuan || [];
  tampilNav(true, beranda);
  window.scrollTo(0, 0);
}

// ---------- navigasi dasar layar: Kembali, Beranda, Bantuan (selalu di tempat yang sama) ----------
let bantuanLayar = [];
const navEl = document.getElementById('nav');
function navTombol(nama, label, ikonNama, onclick, kelas = '') {
  return h('button', { type: 'button', class: `navbtn ${kelas}`.trim(), 'data-nav': nama, onclick, 'aria-label': label }, ikon(ikonNama, 26), label);
}
navEl.append(h('div', { class: 'isi' },
  navTombol('kembali', 'Kembali', 'kembali', () => (history.length > 1 ? history.back() : ctx.nav('/'))),
  navTombol('beranda', 'Beranda', 'beranda', () => ctx.nav('/'), 'beranda'),
  navTombol('bantuan', 'Bantuan', 'bantuan', () => bantuan(bantuanLayar))));
function tampilNav(tampil, diBeranda = false) {
  navEl.hidden = !tampil;
  for (const n of ['kembali', 'beranda']) navEl.querySelector(`[data-nav=${n}]`).setAttribute('aria-disabled', String(diBeranda));
}

function bantuan(baris) {
  dialog((tutup) => h('div', { class: 'layar', style: 'animation:none;padding-top:0' }, h('p', { class: 'kalimat' }, 'Petunjuk'),
    h('ol', { style: 'margin:0;padding-left:1.3rem;display:flex;flex-direction:column;gap:8px' }, (baris || []).map((b) => h('li', null, b))), tombol('Mengerti', tutup, 'utama')));
}

window.addEventListener('hashchange', () => { if (!state.terkunci) render(); });

// ---------- scanner USB: bekerja di semua layar ----------
pasangScannerUSB((kode) => {
  if (state.terkunci) return;
  if (ctx.saatScan) ctx.saatScan(kode);
  else ctx.nav('/barang/' + encodeURIComponent(kode));
});

// ---------- kunci layar ----------
// Layar baru terkunci bila aplikasi tersembunyi lebih dari 30 menit. Selama HP atau aplikasi belum ditutup
// dan jedanya kurang dari itu, PIN tidak diminta lagi. Aplikasi yang ditutup penuh selalu minta PIN saat dibuka.
const JEDA_KUNCI_MS = 30 * 60 * 1000;
let waktuTersembunyi = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    waktuTersembunyi = Date.now();
    // APK: pastikan snapshot terbaru tertulis sebelum aplikasi dibekukan/ditutup
    if (nat.ada() && !state.terkunci) nat.flush(q).then(() => (state.perubahan ? nat.tandaiPerubahan() : null)).catch(() => {});
    return;
  }
  if (!state.terkunci && !state.sibuk && waktuTersembunyi && Date.now() - waktuTersembunyi > JEDA_KUNCI_MS) kunciLayar();
});

async function kunciLayar() {
  state.terkunci = true;
  tampilNav(false);
  document.getElementById('lapis').className = 'lapis sembunyi';
  await data.layarKunci(ctx, { setelah: () => { state.terkunci = false; render(); } });
}

// ---------- folder & autosave ----------
async function pilihFolderAutosave() {
  if (!dukungFolder()) return gagal('Browser ini tidak bisa memilih folder.');
  try {
    ctx.sibuk(true);
    const handle = await pilihFolder();
    await adapter.tulis([{ op: 'put', tabel: 'lokal', nilai: { k: 'folder', handle } }]);
    const p = await q.pengaturan();
    await q.ubahPengaturan({ autosave: { ...p.autosave, namaLokasi: handle.name } });
    state.perluIzinFolder = false;
    berhasil(`Folder cadangan: ${handle.name}`);
  } catch (e) { if (e.name !== 'AbortError') gagal(e.message); } finally { ctx.sibuk(false); }
}

async function beriIzinFolder() {
  const rec = await adapter.get('lokal', 'folder');
  if (!rec) return pilihFolderAutosave().then(() => { state.perluIzinFolder = false; render(); });
  ctx.sibuk(true);
  try { state.perluIzinFolder = !(await izinFolder(rec.handle, true)); } finally { ctx.sibuk(false); }
  if (!state.perluIzinFolder) { await jalankanAutosave(); }
  render();
}

/** APK: saat aplikasi dibuka, selaraskan jadwal native dan ambil waktu cadangan yang dibuat saat aplikasi tertutup. */
async function sinkronNative() {
  if (!nat.ada()) return;
  try {
    await nat.simpanSnapshot(q);
    await ctx.sinkronAutosave();
    const s = await nat.status();
    const p = await q.pengaturan();
    const lama = p.cadanganTerakhir ? Date.parse(p.cadanganTerakhir) : 0;
    if (s.terakhirMs && s.terakhirMs > lama) {
      await catatCadangan(q, new Date(s.terakhirMs));
      state.perubahan = null; // jangan memicu cadangan baru hanya karena penanda waktu berubah
    }
  } catch (e) { console.warn('Sinkron native gagal', e); }
}

let sedangAutosave = false;
async function jalankanAutosave() {
  if (state.terkunci || sedangAutosave) return;
  sedangAutosave = true;
  try {
    const p = await q.pengaturan();
    const terakhir = p.cadanganTerakhir ? new Date(p.cadanganTerakhir) : null;
    if (!(await q.barangSemua()).length) return;
    if (!perluCadangan(p.autosave, terakhir, q.sekarang(), state.perubahan)) return;
    const sekarang = new Date();
    let waktuCadangan = sekarang;
    if (nat.ada()) {
      await nat.flush(q); // snapshot terbaru, lalu salin ke Documents/Q-mas lewat native
      const r = await nat.cadangkanSekarang();
      if (r.terakhirMs) waktuCadangan = new Date(r.terakhirMs);
    } else if (dukungFolder()) {
      const rec = await adapter.get('lokal', 'folder');
      if (!rec || !(await izinFolder(rec.handle))) {
        if (!state.perluIzinFolder) { state.perluIzinFolder = true; if (!location.hash || location.hash === '#/') render(); }
        return;
      }
      const { bytes } = await buatQmas(q, sekarang);
      await tulisKeFolder(rec.handle, namaBerkas(sekarang), bytes, p.autosave.salinan);
    } else return;
    await catatCadangan(q, waktuCadangan);
    state.perubahan = null;
    state.perluIzinFolder = false;
    if (!location.hash || location.hash === '#/') render();
  } catch (e) {
    console.warn('Autosave gagal', e);
  } finally { sedangAutosave = false; }
}

// ---------- mulai ----------
async function mulai() {
  state.terkunci = false;
  await muatLisensi();
  const p1 = await q.pengaturan();
  ctx.terapkanHuruf(p1.ukuranHuruf);
  ctx.terapkanTema(p1.tema);
  render();
  await sinkronNative();
  jalankanAutosave();
  setInterval(jalankanAutosave, 30000);
}

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  state.izinPermanen = await mintaPenyimpananPermanen();
  await muatLisensi();
  const p2 = await q.pengaturan();
  const huruf = p2.ukuranHuruf;
  ctx.terapkanHuruf(huruf);
  ctx.terapkanTema(p2.tema); // sebelum layar PIN tampil
  const intro = await adapter.get('lokal', 'intro');
  const lanjut = async () => {
    if (!intro) {
      await adapter.tulis([{ op: 'put', tabel: 'lokal', nilai: { k: 'intro', selesai: true } }]);
    }
    mulai();
  };
  await data.layarKunci(ctx, {
    setelah: () => { if (!intro) data.layarPengantar(ctx, { setelah: lanjut }); else mulai(); },
  });
}

boot().catch((e) => { root.replaceChildren(h('div', { class: 'pesan merah' }, 'Q-mas tidak bisa dimulai: ' + e.message)); });
void bip;
