// Layar Stok (buku stok harian + daftar barang), Cek Stok Fisik, riwayat barang, Riwayat Penjualan.

import { h, tombol, utama, kartu, kolomIsi, berhasil, gagal, konfirmasi } from './dom.js';
import { ikon } from './ikon.js';
import { formatGram, formatBerat, formatAngka, tglPanjang } from '../util.js';
import { filterBuku, bukuKeBaris } from '../ledger.js';
import { bip, mulaiKamera } from '../scanner.js';
import { simpanBerkas, bytesCSV } from '../platform.js';
import { ALASAN_KOREKSI } from '../store.js';

export const BANTUAN = {
  stok: ['Tabel menunjukkan satu baris per hari: awal, masuk, terjual, koreksi, akhir.', 'Ketuk satu hari untuk melihat barang di baliknya.', 'Ketuk Daftar Barang untuk mencari barang.'],
  cek: ['Tekan Mulai hitung, lalu scan semua barang yang ada di etalase.', 'Tekan Selesai hitung untuk melihat yang belum ketemu.', 'Barang yang belum ketemu bisa ditandai hilang.'],
  riwayat: ['Daftar penjualan per hari.', 'Tekan Batalkan bila ada kesalahan; barang kembali ada.'],
  barang: ['Riwayat satu barang: kapan masuk dan terjual.'],
};

const sel = (v) => h('td', null, formatAngka(v));

// ---------- Stok ----------
export async function stok(ctx, param) {
  const { q } = ctx;
  const node = h('div', { class: 'layar' });
  const mode = param === 'daftar' ? 'daftar' : 'buku';
  const tab = h('div', { class: 'segmen' },
    tombol('Buku Stok Harian', () => ctx.nav('/stok'), '', { 'aria-pressed': String(mode === 'buku') }),
    tombol('Daftar Barang', () => ctx.nav('/stok/daftar'), '', { 'aria-pressed': String(mode === 'daftar') }));
  node.append(tab);

  if (mode === 'daftar') {
    const semua = (await q.barangSemua()).sort((a, b) => (a.kode < b.kode ? -1 : 1));
    const cari = h('input', { type: 'search', placeholder: 'Cari kode, jenis, atau kadar…', autocomplete: 'off', 'aria-label': 'Cari barang' });
    const filter = h('div', { class: 'segmen' });
    let status = 'ada';
    const MAKS = 500; // batas label sekali cetak
    const dipilih = new Set(); // pilihan bertahan walau filter atau pencarian berubah
    let terkini = [];
    const lis = h('ul', { class: 'daftar' });
    const btnSemua = tombol([ikon('pilihsemua', 22), 'Pilih semua yang tampil'], () => {
      for (const b of terkini) { if (dipilih.size >= MAKS) { gagal(`Maksimal ${MAKS} label sekali cetak.`); break; } dipilih.add(b.kode); }
      gambar();
    }, 'abu penuh');
    const jumlahDipilih = h('span');
    const btnCetak = utama([ikon('printer', 22), 'Cetak label'], () => { ctx.labelBaru = [...dipilih].sort(); ctx.nav('/label'); }, { class: 'btn utama penuh' });
    const aksi = h('div', { class: 'aksipilih', hidden: true, role: 'region', 'aria-label': 'Aksi untuk barang terpilih' },
      h('div', { class: 'ringkasan' }, jumlahDipilih, tombol('Kosongkan', () => { dipilih.clear(); gambar(); }, 'abu kecil')),
      btnCetak);

    function ubah(kode) {
      if (dipilih.has(kode)) dipilih.delete(kode);
      else if (dipilih.size >= MAKS) return gagal(`Maksimal ${MAKS} label sekali cetak.`);
      else dipilih.add(kode);
      gambar();
    }

    const gambar = () => {
      filter.replaceChildren(...[['Ada', 'ada'], ['Terjual', 'terjual'], ['Hilang', 'hilang'], ['Semua', 'semua']].map(([t, v]) =>
        tombol(t, () => { status = v; gambar(); }, '', { 'aria-pressed': String(status === v) })));
      const t = cari.value.trim().toUpperCase();
      const daftar = semua.filter((b) => (status === 'semua' || b.status === status) 
        && (!t || `${b.kode} ${b.jenis} ${b.kadar}`.toUpperCase().includes(t)));
      terkini = daftar;
      btnSemua.disabled = !daftar.length;
      btnSemua.replaceChildren(ikon('pilihsemua', 22), `Pilih semua yang tampil (${formatAngka(daftar.length)})`);
      lis.replaceChildren(...daftar.slice(0, 200).map((b) => {
        const aktif = dipilih.has(b.kode);
        return h('li', {
          class: `pilihan${aktif ? ' terpilih' : ''}`, role: 'checkbox', 'aria-checked': String(aktif), tabindex: 0,
          onclick: () => ubah(b.kode),
          onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ubah(b.kode); } },
        },
        h('div', { class: 'isi' }, h('span', { class: 'kotak' }, ikon('centang', 18)),
          h('div', null, h('div', { class: 'kode' }, b.kode), h('small', null, `${b.jenis} · ${b.kadar} · ${formatGram(b.beratMg)}`))),
        h('div', { class: 'baris rapat' },
          h('span', { class: `chip ${b.status === 'ada' ? 'ok' : b.status === 'hilang' ? 'merah' : ''}` }, b.status),
          tombol([ikon('panah', 20)], (e) => { e.stopPropagation(); ctx.nav('/barang/' + encodeURIComponent(b.kode)); }, 'abu kecil', { 'aria-label': `Lihat riwayat ${b.kode}` })));
      }));
      if (daftar.length > 200) lis.append(h('li', null, `Menampilkan 200 dari ${formatAngka(daftar.length)}. Persempit pencarian, atau pakai Pilih semua.`));
      if (!daftar.length) lis.append(h('li', null, 'Tidak ada barang.'));
      aksi.hidden = dipilih.size === 0;
      jumlahDipilih.textContent = `${formatAngka(dipilih.size)} barang dipilih`;
      btnCetak.replaceChildren(ikon('printer', 22), `Cetak label (${formatAngka(dipilih.size)})`);
    };
    cari.addEventListener('input', gambar);
    node.append(cari, filter, btnSemua, lis, aksi);
    gambar();
    ctx.saatScan = (kode) => ctx.nav('/barang/' + encodeURIComponent(kode));
  } else {
    const buku = await q.bukuStok();
    const hariIni = q.hariIni();
    let rentang = 'bulan';
    const filterEl = h('div', { class: 'pilih' });
    const tabel = h('div', { class: 'gulir' });
    const gambar = () => {
      filterEl.replaceChildren(...[['7 hari', 'minggu'], ['30 hari', 'bulan'], ['Semua', 'semua']].map(([t, v]) =>
        tombol(t, () => { rentang = v; gambar(); }, '', { 'aria-pressed': String(rentang === v) })));
      const rows = filterBuku(buku, rentang, hariIni).slice().reverse();
      if (!rows.length) { tabel.replaceChildren(h('p', null, 'Belum ada data. Mulai dengan Tambah Barang.')); return; }
      tabel.replaceChildren(h('table', { class: 'buku' },
        h('thead', null, h('tr', null, ['Tanggal', 'Awal', 'Masuk', 'Jual', 'Kor.', 'Akhir'].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map((r) => h('tr', { class: r.tanggal === hariIni ? 'hariini' : '', tabindex: 0, onclick: () => ctx.nav('/hari/' + r.tanggal), onkeydown: (e) => { if (e.key === 'Enter') ctx.nav('/hari/' + r.tanggal); } },
          h('td', null, r.tanggal.slice(5).split('-').reverse().join('/')),
          sel(r.awal.pcs), sel(r.masuk.pcs), sel(r.terjual.pcs), sel(r.koreksi.pcs), sel(r.akhir.pcs))))),
        h('small', null, 'Angka dalam pcs. Ketuk satu hari untuk melihat gram dan barangnya.'));
    };
    node.append(filterEl, tabel, h('h2', null, 'Laporan untuk Excel'),
      tombol('Simpan Buku Stok (Excel/CSV)', async () => { await simpanBerkas(bytesCSV(bukuKeBaris(filterBuku(buku, rentang, hariIni))), `buku-stok-${hariIni}.csv`, 'text/csv'); }),
      tombol('Simpan Daftar Stok (Excel/CSV)', async () => {
        const semua = await q.barangSemua();
        await simpanBerkas(bytesCSV(semua.map((b) => ({ Kode: b.kode, Jenis: b.jenis, Kadar: b.kadar, 'Berat (g)': b.beratMg / 1000, Status: b.status, Sumber: b.sumber, 'Tanggal masuk': b.tglMasuk, 'Tanggal terjual': b.tglTerjual || '' }))), `stok-${hariIni}.csv`, 'text/csv');
      }),
      tombol('Simpan Penjualan (Excel/CSV)', async () => {
        const n = (await q.riwayatPenjualan()).filter((x) => !x.batal);
        await simpanBerkas(bytesCSV(n.flatMap((x) => x.baris.map((l) => ({ Waktu: x.waktu, Kode: l.kode, Kadar: l.kadar, 'Berat (g)': l.beratMg / 1000 })))), `penjualan-${hariIni}.csv`, 'text/csv');
      }));
    gambar();
    ctx.saatScan = (kode) => ctx.nav('/barang/' + encodeURIComponent(kode));
  }
  return { judul: 'Stok', node, bantuan: BANTUAN.stok };
}

export async function hari(ctx, tgl) {
  const { q } = ctx;
  const buku = (await q.bukuStok()).find((r) => r.tanggal === tgl);
  const rinci = await q.rincianHari(tgl);
  const node = h('div', { class: 'layar' });
  if (buku) {
    node.append(kartu(
      h('div', null, `Stok awal: ${formatAngka(buku.awal.pcs)} pcs · ${formatGram(buku.awal.mg)}`),
      h('div', null, `Masuk: ${formatAngka(buku.masuk.pcs)} pcs · ${formatGram(buku.masuk.mg)}`),
      h('div', null, `Terjual: ${formatAngka(buku.terjual.pcs)} pcs · ${formatGram(buku.terjual.mg)}`),
      h('div', null, `Koreksi: ${formatAngka(buku.koreksi.pcs)} pcs · ${formatGram(buku.koreksi.mg)}`),
      h('b', null, `Stok akhir: ${formatAngka(buku.akhir.pcs)} pcs · ${formatGram(buku.akhir.mg)}`)));
  }
  const bagian = (judul, arr, ekstra) => arr.length ? [h('h2', null, `${judul} (${arr.length})`),
    h('ul', { class: 'daftar' }, arr.map((b) => h('li', { class: 'klik', onclick: () => ctx.nav('/barang/' + encodeURIComponent(b.kode)) },
      h('div', null, h('div', { class: 'kode' }, b.kode), h('small', null, `${b.jenis} · ${b.kadar} · ${formatGram(b.beratMg)}${ekstra ? ' · ' + ekstra(b) : ''}`)))))] : [];
  node.append(...bagian('Masuk', rinci.masuk), ...bagian('Terjual', rinci.terjual), ...bagian('Koreksi', rinci.koreksi, (b) => b.alasan));
  return { judul: tglPanjang(tgl), node, bantuan: BANTUAN.stok };
}

// ---------- Riwayat satu barang ----------
export async function barang(ctx, kodeEnc) {
  const { q } = ctx;
  const kode = decodeURIComponent(kodeEnc);
  const r = await q.riwayatBarang(kode);
  const node = h('div', { class: 'layar' });
  if (!r) {
    bip('asing');
    node.append(h('div', { class: 'pesan merah' }, `Kode ${kode} tidak dikenal.`));
    return { judul: 'Barang', node, bantuan: BANTUAN.barang };
  }
  const b = r.barang;
  node.append(kartu(h('div', { class: 'kode' }, b.kode), h('div', null, `${b.jenis} · ${b.kadar} · ${formatGram(b.beratMg)}`),
    h('div', null, `Status: ${b.status}`), h('div', null, `Masuk: ${b.tglMasuk} (${b.sumber === 'pelanggan' ? 'dari pelanggan' : 'stok baru'})`),
    b.tglTerjual ? h('div', null, `Terjual: ${b.tglTerjual}`) : null, b.catatan ? h('div', null, `Catatan: ${b.catatan}`) : null));
  if (r.penjualan.length) node.append(h('h2', null, 'Penjualan'), h('ul', { class: 'daftar' }, r.penjualan.map((n) => h('li', null,
    h('div', null, n.waktu.replace('T', ' ')), n.batal ? h('span', { class: 'chip merah' }, 'batal') : null))));
  node.append(tombol([ikon('printer', 22), 'Cetak barcode'], () => { ctx.labelBaru = null; ctx.nav('/label/' + encodeURIComponent(b.kode)); }));
  if (b.status === 'ada') {
    node.append(tombol([ikon('hapus', 22), 'Hapus barang ini (salah input)'], async () => {
      if (!(await konfirmasi(`Hapus ${b.kode} dari stok? Barang dihapus seluruhnya dari stok dan Buku Stok. Nomor kodenya tidak dipakai lagi. Jika labelnya sudah tercetak, buang labelnya.`, { ya: 'Ya, hapus' }))) return;
      try { await q.hapusBarang(b.kode); ctx.catatPerubahan(); berhasil(`${b.kode} dihapus.`); ctx.nav('/stok/daftar'); } catch (e) { gagal(e.message); }
    }, 'bahaya'));
  }
  if (b.status === 'terjual') {
    // Barang tercatat terjual tetapi ternyata masih ada (mis. salah scan saat menjual): batalkan nota penjualannya.
    const nota = r.penjualan.filter((n) => !n.batal).at(-1);
    if (nota) {
      node.append(h('div', { class: 'pesan' }, ikon('awas'), h('span', null, 'Barang ini tercatat terjual. Bila barangnya ternyata masih ada, penjualan itu salah dan bisa dibatalkan.')),
        tombol([ikon('urung', 22), 'Batalkan penjualan ini'], async () => {
          const lengkap = (await q.riwayatPenjualan()).find((x) => x.id === nota.id);
          const jml = lengkap?.baris.length || 1;
          if (!(await konfirmasi(`Batalkan penjualan (${jml} barang)? SEMUA barang di nota itu kembali ada di stok.`, { ya: 'Ya, batalkan penjualan' }))) return;
          try { await q.batalkanPenjualan(nota.id); ctx.catatPerubahan(); berhasil('Penjualan dibatalkan. Barang kembali ada.'); ctx.segarkan(); } catch (e) { gagal(e.message); }
        }, 'bahaya'));
    }
  }
  return { judul: 'Riwayat Barang', node, bantuan: BANTUAN.barang };
}

// ---------- Riwayat Penjualan ----------
export async function riwayat(ctx) {
  const { q } = ctx;
  const semua = (await q.riwayatPenjualan()).slice(0, 200);
  const node = h('div', { class: 'layar' });
  if (!semua.length) node.append(h('p', null, 'Belum ada penjualan.'));
  let tgl = '';
  for (const n of semua) {
    if (n.tanggal !== tgl) { tgl = n.tanggal; node.append(h('h2', null, tglPanjang(tgl))); }
    node.append(kartu(
      h('div', { class: 'baris' }, h('b', null, n.waktu.slice(11, 16)), h('b', null, `${n.baris.length} barang`), n.batal ? h('span', { class: 'chip merah' }, 'BATAL') : null),
      h('small', null, `${n.baris.map((l) => l.kode).join(', ')}`),
      n.batal ? null : tombol('Batalkan', async () => {
        if (!(await konfirmasi(`Batalkan penjualan (${n.baris.length} barang)? Barang kembali ada di stok.`, { ya: 'Ya, batalkan' }))) return;
        try { await q.batalkanPenjualan(n.id); ctx.catatPerubahan(); berhasil('Penjualan dibatalkan. Barang kembali ada.'); ctx.segarkan(); } catch (e) { gagal(e.message); }
      }, 'bahaya')));
  }
  return { judul: 'Riwayat Penjualan', node, bantuan: BANTUAN.riwayat };
}

// ---------- Cek Stok Fisik ----------
export const detailBarang = (b) => (b ? `${b.jenis} · ${b.kadar} · ${formatGram(b.beratMg)}` : '');

/** Satu baris produk: kode tebal + keterangan, dengan ruang untuk tombol di kanan. */
export const barisProduk = (kode, b, ...kanan) => h('li', null,
  h('div', { style: 'min-width:0' }, h('div', { class: 'kode' }, kode), h('small', null, detailBarang(b) + (b?.tglMasuk ? ` · masuk ${b.tglMasuk}` : ''))),
  h('div', { class: 'baris rapat' }, ...kanan));

export async function cek(ctx) {
  const { q } = ctx;
  const node = h('div', { class: 'layar' });
  const berjalan = await q.hitunganBerjalan();

  if (!berjalan) {
    const lama = (await q.daftarHitungan()).filter((x) => x.jenis !== 'tutup');
    node.append(h('p', null, 'Scan semua barang yang ada, lalu lihat produk mana yang belum ketemu, lengkap dengan kodenya.'),
      utama([ikon('cek', 24), 'Mulai hitung'], async () => { await q.mulaiHitung(); ctx.segarkan(); }));
    if (lama.length) {
      node.append(h('h2', null, 'Hitungan sebelumnya'), h('ul', { class: 'daftar' }, lama.slice(0, 10).map((x) => h('li', { class: 'klik', onclick: () => ctx.nav('/hasil/' + x.id) },
        h('span', null, x.selesai.replace('T', ' ').slice(0, 16)),
        x.hasil.belum.length ? h('span', { class: 'chip amber' }, `${x.hasil.belum.length} belum ketemu`) : h('span', { class: 'chip ok' }, 'semua ketemu')))));
    }
    ctx.saatScan = (kode) => ctx.nav('/barang/' + encodeURIComponent(kode));
    return { judul: 'Cek Stok Fisik', node, bantuan: BANTUAN.cek };
  }

  const semua = new Map((await q.barangSemua()).map((b) => [b.kode, b]));
  const hitungEl = h('div', { class: 'hitungan' });
  const pesanEl = h('div', { class: 'pindaian', 'aria-live': 'polite' }, ikon('cari'), 'Scan barang satu per satu.');
  const usulEl = h('div', { class: 'kombo' });
  const kameraBox = h('div');
  const daftarSudah = h('ul', { class: 'daftar' });
  const daftarBelum = h('ul', { class: 'daftar' });
  const sumSudah = h('summary');
  const sumBelum = h('summary');
  let tutupKamera = null;

  async function segarkanDaftar() {
    const cur = await q.hitunganBerjalan();
    const belum = await q.belumDiscan();
    hitungEl.replaceChildren(h('div', { class: 'total' }, `${cur.dipindai.length} discan`), h('small', null, `${belum.length} belum discan`));
    sumSudah.textContent = `Sudah discan (${cur.dipindai.length})`;
    sumBelum.textContent = `Belum discan (${belum.length})`;
    daftarSudah.replaceChildren(...[...cur.dipindai].reverse().slice(0, 100).map((kode) => {
      const b = semua.get(kode);
      const ok = b && b.status === 'ada';
      return barisProduk(kode, b,
        h('span', { class: `chip ${ok ? 'ok' : 'merah'}` }, ok ? 'cocok' : b ? `tercatat ${b.status}` : 'tidak dikenal'),
        tombol([ikon('silang', 18)], async () => { await q.lepasPindaian(kode); await segarkanDaftar(); }, 'abu kecil', { 'aria-label': `Hapus pindaian ${kode}` }));
    }));
    daftarBelum.replaceChildren(...belum.slice(0, 150).map((b) => barisProduk(b.kode, b)),
      belum.length > 150 ? h('li', null, `Dan ${belum.length - 150} barang lainnya. Semuanya tampil di hasil setelah Selesai hitung.`) : null,
      !belum.length ? h('li', null, 'Semua barang yang tercatat sudah discan.') : null);
  }

  async function pindai(kodeMentah) {
    try {
      const r = await q.pindaiHitungRinci(kodeMentah);
      const kode = r.kode;
      bip(r.hasil === 'baru' ? 'ok' : r.hasil === 'sudah' ? 'sudah' : 'asing');
      usulEl.replaceChildren();
      if (r.hasil === 'baru') pesanEl.replaceChildren(ikon('centang'), `${kode} · ${detailBarang(r.barang)}`);
      else if (r.hasil === 'sudah') pesanEl.replaceChildren(ikon('riwayat'), `Sudah discan: ${kode}`);
      else if (r.kategori === 'terjual') {
        pesanEl.replaceChildren(ikon('awas'), `${kode} tercatat TERJUAL tetapi barangnya ada di tangan Anda. Periksa penjualannya.`);
        usulEl.append(tombol('Periksa penjualan', () => ctx.nav('/barang/' + encodeURIComponent(kode)), 'kecil'));
      } else if (r.kategori === 'hilang') {
        pesanEl.replaceChildren(ikon('awas'), `${kode} tercatat HILANG tetapi ketemu. Bisa dikembalikan di hasil.`);
      } else {
        pesanEl.replaceChildren(ikon('silang'), `${kode} tidak dikenal.${r.mirip.length ? ' Mungkin salah baca. Maksud Anda:' : ''}`);
        for (const m of r.mirip) {
          usulEl.append(tombol([ikon('centang', 18), m], async () => {
            await q.lepasPindaian(kode);
            await pindai(m);
          }, 'kecil'));
        }
      }
      await segarkanDaftar();
    } catch (e) { gagal(e.message); }
  }

  ctx.saatScan = pindai;
  ctx.saatTutup = () => tutupKamera?.();
  const btnKamera = tombol([ikon('kamera'), 'Scan dengan kamera'], async () => {
    if (tutupKamera) { tutupKamera(); tutupKamera = null; kameraBox.replaceChildren(); btnKamera.replaceChildren(ikon('kamera'), 'Scan dengan kamera'); return; }
    const v = h('video', { class: 'kamera', muted: true });
    kameraBox.replaceChildren(v);
    try { ctx.sibuk(true); tutupKamera = await mulaiKamera(v, pindai); btnKamera.replaceChildren(ikon('silang'), 'Matikan kamera'); } catch (e) { kameraBox.replaceChildren(); gagal('Kamera tidak bisa dipakai: ' + e.message); } finally { ctx.sibuk(false); }
  }, 'abu');
  node.append(hitungEl, pesanEl, usulEl, btnKamera, kameraBox,
    utama([ikon('centang'), 'Selesai hitung'], async () => {
      const r = await q.selesaiHitung();
      tutupKamera?.(); ctx.nav('/hasil/' + r.id);
    }),
    h('details', null, sumBelum, h('div', { class: 'isi' }, daftarBelum)),
    h('details', null, sumSudah, h('div', { class: 'isi' }, daftarSudah)),
    tombol('Batalkan hitungan', async () => { if (await konfirmasi('Batalkan hitungan ini? Hasil scan dibuang.', { ya: 'Ya, batalkan' })) { await q.batalHitung(); ctx.segarkan(); } }, 'abu'));
  await segarkanDaftar();
  return { judul: 'Cek Stok Fisik', node, bantuan: BANTUAN.cek };
}

export async function hasil(ctx, id) {
  const { q } = ctx;
  const hit = (await q.daftarHitungan()).find((x) => x.id === id);
  if (hit?.jenis === 'tutup') { ctx.nav('/hasil-tutup/' + id); return { judul: 'Tutup Buku', node: h('div', { class: 'layar' }), bantuan: [] }; }
  const node = h('div', { class: 'layar' });
  if (!hit) { node.append(h('p', null, 'Hitungan tidak ditemukan.')); return { judul: 'Hasil Hitung', node, bantuan: BANTUAN.cek }; }
  const peta = new Map((await q.barangSemua()).map((b) => [b.kode, b]));
  const belum = hit.hasil.belum;
  const gramBelum = belum.reduce((s, k) => s + (peta.get(k)?.beratMg || 0), 0);
  // Hasil lama (sebelum ada 'kategori') diterjemahkan dari keterangannya.
  const kategoriAsing = (a) => a.kategori || (a.ket === 'tercatat terjual' ? 'terjual' : a.ket === 'tercatat hilang' ? 'hilang' : 'tidak dikenal');
  const asing = hit.hasil.asing.map((a) => ({ ...a, kategori: kategoriAsing(a) }));
  const olehKategori = (k) => asing.filter((a) => a.kategori === k);

  node.append(h('div', { class: 'baris rapat', role: 'group', 'aria-label': 'Ringkasan hasil' },
    h('span', { class: `chip ${belum.length ? 'amber' : 'ok'}` }, `${belum.length} belum ketemu`),
    asing.length ? h('span', { class: 'chip merah' }, `${asing.length} perlu diperiksa`) : null,
    h('span', { class: 'chip ok' }, `${hit.hasil.ditemukan.length} cocok`)));

  // 1. PRODUK YANG BELUM KETEMU: lengkap dengan kode
  node.append(h('h2', null, belum.length ? `Belum ketemu: ${belum.length} produk (${formatGram(gramBelum)})` : 'Semua barang tercatat sudah ketemu'));
  if (belum.length) {
    const tandai = async (daftar, alasan) => {
      for (const kode of daftar) await q.tandaiHilang(kode, alasan);
      ctx.catatPerubahan(); berhasil(`${daftar.length} barang ditandai ${alasan}.`); ctx.segarkan();
    };
    node.append(h('ul', { class: 'daftar' }, belum.map((kode) => {
      const b = peta.get(kode);
      const tidakAda = b && b.status !== 'ada';
      return barisProduk(kode, b,
        tidakAda ? h('span', { class: 'chip merah' }, b.status) : tombol('Tandai hilang', async () => {
          const alasan = await pilihAlasan();
          if (!alasan) return;
          if (!(await konfirmasi(`Tandai ${kode} ${alasan}? Stok berkurang 1 dan tercatat sebagai koreksi hari ini.`, { ya: 'Ya, tandai' }))) return;
          try { await tandai([kode], alasan); } catch (e) { gagal(e.message); }
        }, 'bahaya kecil'));
    })),
    h('div', { class: 'baris' },
      tombol([ikon('pdf', 22), 'Simpan daftar (Excel/CSV)'], async () => {
        const rows = belum.map((kode) => { const b = peta.get(kode); return { Kode: kode, Jenis: b?.jenis || '', Kadar: b?.kadar || '', 'Berat (g)': (b?.beratMg || 0) / 1000, 'Tanggal masuk': b?.tglMasuk || '', 'Status saat ini': b?.status || '' }; });
        await simpanBerkas(bytesCSV(rows), `belum-ketemu-${hit.selesai.slice(0, 10)}.csv`, 'text/csv');
      }, 'abu'),
      tombol([ikon('hapus', 22), 'Tandai semua hilang'], async () => {
        const ada = belum.filter((k) => peta.get(k)?.status === 'ada');
        if (!ada.length) return;
        const alasan = await pilihAlasan();
        if (!alasan) return;
        if (!(await konfirmasi(`Tandai ${ada.length} barang ini ${alasan}? Stok berkurang ${ada.length} dan tercatat sebagai koreksi hari ini.`, { ya: 'Ya, tandai semua' }))) return;
        try { await tandai(ada, alasan); } catch (e) { gagal(e.message); }
      }, 'bahaya')));
  }

  // 2. PERLU DIPERIKSA: ketemu fisiknya tetapi catatannya tidak cocok
  const terjual = olehKategori('terjual');
  if (terjual.length) {
    node.append(h('h2', null, `Ketemu, tetapi tercatat TERJUAL (${terjual.length})`),
      h('p', null, 'Barangnya ada di tangan Anda, padahal sistem mencatat sudah terjual. Biasanya salah scan saat menjual. Periksa penjualannya dan batalkan bila salah.'),
      h('ul', { class: 'daftar' }, terjual.map((a) => barisProduk(a.kode, peta.get(a.kode),
        tombol('Periksa', () => ctx.nav('/barang/' + encodeURIComponent(a.kode)), 'kecil')))));
  }
  const hilang = olehKategori('hilang');
  if (hilang.length) {
    node.append(h('h2', null, `Ketemu, tetapi tercatat HILANG (${hilang.length})`),
      h('ul', { class: 'daftar' }, hilang.map((a) => barisProduk(a.kode, peta.get(a.kode),
        tombol('Tandai ada kembali', async () => {
          if (!(await konfirmasi(`Kembalikan ${a.kode} jadi barang yang ada? Koreksi hilangnya dihapus dan stok bertambah 1.`, { ya: 'Ya, kembalikan' }))) return;
          try { await q.kembalikanHilang(a.kode); ctx.catatPerubahan(); berhasil(`${a.kode} kembali ada.`); ctx.segarkan(); } catch (e) { gagal(e.message); }
        }, 'kecil')))));
  }
  const asingTak = olehKategori('tidak dikenal');
  if (asingTak.length) {
    node.append(h('h2', null, `Kode tidak dikenal (${asingTak.length})`),
      h('p', null, 'Kode ini tidak ada di stok. Sering karena scanner atau kamera salah membaca satu karakter. Bila ada usulan, cocokkan dengan tulisan di labelnya.'),
      h('ul', { class: 'daftar' }, asingTak.map((a) => h('li', null,
        h('div', { style: 'min-width:0' }, h('div', { class: 'kode' }, a.kode),
          a.mirip?.length ? h('small', null, `Mungkin maksudnya: ${a.mirip.join(' atau ')}`) : h('small', null, 'Tidak ada kode yang mirip'))))));
  }

  if (hit.hasil.ditemukan.length) {
    node.append(h('details', null, h('summary', null, `Cocok (${hit.hasil.ditemukan.length})`),
      h('div', { class: 'isi' }, h('ul', { class: 'daftar' }, hit.hasil.ditemukan.map((kode) => barisProduk(kode, peta.get(kode)))))));
  }
  node.append(h('small', null, 'Daftar hasil ini sudah dibekukan saat hitungan selesai. Perbaikan di atas mengubah catatan stok, bukan daftar ini.'));
  return { judul: 'Hasil Hitung', node, bantuan: BANTUAN.cek };
}

export function pilihAlasan() {
  return new Promise((ok) => {
    const lapis = document.getElementById('lapis');
    const tutup = (v) => { lapis.className = 'lapis sembunyi'; lapis.replaceChildren(); ok(v); };
    lapis.className = 'lapis';
    lapis.replaceChildren(h('div', { class: 'dialog' }, h('p', { class: 'kalimat' }, 'Alasannya apa?'),
      ...ALASAN_KOREKSI.map((a) => tombol(a[0].toUpperCase() + a.slice(1), () => tutup(a))), tombol('Tutup', () => tutup(null), 'abu')));
  });
}

void formatBerat;
void kolomIsi;
