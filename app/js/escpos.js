// Perintah ESC/POS untuk printer thermal Bluetooth (kertas 58 mm atau 80 mm).
// Barcode memakai perintah bawaan printer (GS k 73 = Code 128), jadi tidak perlu mengirim gambar.
// Catatan: printer label berbahasa TSPL/CPCL (bukan ESC/POS) tidak didukung; pakai Simpan PDF.

import { modul128 } from './code128.js';
import { formatBerat } from './util.js';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const KERTAS_DOT = { 58: 384, 80: 576 };

const ascii = (s) => [...String(s)].map((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? c : 0x3f; });

/** Lebar modul barcode (1 atau 2 titik) agar barcode muat di lebar kertas. */
export function faktorLebar(kode, kertas = 58) {
  const dot = KERTAS_DOT[kertas] ?? KERTAS_DOT[58];
  const modul = modul128(kode).length; // sudah termasuk start, checksum, stop
  return modul * 2 <= dot ? 2 : 1;
}

/** Cetak uji: satu judul, satu barcode kecil, dan baris penutup. Memisahkan masalah sambungan dari masalah label. */
export function bytesUjiEscPos(kertas = 58) {
  const kode = 'QMAS-TES';
  const data = ascii('{B' + kode);
  return Uint8Array.from([
    ESC, 0x40, ESC, 0x61, 1,
    ESC, 0x45, 1, ...ascii('Q-mas: tes cetak'), LF, ESC, 0x45, 0,
    GS, 0x68, 60, GS, 0x77, faktorLebar(kode, kertas), GS, 0x48, 0,
    GS, 0x6b, 73, data.length, ...data, LF,
    ...ascii(kode), LF, ...ascii('Jika ini tercetak, printer cocok.'), LF,
    ESC, 0x64, 3,
  ]);
}

/**
 * @param {Array<{kode:string,jenis:string,kadar:string,beratMg:number}>} daftar
 * @param {{salinan?:number, kertas?:58|80}} opsi
 * @returns {Uint8Array}
 */
export function bytesLabelEscPos(daftar, { salinan = 1, kertas = 58 } = {}) {
  if (!daftar.length) throw new Error('Tidak ada label untuk dicetak');
  const n = Math.max(1, Math.min(100, Number(salinan) || 1));
  const out = [ESC, 0x40]; // ESC @ : inisialisasi
  for (const b of daftar) {
    for (let i = 0; i < n; i++) {
      out.push(ESC, 0x61, 1); // rata tengah
      out.push(ESC, 0x45, 1, ...ascii(`${b.jenis} ${formatBerat(b.beratMg)} g`), LF, ESC, 0x45, 0);
      out.push(GS, 0x68, 80); // tinggi barcode 80 titik
      out.push(GS, 0x77, faktorLebar(b.kode, kertas)); // lebar modul
      out.push(GS, 0x48, 0); // tanpa teks bawaan (kode dicetak sendiri, tebal)
      const data = ascii('{B' + b.kode); // Code 128 set B
      out.push(GS, 0x6b, 73, data.length, ...data, LF);
      out.push(ESC, 0x45, 1, ...ascii(b.kode), LF, ESC, 0x45, 0);
      out.push(...ascii(`${b.kadar} - ${formatBerat(b.beratMg)} g`), LF);
      out.push(ESC, 0x64, 3); // maju 3 baris
    }
  }
  return Uint8Array.from(out);
}
