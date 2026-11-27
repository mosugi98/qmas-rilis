// Jembatan ke cadangan otomatis native di APK (plugin QmasAutosave, lihat android-patch/).
//
// Cara kerja: data hidup di IndexedDB (WebView), jadi aplikasi menulis berkas .qmas TERBARU ("snapshot")
// ke penyimpanan privat setiap data berubah. Saat aplikasi tertutup data tidak bisa berubah, jadi snapshot
// itu selalu sama dengan data terkini; penjadwal Android (WorkManager) menyalinnya ke Documents/Q-mas
// sesuai jadwal pengguna, walau aplikasi tertutup. Di Chrome/PWA modul ini tidak aktif.

import { diAPK } from './platform.js';
import { buatQmas } from './backup.js';

let cache;
function plugin() {
  if (cache !== undefined) return cache;
  const C = window.Capacitor;
  try { cache = (C && (C.registerPlugin ? C.registerPlugin('QmasAutosave') : C.Plugins?.QmasAutosave)) || null; } catch { cache = C?.Plugins?.QmasAutosave || null; }
  return cache;
}

export const ada = () => diAPK() && !!plugin();

function keBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let tunda = null;

export async function simpanSnapshot(q) {
  const { bytes } = await buatQmas(q);
  await plugin().simpanSnapshot({ data: keBase64(bytes) });
}

/** Tulis ulang snapshot setelah data berhenti berubah beberapa detik. */
export function jadwalSnapshot(q, ms = 4000) {
  clearTimeout(tunda);
  tunda = setTimeout(() => { tunda = null; simpanSnapshot(q).catch((e) => console.warn('Snapshot gagal', e)); }, ms);
}

/** Tulis snapshot SEKARANG (dipanggil saat aplikasi masuk latar belakang). */
export async function flush(q) {
  clearTimeout(tunda);
  tunda = null;
  await simpanSnapshot(q);
}

export const atur = (a) => plugin().atur({
  aktif: !!a.aktif, jadwal: a.jadwal, jam: a.jam, tiapJam: Number(a.tiapJam) || 6, salinan: String(a.salinan),
});
export const tandaiPerubahan = () => plugin().tandaiPerubahan();
export const cadangkanSekarang = () => plugin().cadangkanSekarang();
export const status = () => plugin().status();
