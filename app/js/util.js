// Utilitas umum: tanggal lokal, berat (miligram bulat), rupiah, kadar.
// Berat disimpan sebagai bilangan bulat miligram agar tepat sampai 0,001 g (tanpa galat desimal).

export const JENIS = ['Cincin', 'Kalung', 'Gelang', 'Anting', 'Liontin', 'Lainnya'];
export const KODE_JENIS = { Cincin: 'CIN', Kalung: 'KAL', Gelang: 'GEL', Anting: 'ANT', Liontin: 'LIO', Lainnya: 'LNY' };
export const KADAR_UMUM = ['16K', '18K', '20K', '22K'];
const PERSEN_KADAR = { '16K': '70%', '18K': '75%', '20K': '87.5%', '22K': '91.6%' };
/** '16K' -> '70% (16K)'. Kadar lain apa adanya. */
export const labelKadar = (k) => (PERSEN_KADAR[k] ? `${PERSEN_KADAR[k]} (${k})` : k);
export const VERSI = '3.0.0';

const dua = (n) => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' menurut jam lokal perangkat. */
export function tglLokal(d = new Date()) {
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

/** Date -> 'YYYY-MM-DDTHH:MM:SS' menurut jam lokal (dipakai sebagai waktu transaksi). */
export function waktuLokal(d = new Date()) {
  return `${tglLokal(d)}T${dua(d.getHours())}:${dua(d.getMinutes())}:${dua(d.getSeconds())}`;
}

export function tambahHari(tgl, n) {
  const [y, m, d] = tgl.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${dua(dt.getUTCMonth() + 1)}-${dua(dt.getUTCDate())}`;
}

export function selisihHari(a, b) {
  const t = (s) => Date.UTC(...s.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  return Math.round((t(b) - t(a)) / 86400000);
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function tglPanjang(tgl) {
  const [y, m, d] = tgl.split('-').map(Number);
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${hari}, ${d} ${BULAN[m - 1]} ${y}`;
}

/** '3,5' | '3.5' | '10' -> miligram bulat. Melempar Error bila bukan angka positif. */
export function parseBeratMg(teks) {
  const t = String(teks ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) throw new Error('Berat harus berupa angka, paling banyak 3 angka di belakang koma (contoh 3,5)');
  const [bulat, pecah = ''] = t.split('.');
  const mg = Number(bulat) * 1000 + Number(pecah.padEnd(3, '0'));
  if (mg <= 0) throw new Error('Berat harus lebih dari 0');
  return mg;
}

/** 3500 -> '3,5'; 10000 -> '10'; 800 -> '0,8'. */
export function formatBerat(mg) {
  const neg = mg < 0;
  const a = Math.abs(Math.round(mg));
  const bulat = Math.floor(a / 1000);
  const pecah = String(a % 1000).padStart(3, '0').replace(/0+$/, '');
  const ribuan = String(bulat).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + ribuan + (pecah ? ',' + pecah : '');
}

export const formatGram = (mg) => `${formatBerat(mg)} g`;

export function formatAngka(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatRp(n) {
  return (n < 0 ? '-Rp ' : 'Rp ') + formatAngka(Math.abs(n));
}

export function normalisasiKadar(v) {
  const t = String(v ?? '').trim().toUpperCase();
  if (!/^\d{1,2}K$/.test(t)) throw new Error('Kadar tidak valid (contoh: 24K, 22K, 18K)');
  return t;
}

/** Harga satu barang: berat (mg) x harga per gram, dibulatkan ke rupiah, ditambah ongkos. */
export function hargaBarang(beratMg, hargaPerGram, ongkos = 0) {
  return Math.round((beratMg * hargaPerGram) / 1000) + (ongkos || 0);
}
