// Layar data: Kunci PIN, kartu pengantar, Cadangkan, Pindah Perangkat, Pengaturan.

import { h, tombol, utama, kartu, kolomIsi, berhasil, gagal, konfirmasi, papanAngka, dialog } from './dom.js';
import { adaPin, aturPin, cekPin, hapusPin } from '../pin.js';
import { buatQmas, bacaQmas, pulihkan, namaBerkas, catatCadangan, QmasError } from '../backup.js';
import { simpanBerkas, pilihBerkas, diAPK } from '../platform.js';
import { dukungFolder, PILIHAN_SALINAN } from '../autosave.js';
import { periksa } from '../license.js';
import { formatGram, formatAngka, VERSI } from '../util.js';
import { BATAS_COBA } from '../store.js';

export const BANTUAN = {
  cadang: ['Cadangkan sekarang membuat satu berkas .qmas.', 'Pilih tujuan: folder, Google Drive, WhatsApp, atau flashdisk.', 'Simpan berkas di tempat lain selain perangkat ini.'],
  pindah: ['Di perangkat lama: Siapkan data, lalu kirim berkas .qmas.', 'Di perangkat baru: pasang aplikasi, Impor dari berkas.', 'Data, pengaturan, dan kunci lisensi ikut pindah. PIN dibuat baru.'],
  pengaturan: ['Tampilan: pilih Siang atau Malam.', 'Ukuran huruf bisa diperbesar.', 'Jadwal cadangan otomatis diatur di sini.', 'Tempel kunci lisensi untuk membuka mode penuh.'],
};

// ---------- PIN ----------
export async function layarKunci(ctx, { setelah }) {
  const { q } = ctx;
  const root = document.getElementById('app');
  const ada = await adaPin(q.db);
  let tahap = ada ? 'masuk' : 'buat';
  let pinBaru = '';
  const judul = h('h1', null);
  const pesan = h('p', { class: 'pesan', role: 'alert' });
  pesan.classList.add('sembunyi');
  let papan;
  const tampil = (t, jenis) => { pesan.textContent = t; pesan.className = `pesan ${jenis === 'merah' ? 'merah' : ''}${t ? '' : ' sembunyi'}`; };
  const wadah = h('div', { class: 'layar intro' });
  root.replaceChildren(wadah);

  function gambar() {
    papan?.lepas?.();
    judul.textContent = tahap === 'masuk' ? 'Masukkan PIN' : tahap === 'buat' ? 'Buat PIN 4 angka' : 'Ulangi PIN';
    papan = papanAngka({ panjang: 4, saat: onPin });
    wadah.replaceChildren(...[judul,
      tahap === 'buat' ? h('p', null, 'PIN ini dipakai setiap Q-mas dibuka kembali. Hanya mengunci layar.') : null,
      pesan, papan,
      tahap === 'masuk' ? tombol('Lupa PIN', lupa, 'abu') : null].filter(Boolean));
  }
  async function onPin(pin) {
    if (tahap === 'masuk') {
      const r = await cekPin(q.db, pin);
      if (r.ok) { papan.lepas(); return setelah(); }
      tampil(r.tunggu ? `Terlalu banyak salah. Tunggu ${r.tunggu} detik.` : `PIN salah. Sisa kesempatan ${r.sisa}.`, 'merah');
    } else if (tahap === 'buat') { pinBaru = pin; tahap = 'ulang'; tampil(''); gambar(); }
    else if (pin === pinBaru) { await aturPin(q.db, pin); papan.lepas(); setelah(); }
    else { tahap = 'buat'; gambar(); tampil('PIN tidak sama. Buat lagi dari awal.', 'merah'); }
  }
  function lupa() {
    dialog((tutup) => {
      const area = h('textarea', { rows: 4, placeholder: 'Tempel kunci lisensi di sini', 'aria-label': 'Kunci lisensi' });
      return h('div', { class: 'layar' }, h('p', { class: 'kalimat' }, 'Atur ulang PIN dengan kunci lisensi'),
        h('p', null, 'Belum punya kunci (mode coba)? Hapus data lalu pulihkan dari berkas cadangan.'), area,
        utama('Atur ulang PIN', async () => {
          const s = await periksa(area.value);
          if (!s.penuh) return gagal('Kunci lisensi tidak sah.');
          await hapusPin(q.db); tutup(); papan.lepas(); tahap = 'buat'; tampil(''); gambar();
        }), tombol('Tutup', tutup, 'abu'));
    });
  }
  gambar();
}

// ---------- Kartu pengantar ----------
export function layarPengantar(ctx, { setelah }) {
  const kartuList = [
    ['1', 'Data ada di perangkat ini', 'Tidak ada server. Jika perangkat hilang atau dibersihkan tanpa cadangan, data hilang.'],
    ['2', 'Cadangkan secara rutin', 'Tekan Cadangkan di beranda. Atur jadwal otomatis di Pengaturan.'],
    ['3', 'Satu tugas satu layar', 'Beranda punya lima tombol: Tutup buku, Tambah Barang, Stok, Penjualan, Cadangkan.'],
  ];
  let i = 0;
  const root = document.getElementById('app');
  const gambar = () => {
    const [n, j, t] = kartuList[i];
    root.replaceChildren(h('div', { class: 'layar intro' }, h('div', { class: 'angkakartu' }, n), h('h1', null, j), h('p', null, t),
      utama(i < 2 ? 'Lanjut' : 'Mulai pakai', () => { if (i < 2) { i++; gambar(); } else setelah(); }),
      i > 0 ? tombol('Kembali', () => { i--; gambar(); }, 'abu') : null));
  };
  gambar();
}

// ---------- Cadangkan ----------
export async function cadang(ctx) {
  const { q } = ctx;
  const p = await q.pengaturan();
  const node = h('div', { class: 'layar' });
  node.append(h('p', null, p.cadanganTerakhir ? `Cadangan terakhir: ${new Date(p.cadanganTerakhir).toLocaleString('id-ID')}` : 'Belum pernah dicadangkan.'),
    utama('Cadangkan sekarang', async () => {
      try {
        ctx.sibuk(true);
        const { bytes, manifest } = await buatQmas(q);
        const r = await simpanBerkas(bytes, namaBerkas());
        if (r === 'dibatalkan') return;
        await catatCadangan(q);
        berhasil(`Cadangan tersimpan: ${formatAngka(manifest.jumlahBarang)} barang. Simpan berkasnya juga di tempat lain.`);
        ctx.segarkan();
      } catch (e) { gagal(e.message); } finally { ctx.sibuk(false); }
    }, { class: 'btn utama besar' }),
    h('p', null, 'Pilih tujuan: folder di komputer, Google Drive, WhatsApp, atau flashdisk lewat menu bagikan.'),
    h('div', { class: 'dasar' }, h('button', { class: 'link', onclick: () => ctx.nav('/pindah') }, 'Pindah Perangkat')));
  return { judul: 'Cadangkan', node, bantuan: BANTUAN.cadang };
}

// ---------- Pindah Perangkat / Pulihkan ----------
export async function pindah(ctx) {
  const { q } = ctx;
  const node = h('div', { class: 'layar' });
  node.append(
    kartu(h('h2', null, 'Di perangkat lama'), h('p', null, 'Siapkan data lalu kirim berkas .qmas ke perangkat baru.'),
      utama('Siapkan data', async () => {
        try {
          ctx.sibuk(true);
          const { bytes } = await buatQmas(q);
          const r = await simpanBerkas(bytes, namaBerkas());
          if (r !== 'dibatalkan') { await catatCadangan(q); berhasil('Berkas siap. Kirim ke perangkat baru lewat WhatsApp, Drive, atau flashdisk.'); }
        } catch (e) { gagal(e.message); } finally { ctx.sibuk(false); }
      })),
    kartu(h('h2', null, 'Di perangkat baru'), h('p', null, 'Pasang aplikasi, buka, lalu pilih berkas .qmas. Seluruh data di perangkat ini akan diganti.'),
      utama('Impor dari berkas', () => impor(ctx))));
  return { judul: 'Pindah Perangkat', node, bantuan: BANTUAN.pindah };
}

async function impor(ctx) {
  const { q } = ctx;
  ctx.sibuk(true);
  let bytes;
  try { bytes = await pilihBerkas('.qmas,application/zip,application/octet-stream'); } finally { ctx.sibuk(false); }
  if (!bytes) return;
  let parsed;
  try { parsed = await bacaQmas(bytes); } catch (e) { return gagal(e instanceof QmasError ? e.message : 'Berkas tidak bisa dibaca.'); }
  const m = parsed.manifest;
  const ok = await konfirmasi(
    `Berkas tanggal ${new Date(m.tanggal).toLocaleString('id-ID')}: ${formatAngka(m.jumlahBarang)} barang, stok ${formatAngka(m.stokPcs)} pcs (${formatGram(m.stokMg)}). ` +
    'Data di perangkat ini akan DIGANTI. Sebuah cadangan pengaman dibuat dulu. Lanjutkan?', { ya: 'Ya, ganti data' });
  if (!ok) return;
  try {
    ctx.sibuk(true);
    const { pengaman, namaPengaman } = await pulihkan(q, parsed);
    ctx.catatPerubahan();
    await ctx.muatUlangPengaturan();
    berhasil('Data dipulihkan. Cadangan pengaman data lama tersimpan di perangkat ini.', {
      batalkan: null,
    });
    void pengaman; void namaPengaman;
    ctx.nav('/');
  } catch (e) { gagal('Pemulihan gagal: ' + e.message + ' Data lama tidak diubah.'); } finally { ctx.sibuk(false); }
}

// ---------- Pengaturan ----------
export async function pengaturan(ctx) {
  const { q } = ctx;
  const p = await q.pengaturan();
  const node = h('div', { class: 'layar' });
  const sim = async (patch) => { await q.ubahPengaturan(patch); ctx.catatPerubahan(); if (patch.autosave) await ctx.sinkronAutosave(); };

  const nama = h('input', { type: 'text', value: p.namaToko, maxLength: 60, onchange: (e) => sim({ namaToko: e.target.value.trim() }) });
  const awalan = h('input', { type: 'text', value: p.awalanKode, maxLength: 6, onchange: async (e) => { try { await sim({ awalanKode: e.target.value }); berhasil('Awalan kode disimpan.'); } catch (x) { gagal(x.message); } } });
  const huruf = h('div', { class: 'pilih' }, ...[['Normal', 'normal'], ['Besar', 'besar'], ['Sangat besar', 'sangat']].map(([t, v]) =>
    tombol(t, async () => { await sim({ ukuranHuruf: v }); ctx.terapkanHuruf(v); ctx.segarkan(); }, '', { 'aria-pressed': String(p.ukuranHuruf === v) })));

  const tema = h('div', { class: 'pilih dua' }, ...[['Siang', 'siang'], ['Malam', 'malam']].map(([t, v]) =>
    tombol(t, async () => { await sim({ tema: v }); ctx.terapkanTema(v); ctx.segarkan(); }, '', { 'aria-pressed': String(p.tema === v) })));

  const a = p.autosave;
  const simA = (patch) => sim({ autosave: { ...a, ...patch } });
  const jadwal = h('div', { class: 'pilih' }, ...[['Tiap hari', 'harian'], ['Tiap N jam', 'jam'], ['Setiap ada perubahan', 'perubahan']].map(([t, v]) =>
    tombol(t, async () => { await simA({ jadwal: v }); ctx.segarkan(); }, '', { 'aria-pressed': String(a.jadwal === v) })));
  const jam = h('input', { type: 'time', value: a.jam, onchange: (e) => simA({ jam: e.target.value || '20:00' }) });
  const tiapJam = h('input', { type: 'number', min: 1, max: 48, value: a.tiapJam, onchange: (e) => simA({ tiapJam: Math.max(1, Number(e.target.value) || 6) }) });
  const salinan = h('select', { onchange: (e) => simA({ salinan: e.target.value === 'semua' ? 'semua' : Number(e.target.value) }) },
    ...PILIHAN_SALINAN.map((n) => h('option', { value: n, selected: String(a.salinan) === String(n) }, n === 'semua' ? 'Semua' : `${n} salinan`)));
  const lokasi = diAPK()
    ? h('p', null, 'Lokasi: folder Dokumen/Q-mas di perangkat ini.')
    : dukungFolder()
      ? h('div', null, h('p', null, `Folder: ${a.namaLokasi || 'belum dipilih (bawaan Dokumen/Q-mas)'}`), tombol('Pilih folder', async () => { await ctx.pilihFolderAutosave(); ctx.segarkan(); }))
      : h('p', null, 'Browser ini tidak bisa memilih folder. Gunakan Chrome di komputer, atau pasang APK.');

  const kunci = h('textarea', { rows: 3, placeholder: 'Tempel kunci lisensi di sini', 'aria-label': 'Kunci lisensi' });
  const lis = ctx.lisensi;

  node.append(
    kartu(h('h2', null, 'Toko'), kolomIsi('Nama toko', nama), kolomIsi('Awalan kode barang', awalan, 'Contoh KNG. Dipakai untuk barang baru; kode lama tetap berlaku.')),
    kartu(h('h2', null, 'Tampilan'), tema),
    kartu(h('h2', null, 'Ukuran huruf'), huruf),
    kartu(h('h2', null, 'Cadangan otomatis'),
      h('label', { class: 'baris' }, h('input', { type: 'checkbox', checked: a.aktif, onchange: async (e) => { await simA({ aktif: e.target.checked }); ctx.segarkan(); } }), 'Hidupkan cadangan otomatis'),
      jadwal, a.jadwal === 'harian' ? kolomIsi('Jam', jam) : null, a.jadwal === 'jam' ? kolomIsi('Tiap berapa jam', tiapJam) : null,
      kolomIsi('Jumlah salinan disimpan', salinan), lokasi,
      h('small', null, 'Di Chrome, cadangan otomatis hanya jalan saat aplikasi terbuka dan izin folder perlu diberikan lagi setelah browser ditutup. Untuk HP, pakai APK.')),
    kartu(h('h2', null, 'Lisensi'), h('p', null, lis.penuh ? `${lis.pesan} ${lis.toko ? 'Atas nama ' + lis.toko + '.' : ''}` : `${lis.pesan} (batas ${BATAS_COBA} barang aktif)`),
      lis.penuh ? null : [kunci, utama('Aktifkan', async () => {
        const s = await periksa(kunci.value);
        if (!s.penuh) return gagal(s.salah ? s.pesan : 'Tempel kunci lisensi dulu.');
        await q.ubahPengaturan({ lisensi: kunci.value.replace(/\s+/g, '') });
        await ctx.muatUlangPengaturan();
        berhasil('Lisensi aktif. Semua fitur terbuka, selamanya.'); ctx.segarkan();
      })]),
    kartu(h('h2', null, 'PIN'), tombol('Ganti PIN', () => gantiPin(ctx), 'abu')),
    h('small', null, `Q-mas versi ${VERSI}. Hanya Android dan PC Windows (Chrome) yang didukung resmi.`));
  return { judul: 'Pengaturan', node, bantuan: BANTUAN.pengaturan };
}

function gantiPin(ctx) {
  let tahap = 'lama';
  let baru = '';
  dialog((tutup) => {
    const judul = h('p', { class: 'kalimat' }, 'Masukkan PIN lama');
    const wadah = h('div', { class: 'layar' });
    let papan;
    const gambar = () => {
      papan?.lepas();
      papan = papanAngka({ panjang: 4, saat: async (pin) => {
        if (tahap === 'lama') {
          const r = await cekPin(ctx.q.db, pin);
          if (!r.ok) return gagal(r.tunggu ? `Tunggu ${r.tunggu} detik.` : 'PIN lama salah.');
          tahap = 'baru'; judul.textContent = 'Masukkan PIN baru'; gambar();
        } else if (tahap === 'baru') { baru = pin; tahap = 'ulang'; judul.textContent = 'Ulangi PIN baru'; gambar(); }
        else if (pin === baru) { await aturPin(ctx.q.db, pin); papan.lepas(); tutup(); berhasil('PIN diganti.'); }
        else { tahap = 'baru'; judul.textContent = 'Tidak sama. Masukkan PIN baru'; gambar(); }
      } });
      wadah.replaceChildren(judul, papan, tombol('Tutup', () => { papan.lepas(); tutup(); }, 'abu'));
    };
    gambar();
    return wadah;
  });
}
