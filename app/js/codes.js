// Format kode barang: sama persis dengan v2 supaya label lama tetap berlaku.
//   {AWALAN}-{JNS}-{BERAT}-{NNN}   contoh: KNG-CIN-3G5-001   (G menggantikan koma desimal)

import { JENIS, KODE_JENIS, normalisasiKadar } from './util.js';

export const MAKS_PER_BARIS = 200;
export const MAKS_TOTAL = 500;
export const MAKS_BARIS = 30;

/** 3500 -> '3G5', 10000 -> '10G', 800 -> '0G8'. */
export function kodeBerat(mg) {
  const bulat = Math.floor(mg / 1000);
  const pecah = String(mg % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${bulat}G${pecah}`;
}

export function normalisasiAwalan(a) {
  const t = String(a ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{0,6}$/.test(t)) throw new Error('Awalan kode hanya huruf/angka, maksimal 6 karakter');
  return t;
}

export function stem(awalan, jenis, mg) {
  return [awalan, KODE_JENIS[jenis], kodeBerat(mg)].filter(Boolean).join('-');
}

/** Memvalidasi baris isian; mengembalikan baris bersih. Pesan memakai nomor baris bila lebih dari satu. */
export function cekBaris(rows) {
  if (!rows || !rows.length) throw new Error('Isi minimal satu baris perhiasan');
  if (rows.length > MAKS_BARIS) throw new Error(`Maksimal ${MAKS_BARIS} baris sekali buat`);
  let total = 0;
  const bersih = rows.map((r, i) => {
    const pre = rows.length > 1 ? `Baris ${i + 1}: ` : '';
    if (!JENIS.includes(r.jenis)) throw new Error(`${pre}Jenis tidak valid`);
    const pcs = Number(r.pcs ?? 1);
    if (!Number.isInteger(pcs) || pcs < 1 || pcs > MAKS_PER_BARIS) throw new Error(`${pre}Jumlah harus 1 sampai ${MAKS_PER_BARIS}`);
    if (!Number.isInteger(r.beratMg) || r.beratMg <= 0) throw new Error(`${pre}Berat harus lebih dari 0`);
    let kadar;
    try { kadar = normalisasiKadar(r.kadar); } catch { throw new Error(`${pre}Kadar tidak valid (contoh 22K)`); }
    const ongkos = Number(r.ongkos || 0);
    if (!Number.isInteger(ongkos) || ongkos < 0) throw new Error(`${pre}Harga tidak boleh negatif`);
    total += pcs;
    return { jenis: r.jenis, kadar, beratMg: r.beratMg, pcs, ongkos };
  });
  if (total > MAKS_TOTAL) throw new Error(`Total maksimal ${MAKS_TOTAL} pcs sekali buat (sekarang ${total})`);
  return bersih;
}

/**
 * Daftar kode yang AKAN dibuat. Dipakai pratinjau dan penyimpanan agar hasilnya selalu sama.
 * @param {Iterable<string>} kodeAda  semua kode yang sudah ada di penyimpanan
 */
export function rencanaKode(kodeAda, rows, awalan = '', urutan = {}) {
  const aw = normalisasiAwalan(awalan);
  const bersih = cekBaris(rows);
  const semua = [...kodeAda];
  const seq = new Map();
  const terakhir = (st) => {
    if (!seq.has(st)) {
      // Nomor yang pernah dipakai (walau barangnya sudah dihapus/diurungkan) tidak dipakai lagi,
      // agar tidak ada dua label fisik dengan kode yang sama.
      let best = Number(urutan[st]) || 0;
      const pre = st + '-';
      for (const k of semua) {
        if (k.startsWith(pre) && /^\d+$/.test(k.slice(pre.length))) best = Math.max(best, Number(k.slice(pre.length)));
      }
      seq.set(st, best);
    }
    return seq.get(st);
  };
  const hasil = [];
  for (const r of bersih) {
    const st = stem(aw, r.jenis, r.beratMg);
    for (let i = 0; i < r.pcs; i++) {
      const n = terakhir(st) + 1;
      seq.set(st, n);
      hasil.push({ kode: `${st}-${String(n).padStart(3, '0')}`, baris: r, stem: st, n });
    }
  }
  return hasil;
}

export function normalisasiKode(v) {
  return String(v ?? '').trim().toUpperCase();
}

/** Jarak edit (Levenshtein); berhenti lebih awal dan mengembalikan maks+1 bila sudah pasti lebih jauh. */
export function jarakEdit(a, b, maks = 3) {
  if (Math.abs(a.length - b.length) > maks) return maks + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minBaris = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < minBaris) minBaris = cur[j];
    }
    if (minBaris > maks) return maks + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Kode di `kandidat` yang mirip dengan `kode` (selisih paling banyak `maks` karakter), terdekat dulu.
 * Dipakai untuk menolong saat scanner/kamera salah baca satu karakter (mis. KNG-CIN-1G.5-002 untuk KNG-CIN-1G05-002).
 */
export function kodeMirip(kode, kandidat, { maks = 2, jumlah = 3 } = {}) {
  const k = normalisasiKode(kode);
  return kandidat
    .map((c) => ({ c, d: jarakEdit(k, c, maks) }))
    .filter((x) => x.d <= maks && x.c !== k)
    .sort((a, b) => a.d - b.d || (a.c < b.c ? -1 : 1))
    .slice(0, jumlah)
    .map((x) => x.c);
}
