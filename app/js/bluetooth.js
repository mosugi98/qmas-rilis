// Kirim byte ESC/POS ke printer Bluetooth lewat Web Bluetooth (Chrome di Android dan komputer).
//
// BATASAN PENTING: Web Bluetooth hanya bisa bicara dengan perangkat Bluetooth Low Energy (BLE).
// Kebanyakan printer thermal murah memakai Bluetooth KLASIK (SPP): printer itu TIDAK muncul di daftar
// pilihan browser dan tidak bisa dijangkau dari sini. Untuk itu pakai menu cetak Android (Cetak langsung)
// atau Simpan PDF. Di APK (WebView) Web Bluetooth tidak tersedia.
//
// Setiap langkah dan setiap kegagalan dilaporkan ke pemanggil; tidak ada hasil yang diam-diam.

import { diAPK } from './platform.js';

// Layanan BLE yang lazim dipakai printer thermal (harus didaftarkan agar boleh diakses)
const LAYANAN = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

export const bisaBluetooth = () => typeof navigator !== 'undefined' && !!navigator.bluetooth && !diAPK();

export class BluetoothError extends Error {}

const tunggu = (ms) => new Promise((ok) => setTimeout(ok, ms));
const dalamBatas = (janji, ms, pesan) => Promise.race([janji, new Promise((_, gagal) => setTimeout(() => gagal(new BluetoothError(pesan)), ms))]);

export const PESAN_KOSONG =
  'Tidak ada printer yang dipilih. Jika daftar printer kosong, printer Anda kemungkinan memakai Bluetooth klasik ' +
  '(bukan BLE) sehingga tidak bisa dipakai dari browser. Pakai Cetak langsung (menu cetak Android) atau Simpan PDF.';

/** Mengubah galat browser menjadi kalimat yang bisa ditindaklanjuti. */
export function jelaskanGalat(e) {
  if (e instanceof BluetoothError) return e.message;
  switch (e?.name) {
    case 'NotAllowedError': return 'Izin Bluetooth ditolak atau tidak diberikan. Izinkan Bluetooth dan "Perangkat di sekitar", lalu hidupkan Lokasi (GPS) di HP.';
    case 'SecurityError': return 'Bluetooth hanya bisa dipakai lewat alamat aman (https). Buka Q-mas dari alamat resminya.';
    case 'NetworkError': return 'Gagal tersambung ke printer. Dekatkan HP, pastikan printer menyala, dan tidak sedang tersambung ke HP atau aplikasi lain.';
    case 'NotSupportedError': return 'Browser atau printer ini tidak mendukung sambungan Bluetooth tersebut. Pakai Cetak langsung atau Simpan PDF.';
    case 'InvalidStateError': return 'Sambungan Bluetooth terputus di tengah jalan. Coba lagi.';
    default: return `${e?.name || 'Galat'}: ${e?.message || 'tidak diketahui'}`;
  }
}

/**
 * Pilih printer lalu kirim data. Mengembalikan {status:'terkirim'|'dibatalkan', nama}. Melempar Error berpesan jelas.
 * @param {(teks:string)=>void} saatStatus  dipanggil di setiap langkah agar pengguna melihat apa yang terjadi
 */
export async function kirimKePrinter(bytes, saatStatus = () => {}) {
  if (!bisaBluetooth()) throw new BluetoothError('Browser ini tidak mendukung Bluetooth. Pakai Chrome di HP Android atau komputer.');
  if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) {
    throw new BluetoothError('Bluetooth di perangkat ini mati atau tidak tersedia. Hidupkan Bluetooth dan Lokasi (GPS), lalu coba lagi.');
  }

  saatStatus('Membuka daftar printer. Pilih printer Anda di jendela yang muncul…');
  let perangkat;
  try {
    perangkat = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: LAYANAN });
  } catch (e) {
    if (e.name === 'NotFoundError' || e.name === 'AbortError') return { status: 'dibatalkan', nama: '' };
    throw new BluetoothError(jelaskanGalat(e));
  }

  const nama = perangkat.name || 'printer tanpa nama';
  try {
    saatStatus(`Menyambung ke ${nama}…`);
    const server = await dalamBatas(perangkat.gatt.connect(), 15000, `Tidak bisa tersambung ke ${nama} dalam 15 detik. Dekatkan HP dan pastikan printer tidak sedang dipakai perangkat lain.`);

    saatStatus('Mencari jalur kirim data…');
    let karakter = null;
    let jumlahLayanan = 0;
    for (const s of await server.getPrimaryServices()) {
      jumlahLayanan++;
      for (const c of await s.getCharacteristics()) {
        if (c.properties.writeWithoutResponse || c.properties.write) { karakter = c; break; }
      }
      if (karakter) break;
    }
    if (!karakter) {
      throw new BluetoothError(`Tersambung ke ${nama} (${jumlahLayanan} layanan) tetapi tidak ada jalur kirim data yang dikenali. Printer ini tidak cocok dengan cara ini; pakai Cetak langsung atau Simpan PDF.`);
    }

    const potong = 100;
    for (let i = 0; i < bytes.length; i += potong) {
      const bagian = bytes.subarray(i, i + potong);
      if (karakter.properties.writeWithoutResponse) await karakter.writeValueWithoutResponse(bagian);
      else await karakter.writeValue(bagian);
      saatStatus(`Mengirim ke ${nama}… ${Math.round((Math.min(i + potong, bytes.length) / bytes.length) * 100)}%`);
      await tunggu(25);
    }
    return { status: 'terkirim', nama };
  } catch (e) {
    throw new BluetoothError(jelaskanGalat(e));
  } finally {
    try { perangkat.gatt.disconnect(); } catch { /* abaikan */ }
  }
}
