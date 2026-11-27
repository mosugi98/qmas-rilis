// Layar utama: Beranda, Tambah Barang, Riwayat Tambah (urungkan + cetak ulang), Cetak Barcode.

import { h, tombol, utama, kartu, kolomIsi, berhasil, gagal, konfirmasi, segmen, stepper } from './dom.js';
import { ikon } from './ikon.js';
import { JENIS, KADAR_UMUM, labelKadar, parseBeratMg, formatBerat, formatGram, formatAngka, tglPanjang, tglLokal } from '../util.js';
import { barcodeSvg } from '../code128.js';
import { statusSpanduk } from '../autosave.js';
import { bip, mulaiKamera } from '../scanner.js';
import { BATAS_COBA } from '../store.js';
import { bisaPasang, pasang, sudahTerpasang, simpanBerkas, diAPK } from '../platform.js';
import { buatPdfLabel, jumlahHalaman } from '../pdf.js';
import { bytesLabelEscPos, bytesUjiEscPos } from '../escpos.js';
import { bisaBluetooth, kirimKePrinter, PESAN_KOSONG } from '../bluetooth.js';

/** node.append() mengubah null menjadi teks "null"; pembantu ini membuang nilai kosong. */
const tambahkan = (node, ...anak) => node.append(...anak.filter(Boolean));

export const BANTUAN = {
  beranda: ['Tiga angka di atas: stok sekarang, barang masuk dan terjual hari ini.', 'Tekan Tutup buku di akhir hari: pindai label terjual dan barang etalase.', 'Tombol di dasar layar selalu sama: Kembali, Beranda, Bantuan.'],
  tambah: ['Pilih jenis dan kadar, lalu isi satu baris per gramasi: berat dan jumlahnya.', 'Tekan Tambah gramasi lain bila gramasi berbeda. Satu kali Simpan membuat semua kode dan label.', 'Salah memasukkan? Buka Riwayat Tambah: bisa diurungkan kapan saja.', 'Lupa mencetak label? Riwayat Tambah juga untuk cetak ulang.'],
  riwayatTambah: ['Setiap kali Anda menyimpan barang, tercatat satu kelompok di sini.', 'Cetak ulang: mencetak lagi semua label yang masih ada di kelompok itu.', 'Urungkan: menghapus seluruh kelompok bila belum ada yang terjual.'],
  label: ['Pilih ukuran label dan jumlah salinan.', 'Simpan PDF lalu cetak dari komputer, atau cetak langsung.', 'Printer Bluetooth: pakai Chrome, printer harus jenis BLE.'],
};

const waktuTeks = (w) => (w ? `${tglPanjang(w.slice(0, 10))}, ${w.slice(11, 16)}` : 'Waktu tidak tercatat');
const ringkasTeks = (r) => `${r.pcs} × ${r.jenis} ${r.kadar} ${formatBerat(r.beratMg)} g`;

// ---------- Beranda ----------
export async function beranda(ctx) {
  const { q } = ctx;
  const [r, p, semua, belum, tutupJalan, hitunganLama, riwayatHitung] = await Promise.all([q.ringkasan(), q.pengaturan(), q.barangSemua(), q.belumDicetak(), q.tutupBerjalan(), q.hitunganBerjalan(), q.daftarHitungan()]);
  const tutupHariIni = riwayatHitung.some((x) => x.jenis === 'tutup' && x.tanggal === q.hariIni());
  const terakhir = p.cadanganTerakhir ? new Date(p.cadanganTerakhir) : null;
  const sp = statusSpanduk(p.autosave, terakhir, q.sekarang(), semua.length > 0);
  const node = h('div', { class: 'layar' });

  // Hierarki: angka dan tombol utama lebih dulu; hanya peringatan cadangan yang tampil di atas tombol.
  // Pemberitahuan lain (mode coba, pasang, penyimpanan) dipindah ke bawah tombol agar tidak mendorongnya keluar layar.
  const info = [];
  if (!ctx.lisensi.penuh) {
    const aktif = semua.filter((b) => b.status === 'ada').length;
    info.push(h('div', { class: 'pesan' }, ikon('kunci'), h('span', null, `Mode coba: ${aktif} dari ${BATAS_COBA} barang. Tempel kunci lisensi di Pengaturan untuk membuka penuh.`)));
  }
  if (!ctx.izinPermanen) {
    info.push(h('div', { class: 'pesan merah' }, ikon('awas'), h('span', null, 'Perangkat belum menjamin data tersimpan permanen. Cadangkan data sering-sering.')));
  }
  if (!sudahTerpasang() && bisaPasang()) {
    info.push(h('div', { class: 'spanduk' }, 'Pasang Q-mas agar jalan tanpa internet.', tombol('Pasang di perangkat ini', async () => { await pasang(); ctx.segarkan(); })));
  }

  node.append(h('div', { class: 'ringkas', role: 'group', 'aria-label': 'Ringkasan hari ini' },
    h('div', { class: 'stok' }, h('span', { class: 'lbl' }, 'Stok sekarang'), h('b', null, formatAngka(r.stok.pcs)), h('small', null, formatGram(r.stok.mg))),
    h('div', null, h('span', { class: 'lbl' }, 'Masuk hari ini'), h('b', null, formatAngka(r.masuk.pcs)), h('small', null, formatGram(r.masuk.mg))),
    h('div', null, h('span', { class: 'lbl' }, 'Terjual hari ini'), h('b', null, formatAngka(r.terjual.pcs)), h('small', null, formatGram(r.terjual.mg)))));

  if (sp.tampil && (sp.merah || ctx.perluIzinFolder)) {
    node.append(h('div', { class: `spanduk ${sp.merah ? 'merah' : ''}` },
      h('div', { class: 'baris1' }, ikon(sp.merah ? 'awas' : 'cadang'), h('span', null, sp.teks)),
      ctx.perluIzinFolder ? tombol('Ketuk untuk memberi izin folder cadangan', () => ctx.beriIzinFolder()) : null));
  } else if (sp.tampil) {
    info.unshift(h('div', { class: 'pesan' }, ikon('cadang'), h('span', null, sp.teks)));
  }

  // Pekerjaan yang belum selesai diingatkan (efek Zeigarnik) dengan warna kuning yang sengaja jarang dipakai (Von Restorff).
  if (belum.length) {
    node.append(h('div', { class: 'spanduk amber' },
      h('div', { class: 'baris1' }, ikon('printer'), h('span', null, `${belum.length} barang belum dicetak labelnya`)),
      tombol([ikon('printer', 22), 'Cetak sekarang'], () => { ctx.labelBaru = belum.map((b) => b.kode); ctx.nav('/label'); })));
  }
  if (tutupJalan || hitunganLama) {
    const n = tutupJalan ? tutupJalan.terjual.length + tutupJalan.etalase.length : hitunganLama.dipindai.length;
    node.append(h('div', { class: 'spanduk amber' },
      h('div', { class: 'baris1' }, ikon('cek'), h('span', null, `Tutup buku sedang berjalan (${n} dipindai)`)),
      tombol('Lanjutkan tutup buku', () => ctx.nav('/tutup'))));
  } else if (!tutupHariIni && semua.some((b) => b.status === 'ada')) {
    node.append(h('div', { class: 'spanduk amber' },
      h('div', { class: 'baris1' }, ikon('cek'), h('span', null, 'Tutup buku hari ini belum dilakukan')),
      tombol('Mulai tutup buku', () => ctx.nav('/tutup'))));
  }

  // Pareto: Tutup buku dan Tambah Barang (pemakaian terbanyak) paling besar; sisanya lebih kecil.
  node.append(
    utama([ikon('cek', 32), 'Tutup buku'], () => ctx.nav('/tutup'), { class: 'btn utama besar' }),
    tombol([ikon('tambah', 28), 'Tambah Barang'], () => ctx.nav('/tambah'), 'sedang'),
    h('div', { class: 'tiga' },
      tombol([ikon('stok', 28), 'Stok'], () => ctx.nav('/stok'), 'ubin3'),
      tombol([ikon('riwayat', 28), 'Penjualan'], () => ctx.nav('/riwayat'), 'ubin3'),
      tombol([ikon('cadang', 28), 'Cadangkan'], () => ctx.nav('/cadang'), 'ubin3')),
    ...info,
    h('div', { class: 'dasar' }, h('button', { class: 'link', onclick: () => ctx.nav('/pengaturan') }, 'Pengaturan')));
  return { judul: p.namaToko || 'Q-mas', merek: true, subjudul: tglPanjang(q.hariIni()), node, bantuan: BANTUAN.beranda };
}

// ---------- Tambah Barang ----------
// Satu jenis dan kadar, banyak gramasi: tiap baris = berat + jumlah. Semua kode dibuat sekali Simpan.
export async function tambah(ctx) {
  const { q } = ctx;
  let jenis = JENIS[0];
  let kadar = KADAR_UMUM[0]; // bawaan 16K
  let sumber = 'baru';
  const jenisBox = h('div', { class: 'pilih' });
  const kadarBox = h('div', { class: 'pilih' });
  const kadarLain = h('input', { type: 'text', placeholder: 'Kadar lain, contoh 17K', maxLength: 3, 'aria-label': 'Kadar lain' });
  const catatan = h('input', { type: 'text', placeholder: 'Catatan singkat', maxLength: 200, 'aria-label': 'Catatan' });
  const sumberSeg = segmen([['Stok baru', 'baru'], ['Dari pelanggan', 'pelanggan']], sumber, (v) => { sumber = v; catatanWrap.hidden = v !== 'pelanggan'; });
  const catatanWrap = h('div', { hidden: true }, kolomIsi('Catatan (dari pelanggan)', catatan));
  const info = h('div', { class: 'pratinjau', 'aria-live': 'polite' });
  const daftar = h('div', { class: 'gramasi' });
  const baris = []; // {el, berat, jml, hapus}

  const tampilHapus = () => { for (const r of baris) r.hapus.hidden = baris.length === 1; };

  function tambahBaris(beratAwal = '', jmlAwal = '1', fokus = false) {
    const berat = h('input', { type: 'text', inputMode: 'decimal', placeholder: 'Berat g', value: beratAwal, 'aria-label': 'Berat dalam gram' });
    const jml = h('input', { type: 'number', min: 1, max: 200, inputMode: 'numeric', placeholder: 'Jml', value: jmlAwal, 'aria-label': 'Jumlah pcs' });
    const hapus = tombol([ikon('hapus', 20)], () => { baris.splice(baris.indexOf(r), 1); r.el.remove(); tampilHapus(); pratinjau(); }, 'abu kecil', { 'aria-label': 'Hapus baris gramasi ini' });
    const el = h('div', { class: 'gramasi-baris' }, berat, h('span', { class: 'kali' }, '×'), jml, hapus);
    const r = { el, berat, jml, hapus };
    berat.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); jml.focus(); jml.select(); } });
    jml.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (berat.value.trim()) tambahBaris('', '1', true); } });
    for (const x of [berat, jml]) x.addEventListener('input', pratinjau);
    baris.push(r); daftar.append(el); tampilHapus(); pratinjau();
    if (fokus) berat.focus();
    return r;
  }

  /** Baris terisi -> [{jenis,kadar,beratMg,pcs}]. Baris berat kosong dilewati. Galat menyebut nomor barisnya. */
  function bacaBaris() {
    const k = kadarLain.value.trim() || kadar;
    const rows = [];
    baris.forEach((r, i) => {
      if (!r.berat.value.trim()) return;
      let mg;
      try { mg = parseBeratMg(r.berat.value); } catch (e) { throw new Error(`Baris ${i + 1}: ${e.message}`); }
      const pcs = Number(r.jml.value);
      if (!Number.isInteger(pcs) || pcs < 1 || pcs > 200) throw new Error(`Baris ${i + 1}: jumlah harus 1 sampai 200`);
      rows.push({ jenis, kadar: k, beratMg: mg, pcs });
    });
    if (!rows.length) throw new Error('Isi berat minimal satu baris');
    return rows;
  }

  const pil = (box, daftarPil, nilaiFn, setFn) => box.replaceChildren(...daftarPil.map(([t, v]) =>
    tombol(t, () => { setFn(v); gambar(); }, '', { 'aria-pressed': String(nilaiFn() === v) })));
  function gambar() {
    pil(jenisBox, JENIS.map((j) => [j, j]), () => jenis, (v) => { jenis = v; });
    pil(kadarBox, KADAR_UMUM.map((k) => [labelKadar(k), k]), () => kadar, (v) => { kadar = v; kadarLain.value = ''; });
    pratinjau();
  }
  async function pratinjau() {
    try {
      const rows = bacaBaris();
      const kodes = await q.pratinjauKode(rows);
      let mulai = 0;
      const garis = rows.map((r) => {
        const a = kodes[mulai]; const b = kodes[mulai + r.pcs - 1]; mulai += r.pcs;
        return h('li', null, `${formatBerat(r.beratMg)} g × ${r.pcs}: `, h('b', null, r.pcs === 1 ? a : `${a} – ${b.slice(-3)}`));
      });
      info.replaceChildren(h('div', { class: 'baris1' }, ikon('cek', 22), h('span', null, `${kodes.length} label dari ${rows.length} gramasi`)), h('ul', { class: 'daftar-kode' }, garis));
    } catch (e) { info.replaceChildren(...(/^Baris/.test(e.message) ? [h('small', { class: 'salah-teks' }, e.message)] : [])); }
  }

  async function simpan() {
    let rows;
    try { rows = bacaBaris(); } catch (e) { return gagal(e.message); }
    try {
      const kodes = await q.tambahBarang(rows, { sumber, catatan: catatan.value });
      ctx.catatPerubahan();
      ctx.labelBaru = kodes;
      ctx.baruSimpan = `${kodes.length} ${jenis.toLowerCase()} tersimpan`;
      berhasil(`${kodes.length} ${jenis.toLowerCase()} dari ${rows.length} gramasi tersimpan.`, {
        batalkan: async () => { await q.batalkanTambah(kodes); ctx.labelBaru = null; ctx.catatPerubahan(); berhasil('Penambahan dibatalkan.'); ctx.segarkan(); },
      });
      ctx.nav('/label');
    } catch (e) { gagal(e.message); }
  }
  kadarLain.addEventListener('input', pratinjau);

  // Pengenalan lebih mudah daripada mengingat: kombinasi yang terakhir dipakai tinggal diketuk.
  const kombo = await q.komboTerakhir(3);
  const komboEl = kombo.length
    ? kolomIsi('Terakhir dipakai', h('div', { class: 'kombo' }, ...kombo.map((c) => tombol(`${c.jenis} ${c.kadar} ${formatBerat(c.beratMg)} g`, () => {
      jenis = c.jenis;
      if (KADAR_UMUM.includes(c.kadar)) { kadar = c.kadar; kadarLain.value = ''; } else { kadarLain.value = c.kadar; }
      const r = baris.find((x) => !x.berat.value.trim()) || tambahBaris();
      r.berat.value = formatBerat(c.beratMg);
      gambar();
      r.jml.focus();
      r.jml.select();
    }, 'abu'))))
    : null;

  tambahBaris();
  const node = h('div', { class: 'layar' },
    komboEl,
    kolomIsi('Jenis', jenisBox), kolomIsi('Kadar', [kadarBox, kadarLain]),
    kolomIsi('Gramasi dan jumlah', [daftar,
      tombol([ikon('tambah', 22), 'Tambah gramasi lain'], () => tambahBaris('', '1', true), 'abu penuh')],
    'Isi berat lalu jumlah. Enter pindah kolom; Enter di jumlah membuka baris baru. Maksimal 30 gramasi dan 500 label sekali simpan.'),
    h('details', null, h('summary', null, 'Pilihan tambahan'),
      h('div', { class: 'isi' }, kolomIsi('Sumber', sumberSeg), catatanWrap)),
    info,
    h('div', { class: 'lekat' }, utama([ikon('simpan'), 'Simpan semua dan buat label'], simpan, { class: 'btn utama penuh' })),
    tombol([ikon('riwayat', 22), 'Riwayat Tambah'], () => ctx.nav('/riwayat-tambah'), 'abu penuh'));
  gambar();
  return { judul: 'Tambah Barang', node, bantuan: BANTUAN.tambah };
}

// ---------- Riwayat Tambah: urungkan dan cetak ulang ----------
export async function riwayatTambah(ctx) {
  const { q } = ctx;
  const grup = await q.daftarBatch();
  const node = h('div', { class: 'layar' });
  node.append(h('p', null, 'Setiap kali Anda menyimpan barang, tercatat satu kelompok di sini. Dari sini Anda bisa mencetak ulang labelnya atau mengurungkan bila salah memasukkan.'));
  if (!grup.length) {
    node.append(h('div', { class: 'pesan' }, ikon('riwayat'), h('span', null, 'Belum ada kelompok. Kelompok tercatat mulai dari barang yang Anda simpan sekarang. Barang lama tetap bisa dicetak dari Stok, Daftar Barang.')));
    node.append(utama([ikon('tambah'), 'Tambah Barang'], () => ctx.nav('/tambah')));
    return { judul: 'Riwayat Tambah', node, bantuan: BANTUAN.riwayatTambah };
  }
  for (const g of grup.slice(0, 50)) {
    const sebagian = g.terjual + g.hilang > 0;
    node.append(kartu(
      h('div', { class: 'kv' }, h('b', null, waktuTeks(g.waktu)), h('span', null, `${g.total} barang`)),
      h('div', null, ...g.ringkas.map((r) => h('div', null, ringkasTeks(r)))),
      h('div', { class: 'baris rapat' },
        g.belumCetak ? h('span', { class: 'chip amber' }, `${g.belumCetak} belum dicetak`) : null,
        g.ada ? h('span', { class: 'chip ok' }, `${g.ada} ada`) : null,
        g.terjual ? h('span', { class: 'chip' }, `${g.terjual} terjual`) : null,
        g.hilang ? h('span', { class: 'chip merah' }, `${g.hilang} hilang`) : null),
      h('div', { class: 'baris' },
        tombol([ikon('printer', 22), 'Cetak ulang'], () => { ctx.labelBaru = g.kodeAda; ctx.nav('/label'); }, 'utama', { disabled: !g.ada }),
        tombol([ikon('urung', 22), 'Urungkan'], async () => {
          const ok = await konfirmasi(`Urungkan ${g.total} barang yang disimpan ${waktuTeks(g.waktu)}? Barangnya dihapus dari stok dan Buku Stok. Nomor kodenya tidak akan dipakai lagi. Jika labelnya sudah tercetak, buang labelnya.`, { ya: 'Ya, urungkan' });
          if (!ok) return;
          try { const n = await q.urungkanBatch(g.id); ctx.catatPerubahan(); berhasil(`${n} barang diurungkan.`); ctx.segarkan(); } catch (e) { gagal(e.message); }
        }, 'bahaya', { disabled: sebagian })),
      sebagian ? h('small', null, 'Tidak bisa diurungkan seluruhnya karena sebagian sudah terjual atau hilang. Batalkan penjualannya dulu, atau hapus barang satu per satu dari Stok.') : null));
  }
  return { judul: 'Riwayat Tambah', node, bantuan: BANTUAN.riwayatTambah };
}

// ---------- Cetak Barcode ----------
const kartuLabel = (b, ukuran) => h('div', { class: `labelcard lbl-${ukuran}` },
  h('b', { class: 'ln' }, `${b.jenis} ${formatBerat(b.beratMg)} g`),
  h('div', { class: 'bc', html: barcodeSvg(b.kode) }),
  h('b', { class: 'lc' }, b.kode),
  h('span', { class: 'lk' }, `${b.kadar} · ${formatGram(b.beratMg)}`));

export async function label(ctx, param) {
  const { q } = ctx;
  const p = await q.pengaturan();
  const kodes = ctx.labelBaru?.length ? ctx.labelBaru : (param ? decodeURIComponent(param).split(',') : []);
  const barang = (await Promise.all(kodes.map((k) => q.barang(k)))).filter(Boolean);
  const node = h('div', { class: 'layar' });
  if (!barang.length) {
    node.append(h('p', null, 'Belum ada barang yang dipilih untuk dicetak.'),
      tombol([ikon('riwayat', 22), 'Buka Riwayat Tambah'], () => ctx.nav('/riwayat-tambah'), 'utama'),
      tombol([ikon('tambah', 22), 'Tambah Barang'], () => ctx.nav('/tambah'), 'abu'));
    return { judul: 'Cetak Barcode', node, bantuan: BANTUAN.label };
  }
  // Akhir alur Tambah Barang (peak-end): konfirmasi yang jelas sebelum memilih cara mencetak.
  const sukses = ctx.baruSimpan ? h('div', { class: 'sukses-kecil', role: 'status' }, ikon('centang', 26), ctx.baruSimpan) : null;
  ctx.baruSimpan = null;
  let lembarCetak = null;
  ctx.saatTutup = () => lembarCetak?.remove();
  const tandaiDicetak = async () => { try { if (await q.tandaiDicetak(barang.map((b) => b.kode))) { barang.forEach((b) => { b.belumCetak = false; }); gambar(); } } catch { /* abaikan */ } };
  let ukuran = p.labelUkuran || 'sedang';
  let garis = !!p.labelGaris;
  let kertas = 58;
  const salinan = stepper({ nilai: p.labelSalinan || 1, min: 1, maks: 100, saat: () => gambar() });
  const jumlahSalinan = () => Math.max(1, Math.min(100, Number(salinan.input.value) || 1));
  const lembar = h('div');
  const info = h('p', { class: 'pindaian' });
  const ukSeg = segmen([['Kecil 40 mm', 'kecil'], ['Sedang 55 mm', 'sedang'], ['Besar 80 mm', 'besar']], ukuran, (v) => { ukuran = v; gambar(); });
  const garisCek = h('input', { type: 'checkbox', checked: garis, onchange: (e) => { garis = e.target.checked; gambar(); } });
  const simpanPref = () => q.ubahPengaturan({ labelUkuran: ukuran, labelGaris: garis, labelSalinan: jumlahSalinan() }).catch(() => {});

  function gambar() {
    const n = jumlahSalinan();
    const totalLabel = barang.length * n;
    const belum = barang.filter((b) => b.belumCetak).length;
    info.replaceChildren(ikon('printer', 24), `${barang.length} barang · ${formatAngka(totalLabel)} label · ${jumlahHalaman(totalLabel, ukuran)} halaman A4`,
      belum ? h('span', { class: 'chip amber' }, `${belum} belum dicetak`) : h('span', { class: 'chip ok' }, 'sudah dicetak'));
    const contoh = barang.flatMap((b) => Array.from({ length: n }, () => b)).slice(0, 24);
    lembar.replaceChildren(
      h('div', { class: 'pratinjaulabel' }, h('div', { class: `labelsheet${garis ? ' potong' : ''}` }, ...contoh.map((b) => kartuLabel(b, ukuran)))),
      totalLabel > 24 ? h('small', null, `Pratinjau ${contoh.length} label pertama dari ${formatAngka(totalLabel)}. Semuanya ikut tercetak.`) : null);
  }

  async function simpanPdf() {
    try {
      ctx.sibuk(true);
      simpanPref();
      const bytes = buatPdfLabel(barang, { ukuran, salinan: jumlahSalinan(), garis });
      const d = new Date();
      const nama = `label-${tglLokal(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.pdf`;
      const r = await simpanBerkas(bytes, nama, 'application/pdf');
      if (r !== 'dibatalkan') { await tandaiDicetak(); berhasil(diAPK() ? 'PDF siap. Kirim ke komputer lalu cetak dari sana.' : `PDF ${nama} tersimpan. Buka di komputer lalu cetak.`); }
    } catch (e) { gagal(e.message); } finally { ctx.sibuk(false); }
  }

  /**
   * Cetak lewat dialog cetak browser. Lembar label dibuat SEBELUM dialog dan TIDAK dihapus oleh `afterprint`:
   * di HP, print() kembali segera dan afterprint datang sebelum halaman selesai digambar (hasilnya halaman kosong).
   * Lembar baru dibuang saat Anda meninggalkan layar ini.
   */
  async function cetakLangsung() {
    simpanPref();
    lembarCetak?.remove();
    const n = jumlahSalinan();
    lembarCetak = h('div', { class: `labelsheet cetak${garis ? ' potong' : ''}` }, ...barang.flatMap((b) => Array.from({ length: n }, () => kartuLabel(b, ukuran))));
    document.body.append(lembarCetak);
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); // biarkan browser menggambar lembar
    window.print();
    await tandaiDicetak();
  }

  // Bluetooth: setiap langkah dan hasil tampil di kotak status; tidak ada hasil yang diam-diam.
  const btStatus = h('div', { class: 'pesan', role: 'status', 'aria-live': 'polite', hidden: true });
  const tampilBt = (teks, jenis = 'info') => {
    btStatus.hidden = false;
    btStatus.className = jenis === 'ok' ? 'sukses-kecil' : `pesan${jenis === 'galat' ? ' merah' : ''}`;
    btStatus.replaceChildren(ikon(jenis === 'galat' ? 'awas' : jenis === 'ok' ? 'centang' : 'bluetooth', 22), h('span', null, teks));
  };
  let btSibuk = false;
  const jalankanBt = async (bytes, saatTerkirim) => {
    if (btSibuk) return;
    btSibuk = true; btUji.disabled = true; btKirim.disabled = true; ctx.sibuk(true);
    try {
      tampilBt('Memulai…');
      const r = await kirimKePrinter(bytes, (t) => tampilBt(t));
      if (r.status === 'dibatalkan') tampilBt(PESAN_KOSONG, 'galat');
      else { tampilBt(`Data terkirim ke ${r.nama}. Jika kertas tidak keluar, printer ini tidak cocok; pakai Cetak langsung atau Simpan PDF.`, 'ok'); await saatTerkirim?.(); }
    } catch (e) { tampilBt(e.message, 'galat'); } finally { btSibuk = false; btUji.disabled = false; btKirim.disabled = false; ctx.sibuk(false); }
  };
  const btUji = tombol([ikon('bluetooth', 22), 'Cetak uji (satu baris)'], () => jalankanBt(bytesUjiEscPos(kertas)), 'abu');
  const btKirim = tombol([ikon('printer', 22), 'Kirim label ke printer'], () => { simpanPref(); return jalankanBt(bytesLabelEscPos(barang, { salinan: jumlahSalinan(), kertas }), tandaiDicetak); }, 'utama');
  const btIsi = bisaBluetooth()
    ? [h('p', null, 'Hanya printer Bluetooth jenis BLE. Printer thermal murah umumnya memakai Bluetooth klasik dan TIDAK muncul di daftar. Bila daftar kosong, pakai Cetak langsung (menu cetak Android) atau Simpan PDF.'),
      h('p', null, 'Hidupkan printer, Bluetooth, dan Lokasi (GPS) di HP. Mulai dengan Cetak uji.'),
      kolomIsi('Lebar kertas printer', segmen([['58 mm', 58], ['80 mm', 80]], kertas, (v) => { kertas = v; })), btUji, btKirim, btStatus]
    : [h('p', null, diAPK()
      ? 'Bluetooth belum tersedia di aplikasi APK. Pakai Simpan PDF, atau buka Q-mas lewat Chrome di HP atau komputer.'
      : 'Browser ini tidak mendukung Bluetooth. Pakai Chrome di HP Android atau komputer, atau pakai Simpan PDF.')];

  tambahkan(node, sukses, info, kolomIsi('Ukuran label', ukSeg), kolomIsi('Salinan per barang', salinan),
    h('label', { class: 'baris rapat', style: 'min-height:48px' }, garisCek, 'Garis potong'),
    utama([ikon('pdf'), 'Simpan PDF'], simpanPdf, { class: 'btn utama penuh' }),
    h('small', null, 'Paling andal: buka PDF di komputer lalu cetak.'),
    diAPK() ? null : tombol([ikon('printer'), 'Cetak langsung'], cetakLangsung, 'penuh'),
    !diAPK() && /Android/i.test(navigator.userAgent) ? h('small', null, 'Di HP, ini membuka menu cetak Android. Pilih layanan cetak untuk printer Anda di sana.') : null,
    h('details', null, h('summary', null, 'Bluetooth (uji coba)'), h('div', { class: 'isi' }, ...btIsi)),
    lembar,
    tombol('Selesai', () => { ctx.labelBaru = null; ctx.nav('/'); }, 'abu penuh'));
  gambar();
  return { judul: 'Cetak Barcode', node, bantuan: BANTUAN.label };
}
