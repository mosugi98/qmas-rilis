// Penghubung ke perangkat: simpan/bagikan berkas, folder autosave, ekspor CSV, penanda PWA/APK.
// Di APK (Capacitor) memakai plugin Filesystem dan Share; di Chrome memakai File System Access API
// dan menu bagikan bila ada.

export const diAPK = () => !!(window.Capacitor && window.Capacitor.isNativePlatform?.());

function keBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Simpan berkas ke tujuan pilihan pengguna.
 * @returns {Promise<'dibagikan'|'disimpan'|'dibatalkan'>}
 */
export async function simpanBerkas(bytes, nama, tipe = 'application/octet-stream') {
  const P = window.Capacitor?.Plugins;
  if (diAPK() && P?.Filesystem && P?.Share) {
    const w = await P.Filesystem.writeFile({ path: `Q-mas/${nama}`, data: keBase64(bytes), directory: 'CACHE', recursive: true });
    try { await P.Share.share({ title: nama, url: w.uri, dialogTitle: 'Pilih tujuan' }); return 'dibagikan'; } catch { return 'dibatalkan'; }
  }
  const file = new File([bytes], nama, { type: tipe });
  if (navigator.canShare?.({ files: [file] }) && /Android|Mobile/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: nama }); return 'dibagikan'; } catch (e) { if (e.name === 'AbortError') return 'dibatalkan'; }
  }
  if ('showSaveFilePicker' in window) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: nama });
      const w = await h.createWritable(); await w.write(bytes); await w.close();
      return 'disimpan';
    } catch (e) { if (e.name === 'AbortError') return 'dibatalkan'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'disimpan';
}

/** Pilih berkas dari perangkat. */
export function pilihBerkas(terima) {
  return new Promise((ok) => {
    const i = document.createElement('input');
    i.type = 'file';
    if (terima) i.accept = terima;
    i.onchange = async () => ok(i.files[0] ? new Uint8Array(await i.files[0].arrayBuffer()) : null);
    i.oncancel = () => ok(null);
    i.click();
  });
}

// ---------- CSV (dibuka Excel) ----------
export function keCSV(baris) {
  if (!baris.length) return '';
  const kolom = Object.keys(baris[0]);
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Titik koma sebagai pemisah dan BOM agar Excel (lokal Indonesia) membuka dengan benar.
  return '﻿' + [kolom.join(';'), ...baris.map((r) => kolom.map((k) => esc(typeof r[k] === 'number' ? String(r[k]).replace('.', ',') : r[k])).join(';'))].join('\r\n');
}

export const bytesCSV = (baris) => new TextEncoder().encode(keCSV(baris));

// ---------- PWA ----------
let promptPasang = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptPasang = e; window.dispatchEvent(new Event('qmas-bisa-pasang')); });
}
export const bisaPasang = () => !!promptPasang;
export async function pasang() {
  if (!promptPasang) return false;
  promptPasang.prompt();
  const r = await promptPasang.userChoice;
  promptPasang = null;
  return r.outcome === 'accepted';
}
export const sudahTerpasang = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
