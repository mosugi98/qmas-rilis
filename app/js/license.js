// Lisensi beli permanen. Kunci = teks bertanda tangan Ed25519, dicek di perangkat tanpa internet.
// Tidak ada tanggal habis dan TIDAK terikat perangkat (agar pindah perangkat tidak butuh kunci baru).
//
//   QMAS3.<payload base64url>.<tanda tangan base64url>
//   payload = {"p":"qmas","v":3,"toko":"...","no":"nomor pembeli","terbit":"YYYY-MM-DD"}

import * as noble from '../vendor/noble-ed25519.js';

// Kunci publik penerbit v3 (aman dibagikan). Pasangan privatnya hanya dipegang pemilik/penerbit.
export const KUNCI_PUBLIK = 'C_oAz5h8gLc9EKDdOF5mPez6wTNmrAigOKdsnPNNcFA';
export const PREFIX = 'QMAS3';

export class LisensiError extends Error {}

export function b64urlKeBytes(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(t);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesKeB64url(b) {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifikasi(sig, pesan, pub, paksaNoble) {
  if (!paksaNoble) {
    try {
      const k = await crypto.subtle.importKey('raw', pub, 'Ed25519', false, ['verify']);
      return await crypto.subtle.verify('Ed25519', k, sig, pesan);
    } catch { /* browser lama: pakai pustaka cadangan */ }
  }
  return noble.verifyAsync(sig, pesan, pub);
}

/** Memeriksa tanda tangan lalu mengembalikan isi kunci. Melempar LisensiError bila tidak sah. */
export async function urai(kunci, { publik = KUNCI_PUBLIK, paksaNoble = false } = {}) {
  const s = String(kunci ?? '').replace(/\s+/g, '');
  const bagian = s.split('.');
  if (bagian.length !== 3 || bagian[0] !== PREFIX) throw new LisensiError('Format kunci lisensi tidak dikenal');
  let raw, sig, pub;
  try { raw = b64urlKeBytes(bagian[1]); sig = b64urlKeBytes(bagian[2]); pub = b64urlKeBytes(publik); } catch {
    throw new LisensiError('Kunci lisensi rusak atau terpotong, salin ulang seluruhnya');
  }
  let ok = false;
  try { ok = await verifikasi(sig, raw, pub, paksaNoble); } catch { ok = false; }
  if (!ok) throw new LisensiError('Kunci lisensi tidak sah');
  let data;
  try { data = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new LisensiError('Kunci lisensi rusak'); }
  if (data.p !== 'qmas') throw new LisensiError('Kunci ini bukan untuk Q-mas');
  return data;
}

/** Status untuk antarmuka: { penuh, toko, no, pesan }. Kunci kosong/palsu = mode coba. */
export async function periksa(kunci, opsi) {
  if (!String(kunci ?? '').trim()) {
    return { penuh: false, toko: '', no: '', pesan: 'Mode coba: maksimal 30 barang aktif.' };
  }
  try {
    const d = await urai(kunci, opsi);
    return { penuh: true, toko: d.toko || '', no: d.no || '', pesan: 'Lisensi penuh, berlaku selamanya.' };
  } catch (e) {
    return { penuh: false, toko: '', no: '', pesan: e.message, salah: true };
  }
}
