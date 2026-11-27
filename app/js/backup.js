// Berkas cadangan .qmas: ZIP berisi manifest.json + data.json.
// Satu format untuk backup manual, autosave, dan pindah perangkat.
// Tanpa kata sandi. PIN layar TIDAK ikut (PIN ada di tabel 'lokal', bukan di data).
// Checksum = SHA-256 dari byte data.json persis seperti tersimpan di berkas.

import { buatZip, bacaZip } from './zip.js';
import { TABEL } from './db.js';
import { VERSI, tglLokal } from './util.js';

export const FORMAT = 1;
const enc = new TextEncoder();
const dec = new TextDecoder();

export class QmasError extends Error {}

export async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function namaBerkas(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `qmas-${tglLokal(d)}-${p(d.getHours())}${p(d.getMinutes())}.qmas`;
}

/** @returns {Promise<{bytes:Uint8Array, manifest:object}>} */
export async function buatQmas(store, sekarang = new Date()) {
  const data = await store.dump();
  const dataBytes = enc.encode(JSON.stringify(data));
  const aktif = data.barang.filter((b) => b.status === 'ada');
  const manifest = {
    app: 'qmas',
    format: FORMAT,
    versiApp: VERSI,
    tanggal: sekarang.toISOString(),
    jumlahBarang: data.barang.length,
    stokPcs: aktif.length,
    stokMg: aktif.reduce((s, b) => s + b.beratMg, 0),
    jumlahPenjualan: data.penjualan.length,
    checksum: 'sha256:' + (await sha256Hex(dataBytes)),
  };
  return { bytes: buatZip({ 'manifest.json': JSON.stringify(manifest, null, 2), 'data.json': dataBytes }), manifest };
}

function cekSkema(data) {
  const salah = (m) => { throw new QmasError(`Berkas cadangan tidak lengkap: ${m}`); };
  if (!data || typeof data !== 'object') salah('data kosong');
  for (const t of TABEL) if (!Array.isArray(data[t])) salah(`tabel ${t} hilang`);
  const kode = new Set();
  for (const b of data.barang) {
    if (typeof b.kode !== 'string' || !b.kode) salah('ada barang tanpa kode');
    if (kode.has(b.kode)) salah(`kode ganda ${b.kode}`);
    kode.add(b.kode);
    if (!Number.isInteger(b.beratMg) || b.beratMg <= 0) salah(`berat ${b.kode} tidak valid`);
    if (!['ada', 'terjual', 'hilang'].includes(b.status)) salah(`status ${b.kode} tidak valid`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.tglMasuk || '')) salah(`tanggal masuk ${b.kode} tidak valid`);
  }
}

/** Membaca dan memeriksa berkas. Berkas rusak ditolak dengan pesan jelas. */
export async function bacaQmas(bytes) {
  let isi;
  try { isi = await bacaZip(bytes); } catch (e) {
    throw new QmasError(`Berkas ini bukan cadangan Q-mas yang utuh (${e.message}). Coba salin ulang berkasnya.`);
  }
  if (!isi['manifest.json'] || !isi['data.json']) throw new QmasError('Berkas ini bukan cadangan Q-mas (isinya tidak sesuai).');
  let manifest;
  try { manifest = JSON.parse(dec.decode(isi['manifest.json'])); } catch { throw new QmasError('Berkas cadangan rusak (manifest tidak terbaca).'); }
  if (manifest.app !== 'qmas') throw new QmasError('Berkas ini bukan cadangan Q-mas.');
  if (manifest.format > FORMAT) throw new QmasError('Berkas dibuat oleh Q-mas yang lebih baru. Perbarui aplikasi dulu.');
  const cek = 'sha256:' + (await sha256Hex(isi['data.json']));
  if (cek !== manifest.checksum) throw new QmasError('Berkas cadangan RUSAK: checksum tidak cocok. Data tidak diubah. Pakai salinan cadangan lain.');
  let data;
  try { data = JSON.parse(dec.decode(isi['data.json'])); } catch { throw new QmasError('Berkas cadangan rusak (data tidak terbaca).'); }
  cekSkema(data);
  return { manifest, data };
}

/**
 * Pulihkan: (1) simpan cadangan pengaman dari data sekarang, (2) ganti seluruh data.
 * Pratinjau dan persetujuan pengguna dilakukan pemanggil SEBELUM fungsi ini.
 * @returns {Promise<{pengaman: Uint8Array, namaPengaman: string}>}
 */
export async function pulihkan(store, parsed, sekarang = new Date()) {
  const { bytes } = await buatQmas(store, sekarang);
  const namaPengaman = 'pengaman-' + namaBerkas(sekarang);
  await store.db.tulis([{ op: 'put', tabel: 'lokal', nilai: { k: 'pengaman', nama: namaPengaman, bytes } }]);
  // Pengaturan lama dipertahankan sebagai bawaan bila berkas tidak memuatnya.
  await store.pulihkan(parsed.data);
  return { pengaman: bytes, namaPengaman };
}

/** Catat waktu cadangan terakhir di pengaturan (ikut cadangan berikutnya). */
export async function catatCadangan(store, sekarang = new Date()) {
  await store.ubahPengaturan({ cadanganTerakhir: sekarang.toISOString() });
}
