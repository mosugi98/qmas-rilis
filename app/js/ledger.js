// Buku stok harian. TIDAK disimpan: selalu dihitung dari tanggal masuk, tanggal terjual, dan koreksi,
// sehingga tidak mungkin tidak cocok dengan daftar barang.
//
//   awal   = akhir tanggal sebelumnya
//   masuk  = barang bertanggal masuk hari itu
//   terjual= barang bertanggal terjual hari itu (nota batal tidak dihitung: barangnya kembali 'ada')
//   koreksi= barang yang ditandai hilang hari itu
//   akhir  = awal + masuk - terjual - koreksi
//
// Semua dalam pcs dan miligram. Hari tanpa transaksi tetap muncul agar rantai tidak putus.

import { tambahHari } from './util.js';

const kosong = () => ({ pcs: 0, mg: 0 });

function tambah(peta, tgl, mg) {
  if (!tgl) return;
  const e = peta.get(tgl) || kosong();
  e.pcs += 1;
  e.mg += mg;
  peta.set(tgl, e);
}

/**
 * @param {Array} barang   daftar barang (status, beratMg, tglMasuk, tglTerjual)
 * @param {Array} koreksi  daftar koreksi stok ({tanggal, kode})
 * @param {string} hariIni 'YYYY-MM-DD'
 * @returns {Array} satu baris per hari dari tanggal masuk pertama sampai hariIni
 */
export function hitungBuku(barang, koreksi, hariIni) {
  const masuk = new Map();
  const terjual = new Map();
  const koreksiMap = new Map();
  const berat = new Map(barang.map((b) => [b.kode, b.beratMg]));

  let awalTgl = null;
  for (const b of barang) {
    tambah(masuk, b.tglMasuk, b.beratMg);
    if (b.status === 'terjual') tambah(terjual, b.tglTerjual, b.beratMg);
    if (b.tglMasuk && (!awalTgl || b.tglMasuk < awalTgl)) awalTgl = b.tglMasuk;
  }
  for (const k of koreksi) {
    if (berat.has(k.kode)) tambah(koreksiMap, k.tanggal, berat.get(k.kode));
  }
  if (!awalTgl) return [];
  const akhirTgl = hariIni > awalTgl ? hariIni : awalTgl;

  const hasil = [];
  let sisa = kosong();
  for (let t = awalTgl; t <= akhirTgl; t = tambahHari(t, 1)) {
    const m = masuk.get(t) || kosong();
    const j = terjual.get(t) || kosong();
    const k = koreksiMap.get(t) || kosong();
    const awal = { ...sisa };
    const akhir = { pcs: awal.pcs + m.pcs - j.pcs - k.pcs, mg: awal.mg + m.mg - j.mg - k.mg };
    hasil.push({ tanggal: t, awal, masuk: { ...m }, terjual: { ...j }, koreksi: { ...k }, akhir });
    sisa = akhir;
  }
  return hasil;
}

/** Barang di balik angka satu hari: {masuk, terjual, koreksi} berisi daftar barang. */
export function rincianHari(barang, koreksi, tanggal) {
  const ada = new Map(barang.map((b) => [b.kode, b]));
  return {
    masuk: barang.filter((b) => b.tglMasuk === tanggal),
    terjual: barang.filter((b) => b.status === 'terjual' && b.tglTerjual === tanggal),
    koreksi: koreksi
      .filter((k) => k.tanggal === tanggal && ada.has(k.kode))
      .map((k) => ({ ...ada.get(k.kode), alasan: k.alasan })),
  };
}

/** Stok akhir hari ini = baris terbaru buku. Dipakai beranda; harus sama persis dengan buku. */
export function stokHariIni(buku) {
  return buku.length ? buku[buku.length - 1].akhir : kosong();
}

/** Filter baris buku per rentang. mode: 'minggu' (7 hari terakhir) | 'bulan' (30 hari) | 'semua'. */
export function filterBuku(buku, mode, hariIni) {
  if (mode === 'semua' || !buku.length) return buku;
  const batas = tambahHari(hariIni, mode === 'minggu' ? -6 : -29);
  return buku.filter((r) => r.tanggal >= batas);
}

/** Baris-baris laporan Excel/CSV untuk buku stok harian. */
export function bukuKeBaris(buku) {
  const g = (mg) => mg / 1000;
  return buku.map((r) => ({
    Tanggal: r.tanggal,
    'Stok awal (pcs)': r.awal.pcs, 'Stok awal (g)': g(r.awal.mg),
    'Masuk (pcs)': r.masuk.pcs, 'Masuk (g)': g(r.masuk.mg),
    'Terjual (pcs)': r.terjual.pcs, 'Terjual (g)': g(r.terjual.mg),
    'Koreksi (pcs)': r.koreksi.pcs, 'Koreksi (g)': g(r.koreksi.mg),
    'Stok akhir (pcs)': r.akhir.pcs, 'Stok akhir (g)': g(r.akhir.mg),
  }));
}
