// Pembantu antarmuka: pembuat elemen, umpan balik besar (Berhasil/Gagal + bunyi + getar),
// konfirmasi kalimat penuh, dan papan angka besar.

import { bip } from '../scanner.js';
import { ikon } from './ikon.js';

// Bawaan DOM: append(null) menulis teks "null" di layar. Lindungi seluruh aplikasi sekali di sini:
// nilai kosong (null, undefined, false) dibuang, sehingga `kondisi ? elemen : null` aman dipakai di mana saja.
for (const metode of ['append', 'prepend', 'replaceChildren']) {
  const asli = Element.prototype[metode];
  Element.prototype[metode] = function (...anak) { return asli.apply(this, anak.filter((a) => a != null && a !== false)); };
}

export function h(tag, attrs, ...anak) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const a of anak.flat(Infinity)) {
    if (a == null || a === false) continue;
    el.append(a.nodeType ? a : document.createTextNode(String(a)));
  }
  return el;
}

export const tombol = (teks, onclick, kelas = '', attrs = {}) =>
  h('button', { type: 'button', class: `btn ${kelas}`.trim(), onclick, ...attrs }, teks);

export const utama = (teks, onclick, attrs) => tombol(teks, onclick, 'utama', attrs);

// ---------- umpan balik ----------
let tutupToast;
/**
 * Pesan besar yang tidak hilang sendiri sebelum sempat terbaca.
 * Bila `batalkan` diberikan, tombol Batalkan tampil 10 detik.
 */
export function umpan(jenis, teks, { batalkan = null, detik = 10 } = {}) {
  tutupToast?.();
  const kotak = document.getElementById('umpan');
  kotak.replaceChildren();
  kotak.className = `umpan ${jenis}`;
  kotak.dataset.undo = batalkan ? '1' : ''; // pesan dengan tombol Batalkan bertahan walau pindah layar (hanya 10 detik)
  kotak.setAttribute('role', jenis === 'gagal' ? 'alert' : 'status');
  bip(jenis === 'ok' ? 'ok' : 'asing');
  const isi = [h('div', { class: 'judulumpan' }, ikon(jenis === 'ok' ? 'centang' : 'awas', 26), jenis === 'ok' ? 'Berhasil' : 'Gagal'), h('span', null, teks)];
  const aksi = [];
  let waktu;
  const tutup = () => { clearInterval(waktu); kotak.className = 'umpan sembunyi'; kotak.dataset.undo = ''; kotak.replaceChildren(); tutupToast = null; };
  tutupToast = tutup;
  if (batalkan) {
    const sisa = h('span', { class: 'sisa' }, `${detik}`);
    const b = tombol(['Batalkan ', sisa], async () => { tutup(); await batalkan(); }, 'bahaya');
    aksi.push(b);
    let n = detik;
    waktu = setInterval(() => { n--; sisa.textContent = String(n); if (n <= 0) tutup(); }, 1000);
  }
  aksi.push(tombol('Tutup', tutup, 'abu'));
  kotak.append(...isi, h('div', { class: 'aksi' }, aksi));
  return tutup;
}

export const berhasil = (t, o) => umpan('ok', t, o);
export const gagal = (t) => umpan('gagal', t);

/** Konfirmasi dengan kalimat penuh. Mengembalikan Promise<boolean>. */
export function konfirmasi(kalimat, { ya = 'Ya, lanjutkan', tidak = 'Tidak' } = {}) {
  return new Promise((ok) => {
    const lapis = document.getElementById('lapis');
    const tutup = (v) => { lapis.className = 'lapis sembunyi'; lapis.replaceChildren(); ok(v); };
    lapis.className = 'lapis';
    lapis.replaceChildren(h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
      h('p', { class: 'kalimat' }, kalimat),
      h('div', { class: 'aksi' }, utama(ya, () => tutup(true)), tombol(tidak, () => tutup(false), 'abu'))));
    lapis.querySelector('.btn.utama').focus();
  });
}

/** Dialog bebas isi. isi(tutup) harus mengembalikan node. */
export function dialog(isi) {
  const lapis = document.getElementById('lapis');
  const tutup = () => { lapis.className = 'lapis sembunyi'; lapis.replaceChildren(); };
  lapis.className = 'lapis';
  lapis.replaceChildren(h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, isi(tutup)));
  return tutup;
}

/** Papan angka besar untuk PIN. */
export function papanAngka({ panjang = 4, saat }) {
  let nilai = '';
  const layar = h('div', { class: 'pinlayar', role: 'img' });
  const gambar = () => {
    layar.replaceChildren(...Array.from({ length: panjang }, (_, i) => h('span', { class: `titik${i < nilai.length ? ' isi' : ''}` })));
    layar.setAttribute('aria-label', `${nilai.length} dari ${panjang} angka terisi`);
  };
  gambar();
  const tek = (d) => {
    if (nilai.length >= panjang) return;
    nilai += d; gambar();
    if (nilai.length === panjang) { const n = nilai; nilai = ''; setTimeout(gambar, 120); saat(n); }
  };
  const kunci = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Hapus', '0'].map((k) =>
    k === 'Hapus' ? tombol('Hapus', () => { nilai = nilai.slice(0, -1); gambar(); }, 'abu') : tombol(k, () => tek(k)));
  const kb = (e) => { if (/^\d$/.test(e.key)) tek(e.key); else if (e.key === 'Backspace') { nilai = nilai.slice(0, -1); gambar(); } };
  document.addEventListener('keydown', kb);
  const node = h('div', { class: 'papanwrap' }, layar, h('div', { class: 'papan' }, kunci));
  node.lepas = () => document.removeEventListener('keydown', kb);
  return node;
}

/** Pilihan satu-dari-beberapa. pilihan: [[teks, nilai], ...]. Mengembalikan elemen; panggil .setNilai(v) untuk mengganti. */
export function segmen(pilihan, nilai, saat) {
  const el = h('div', { class: 'segmen', role: 'group' });
  const gambar = () => el.replaceChildren(...pilihan.map(([t, v]) => tombol(t, () => { nilai = v; gambar(); saat(v); }, '', { 'aria-pressed': String(nilai === v) })));
  gambar();
  el.setNilai = (v) => { nilai = v; gambar(); };
  return el;
}

/** Penghitung besar [-] angka [+] untuk jumlah. */
export function stepper({ nilai = 1, min = 1, maks = 500, saat = () => {} } = {}) {
  const input = h('input', { type: 'number', min, max: maks, value: nilai, inputMode: 'numeric', 'aria-label': 'Jumlah' });
  const tetapkan = (n) => { input.value = String(Math.max(min, Math.min(maks, Math.round(Number(n) || min)))); saat(Number(input.value)); };
  input.addEventListener('input', () => saat(Number(input.value) || min));
  input.addEventListener('change', () => tetapkan(input.value));
  const el = h('div', null,
    h('div', { class: 'langkah' },
      tombol(ikon('kurang'), () => tetapkan(Number(input.value) - 1), 'abu', { 'aria-label': 'Kurangi' }),
      input,
      tombol(ikon('tambah'), () => tetapkan(Number(input.value) + 1), 'abu', { 'aria-label': 'Tambah' })));
  el.input = input;
  el.tetapkan = tetapkan;
  return el;
}

export const kartu = (...a) => h('section', { class: 'kartu' }, ...a);
export const baris = (...a) => h('div', { class: 'baris' }, ...a);
/** Satu isian = <label> (mengarahkan klik ke kolomnya). Kumpulan tombol = <div role=group>, agar klik pada judul tidak menekan tombol pertama. */
export const kolomIsi = (label, input, petunjuk) => {
  const tunggal = input && input.nodeType && ['INPUT', 'SELECT', 'TEXTAREA'].includes(input.tagName);
  return h(tunggal ? 'label' : 'div', { class: 'kolom', role: tunggal ? null : 'group' }, h('span', { class: 'lbl' }, label), input, petunjuk ? h('small', null, petunjuk) : null);
};
