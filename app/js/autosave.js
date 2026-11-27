// Autosave berjadwal. Logika jadwal murni (mudah dites); penulisan ke folder lewat File System Access API.
//
// Jadwal: 'harian' (jam tertentu) | 'jam' (tiap N jam) | 'perubahan' (setiap ada perubahan, ditunda 1 menit)
// Batasan PWA: hanya jalan saat aplikasi terbuka; jadwal yang terlewat dikejar begitu aplikasi dibuka.

const MENIT = 60000;
const JAM = 3600000;
const HARI = 24 * JAM;

export const PILIHAN_SALINAN = [3, 7, 14, 30, 'semua'];

function slotHarian(jam, sekarang) {
  const [h, m] = (jam || '20:00').split(':').map(Number);
  const s = new Date(sekarang);
  s.setHours(h, m || 0, 0, 0);
  return s; // slot hari ini
}

/**
 * Kapan cadangan otomatis berikutnya jatuh tempo.
 * Bila sudah lewat (terlambat) hasilnya <= sekarang, artinya harus dikejar sekarang.
 * @param {object} a  pengaturan autosave
 * @param {Date|null} terakhir  waktu cadangan terakhir
 * @param {Date} sekarang
 * @param {Date|null} perubahanTerakhir  waktu data terakhir berubah
 * @returns {Date|null}  null = tidak ada yang perlu dijadwalkan
 */
export function jatuhTempo(a, terakhir, sekarang, perubahanTerakhir = null) {
  if (a.jadwal === 'perubahan') {
    if (!perubahanTerakhir) return null;
    if (terakhir && perubahanTerakhir <= terakhir) return null;
    return new Date(perubahanTerakhir.getTime() + MENIT);
  }
  if (a.jadwal === 'jam') {
    const n = Math.max(1, Number(a.tiapJam) || 6);
    return terakhir ? new Date(terakhir.getTime() + n * JAM) : new Date(sekarang);
  }
  const hariIni = slotHarian(a.jam, sekarang);
  const slotTerakhir = hariIni <= sekarang ? hariIni : new Date(hariIni.getTime() - HARI);
  if (!terakhir || terakhir < slotTerakhir) return slotTerakhir; // terlewat: kejar
  return new Date(slotTerakhir.getTime() + HARI);
}

export function perluCadangan(a, terakhir, sekarang, perubahanTerakhir = null) {
  if (!a.aktif) return false;
  const t = jatuhTempo(a, terakhir, sekarang, perubahanTerakhir);
  return !!t && t <= sekarang;
}

/** Teks spanduk beranda + apakah merah (jadwal terlewat lebih dari sehari). */
export function statusSpanduk(a, terakhir, sekarang, adaData = true) {
  if (!adaData && !terakhir) return { teks: 'Belum ada data untuk dicadangkan.', merah: false, tampil: false };
  if (!terakhir) return { teks: 'Belum pernah dicadangkan. Tekan Cadangkan sekarang.', merah: true, tampil: true };
  const sel = Math.floor((sekarang - terakhir) / HARI);
  const teks = sel <= 0 ? 'Cadangan terakhir: hari ini' : `Cadangan terakhir: ${sel} hari lalu`;
  // Slot PERTAMA yang terlewat sejak cadangan terakhir (bukan slot terbaru).
  let due;
  if (a.aktif && a.jadwal === 'jam') due = new Date(terakhir.getTime() + Math.max(1, Number(a.tiapJam) || 6) * JAM);
  else {
    const s = slotHarian(a.aktif && a.jadwal === 'harian' ? a.jam : '20:00', terakhir);
    due = s > terakhir ? s : new Date(s.getTime() + HARI);
  }
  const merah = sekarang - due > HARI;
  return { teks, merah, tampil: true };
}

/** Nama berkas yang harus dihapus agar tersisa `jumlah` salinan terbaru (nama berurut waktu). */
export function pangkasSalinan(namaBerkas, jumlah) {
  if (jumlah === 'semua') return [];
  const qmas = namaBerkas.filter((n) => /^qmas-\d{4}-\d{2}-\d{2}-\d{4}\.qmas$/.test(n)).sort();
  return qmas.slice(0, Math.max(0, qmas.length - Number(jumlah)));
}

// ---------- folder (File System Access API) ----------
export const dukungFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pilihFolder() {
  const h = await window.showDirectoryPicker({ id: 'qmas-cadangan', mode: 'readwrite', startIn: 'documents' });
  return h;
}

export async function izinFolder(handle, minta = false) {
  const opsi = { mode: 'readwrite' };
  if ((await handle.queryPermission(opsi)) === 'granted') return true;
  return minta ? (await handle.requestPermission(opsi)) === 'granted' : false;
}

export async function tulisKeFolder(handle, nama, bytes, salinan) {
  const f = await handle.getFileHandle(nama, { create: true });
  const w = await f.createWritable();
  await w.write(bytes);
  await w.close();
  const ada = [];
  for await (const [n] of handle.entries()) ada.push(n);
  for (const n of pangkasSalinan(ada, salinan)) {
    try { await handle.removeEntry(n); } catch { /* abaikan */ }
  }
}
