// PIN 4 angka. Hanya mengunci layar, BUKAN enkripsi data.
// Lokal per perangkat (tabel 'lokal'), tidak ikut berkas cadangan.
// Salah 5 kali: tunggu 1 menit. Lupa PIN: atur ulang dengan menempel kunci lisensi.

const enc = new TextEncoder();
export const MAKS_SALAH = 5;
export const TUNGGU_MS = 60000;

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function turunkan(pin, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256));
}

export const formatPinValid = (pin) => /^\d{4}$/.test(String(pin));

export async function adaPin(db) {
  return !!(await db.get('lokal', 'pin'));
}

export async function aturPin(db, pin) {
  if (!formatPinValid(pin)) throw new Error('PIN harus 4 angka');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await db.tulis([{ op: 'put', tabel: 'lokal', nilai: { k: 'pin', salt, hash: await turunkan(pin, salt), salah: 0, kunciSampai: 0 } }]);
}

/** @returns {{ok:boolean, tunggu?:number, sisa?:number}}  tunggu = detik sampai boleh coba lagi */
export async function cekPin(db, pin, sekarangMs = Date.now()) {
  const st = await db.get('lokal', 'pin');
  if (!st) return { ok: true };
  if (st.kunciSampai > sekarangMs) return { ok: false, tunggu: Math.ceil((st.kunciSampai - sekarangMs) / 1000) };
  if (formatPinValid(pin) && (await turunkan(pin, st.salt)) === st.hash) {
    await db.tulis([{ op: 'put', tabel: 'lokal', nilai: { ...st, salah: 0, kunciSampai: 0 } }]);
    return { ok: true };
  }
  const salah = (st.kunciSampai && st.kunciSampai <= sekarangMs ? 0 : st.salah) + 1;
  if (salah >= MAKS_SALAH) {
    await db.tulis([{ op: 'put', tabel: 'lokal', nilai: { ...st, salah: 0, kunciSampai: sekarangMs + TUNGGU_MS } }]);
    return { ok: false, tunggu: TUNGGU_MS / 1000 };
  }
  await db.tulis([{ op: 'put', tabel: 'lokal', nilai: { ...st, salah } }]);
  return { ok: false, sisa: MAKS_SALAH - salah };
}

/** Hapus PIN lama (dipakai setelah kunci lisensi terbukti sah). Pemanggil lalu meminta PIN baru. */
export async function hapusPin(db) {
  await db.tulis([{ op: 'del', tabel: 'lokal', key: 'pin' }]);
}
