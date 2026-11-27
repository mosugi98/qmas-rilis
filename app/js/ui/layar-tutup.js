// Tutup Buku harian: pindai label terjual dan barang etalase, lalu lihat barang hilang beserta kodenya.

import { h, tombol, utama, kolomIsi, berhasil, gagal, konfirmasi, segmen } from './dom.js';
import { ikon } from './ikon.js';
import { formatGram, formatAngka, tglPanjang } from '../util.js';
import { bip, mulaiKamera } from '../scanner.js';
import { simpanBerkas, bytesCSV } from '../platform.js';
import { barisProduk, detailBarang, pilihAlasan } from './layar-stok.js';

export const BANTUAN = {
  tutup: ['Pindai label barang yang terjual, lalu barang yang ada di etalase.', 'Tekan Selesai tutup buku.', 'Barang etalase yang tidak terpindai tampil sebagai hilang, lengkap dengan kodenya.'],
  hasil: ['Tiga angka di atas: etalase, terjual, dan hilang.', 'Barang hilang tampil dengan kodenya. Tandai hilang hanya bila Anda yakin.', 'Perbaikan di sini mengubah catatan stok, bukan daftar hasil yang sudah dibekukan.'],
};

export async function tutup(ctx) {
  const { q } = ctx;
  const node = h('div', { class: 'layar' });
  const sesi = await q.tutupBerjalan();
  return sesi ? berjalan(ctx, node) : mulai(ctx, node);
}

// ---------- belum ada sesi ----------
async function mulai(ctx, node) {
  const { q } = ctx;
  const hari = q.hariIni();
  const tgl = h('input', { type: 'date', value: hari, max: hari, 'aria-label': 'Tanggal tutup buku' });
  const lama = await q.hitunganBerjalan();
  const riwayat = (await q.daftarHitungan()).filter((x) => x.jenis === 'tutup').slice(0, 10);
  node.append(
    h('p', null, 'Pindai label barang yang terjual dan barang yang ada di etalase. Aplikasi menunjukkan barang mana yang hilang, lengkap dengan kodenya.'),
    kolomIsi('Tanggal tutup buku', tgl, 'Ubah hanya bila Anda lupa tutup buku di hari sebelumnya.'),
    lama ? h('p', { class: 'pesan' }, 'Ada hitungan stok lama yang belum selesai. Hasil pindaiannya ikut dipindahkan ke daftar etalase.') : null,
    utama([ikon('cek', 24), 'Mulai tutup buku'], async () => {
      try { await q.mulaiTutup(tgl.value || hari); ctx.segarkan(); } catch (e) { gagal(e.message); }
    }));
  if (riwayat.length) {
    node.append(h('h2', null, 'Tutup buku sebelumnya'), h('ul', { class: 'daftar' }, riwayat.map((x) => h('li', { class: 'klik', onclick: () => ctx.nav('/hasil-tutup/' + x.id) },
      h('span', null, tglPanjang(x.tanggal)),
      x.hasil.hilang.length ? h('span', { class: 'chip amber' }, `${x.hasil.hilang.length} hilang`) : h('span', { class: 'chip ok' }, 'lengkap')))));
  }
  ctx.saatScan = (kode) => ctx.nav('/barang/' + encodeURIComponent(kode));
  return { judul: 'Tutup Buku', node, bantuan: BANTUAN.tutup };
}

// ---------- sesi berjalan ----------
async function berjalan(ctx, node) {
  const { q } = ctx;
  let peran = 'terjual';
  let tutupKamera = null;
  let semua = new Map();
  const hitungEl = h('div', { class: 'ringkas' });
  const pesanEl = h('div', { class: 'pindaian', 'aria-live': 'polite' }, ikon('cari'), 'Pilih jenis pindaian, lalu scan.');
  const usulEl = h('div', { class: 'kombo' });
  const kameraBox = h('div');
  const dTerjual = h('ul', { class: 'daftar' });
  const dEtalase = h('ul', { class: 'daftar' });
  const dBelum = h('ul', { class: 'daftar' });
  const dAsing = h('ul', { class: 'daftar' });
  const sTerjual = h('summary');
  const sEtalase = h('summary');
  const sBelum = h('summary');
  const sAsing = h('summary');
  const detAsing = h('details', null, sAsing, h('div', { class: 'isi' }, dAsing));

  const sel = (judul, n) => h('div', null, h('div', { class: 'lbl' }, judul), h('b', null, formatAngka(n)));

  async function segarkan() {
    const [cur, r] = await Promise.all([q.tutupBerjalan(), q.ringkasTutup()]);
    semua = new Map((await q.barangSemua()).map((b) => [b.kode, b]));
    hitungEl.replaceChildren(sel('Terjual', cur.terjual.length), sel('Etalase', cur.etalase.length), sel('Belum dipindai', r.hilang.length));
    sTerjual.textContent = `Label terjual (${cur.terjual.length})`;
    sEtalase.textContent = `Barang etalase terpindai (${cur.etalase.length})`;
    sBelum.textContent = `Belum dipindai di etalase (${r.hilang.length})`;
    sAsing.textContent = `Perlu diperiksa (${cur.asing.length})`;
    detAsing.hidden = !cur.asing.length;
    const lepas = (kode) => tombol([ikon('silang', 18)], async () => { await q.lepasTutup(kode); await segarkan(); }, 'abu kecil', { 'aria-label': `Hapus pindaian ${kode}` });
    dTerjual.replaceChildren(...[...cur.terjual].reverse().slice(0, 100).map((kode) => {
      const b = semua.get(kode);
      return barisProduk(kode, b, lepas(kode));
    }), !cur.terjual.length ? h('li', null, 'Belum ada label terjual yang dipindai.') : null);
    dEtalase.replaceChildren(...[...cur.etalase].reverse().slice(0, 100).map((kode) => barisProduk(kode, semua.get(kode), lepas(kode))),
      !cur.etalase.length ? h('li', null, 'Belum ada barang etalase yang dipindai.') : null);
    dBelum.replaceChildren(...r.hilang.slice(0, 150).map((b) => barisProduk(b.kode, b)),
      r.hilang.length > 150 ? h('li', null, `Dan ${r.hilang.length - 150} barang lainnya.`) : null,
      !r.hilang.length ? h('li', null, 'Semua barang etalase sudah dipindai atau terjual.') : null);
    dAsing.replaceChildren(...cur.asing.map((a) => barisProduk(a.kode, semua.get(a.kode),
      h('span', { class: 'chip merah' }, a.kategori === 'tidak dikenal' ? 'tidak dikenal' : `tercatat ${a.kategori}`), lepas(a.kode))));
  }

  async function pindai(kodeMentah, opsi, peranPakai = peran) {
    try {
      const r = await q.pindaiTutup(kodeMentah, peranPakai, opsi);
      const kode = r.kode;
      bip(r.hasil === 'baru' ? 'ok' : r.hasil === 'sudah' ? 'sudah' : 'asing');
      usulEl.replaceChildren();
      if (r.hasil === 'baru') {
        pesanEl.replaceChildren(ikon('centang'), `${kode} · ${detailBarang(r.barang)}`);
      } else if (r.hasil === 'sudah') {
        pesanEl.replaceChildren(ikon('riwayat'), `Sudah dipindai: ${kode}`);
      } else if (r.hasil === 'konflik') {
        pesanEl.replaceChildren(ikon('awas'), `${kode} sudah dipindai sebagai ${r.lain === 'etalase' ? 'barang etalase' : 'label terjual'}. Satu barang tidak bisa keduanya.`);
        usulEl.append(tombol(`Jadikan ${peranPakai === 'terjual' ? 'label terjual' : 'barang etalase'}`, () => pindai(kode, { ganti: true }, peranPakai), 'kecil'));
      } else if (r.kategori === 'terjual') {
        if (peranPakai === 'terjual') {
          pesanEl.replaceChildren(ikon('awas'), `${kode} sudah tercatat terjual sebelumnya. Tidak dihitung lagi.`);
        } else {
          pesanEl.replaceChildren(ikon('awas'), `${kode} tercatat TERJUAL tetapi barangnya ada di tangan Anda. Periksa penjualannya.`);
          usulEl.append(tombol('Periksa penjualan', () => ctx.nav('/barang/' + encodeURIComponent(kode)), 'kecil'));
        }
      } else if (r.kategori === 'hilang') {
        pesanEl.replaceChildren(ikon('awas'), `${kode} tercatat HILANG tetapi ketemu.`);
        usulEl.append(tombol('Tandai ada kembali', async () => {
          try { await q.kembalikanHilang(kode); ctx.catatPerubahan(); await pindai(kode, undefined, peranPakai); } catch (e) { gagal(e.message); }
        }, 'kecil'));
      } else {
        pesanEl.replaceChildren(ikon('silang'), `${kode} tidak dikenal.${r.mirip.length ? ' Mungkin salah baca. Maksud Anda:' : ''}`);
        for (const m of r.mirip) {
          usulEl.append(tombol([ikon('centang', 18), m], async () => { await q.lepasTutup(kode); await pindai(m, undefined, peranPakai); }, 'kecil'));
        }
      }
      await segarkan();
    } catch (e) { gagal(e.message); }
  }

  const btnKamera = tombol([ikon('kamera'), 'Scan dengan kamera'], async () => {
    if (tutupKamera) { tutupKamera(); tutupKamera = null; kameraBox.replaceChildren(); btnKamera.replaceChildren(ikon('kamera'), 'Scan dengan kamera'); return; }
    const v = h('video', { class: 'kamera', muted: true });
    kameraBox.replaceChildren(v);
    try { ctx.sibuk(true); tutupKamera = await mulaiKamera(v, (k) => pindai(k)); btnKamera.replaceChildren(ikon('silang'), 'Matikan kamera'); } catch (e) { kameraBox.replaceChildren(); gagal('Kamera tidak bisa dipakai: ' + e.message); } finally { ctx.sibuk(false); }
  }, 'abu');

  // Ketik kode bila label rusak atau tidak ada scanner.
  const kodeInput = h('input', { type: 'text', placeholder: 'Ketik kode barang', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'Ketik kode barang' });
  const kirimKode = async () => { const k = kodeInput.value.trim(); if (!k) return; kodeInput.value = ''; await pindai(k); kodeInput.focus(); };
  kodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); kirimKode(); } });
  const kolomKode = h('div', { class: 'baris' }, kodeInput, tombol('Tambah', kirimKode, 'abu'));

  const hentikanKamera = () => { tutupKamera?.(); tutupKamera = null; };
  ctx.saatTutup = hentikanKamera;

  async function tampilPindai() {
    const cur = await q.tutupBerjalan();
    ctx.saatScan = (k) => pindai(k);
    node.replaceChildren(
      cur.tanggal !== q.hariIni() ? h('p', { class: 'pesan' }, `Tutup buku untuk tanggal ${tglPanjang(cur.tanggal)}.`) : null,
      segmen([['Label terjual', 'terjual'], ['Barang etalase', 'etalase']], peran, (v) => { peran = v; pesanEl.replaceChildren(ikon('cari'), v === 'terjual' ? 'Scan label barang yang terjual.' : 'Scan barang yang ada di etalase.'); }),
      hitungEl, pesanEl, usulEl, kolomKode, btnKamera, kameraBox,
      utama([ikon('centang'), 'Selesai tutup buku'], async () => {
        hentikanKamera(); kameraBox.replaceChildren();
        const r = await q.ringkasTutup();
        if (r.hilang.length && !(await konfirmasi(`${r.hilang.length} barang etalase belum dipindai dan akan dihitung hilang. Selesaikan tutup buku?`, { ya: 'Ya, selesaikan' }))) return;
        try { const s = await q.selesaiTutup(); ctx.catatPerubahan(); ctx.nav('/hasil-tutup/' + s.id); } catch (e) { gagal(e.message); }
      }),
      h('details', null, sBelum, h('div', { class: 'isi' }, dBelum)),
      h('details', null, sTerjual, h('div', { class: 'isi' }, dTerjual)),
      h('details', null, sEtalase, h('div', { class: 'isi' }, dEtalase)),
      detAsing,
      tombol('Batalkan tutup buku', async () => {
        if (await konfirmasi('Batalkan tutup buku ini? Semua hasil pindaian dibuang. Penjualan belum tercatat.', { ya: 'Ya, batalkan' })) { hentikanKamera(); await q.batalTutup(); ctx.segarkan(); }
      }, 'abu'));
    await segarkan();
  }

  await tampilPindai();
  return { judul: 'Tutup Buku', node, bantuan: BANTUAN.tutup };
}

// ---------- hasil ----------
export async function hasilTutup(ctx, id) {
  const { q } = ctx;
  const node = h('div', { class: 'layar' });
  const hit = (await q.daftarHitungan()).find((x) => x.id === id && x.jenis === 'tutup');
  if (!hit) { node.append(h('p', null, 'Tutup buku tidak ditemukan.')); return { judul: 'Hasil Tutup Buku', node, bantuan: BANTUAN.hasil }; }
  const hs = hit.hasil;
  const peta = new Map((await q.barangSemua()).map((b) => [b.kode, b]));
  const nota = (await q.riwayatPenjualan(hit.tanggal)).filter((n) => n.tutup === hit.id);
  const batal = new Map(nota.flatMap((n) => n.baris.map((l) => [l.kode, n.batal])));
  const sel = (judul, n) => h('div', null, h('div', { class: 'lbl' }, judul), h('b', null, formatAngka(n)));

  node.append(
    h('p', { class: 'kalimat' }, `Tutup buku ${tglPanjang(hit.tanggal)}`),
    h('div', { class: 'ringkas', role: 'group', 'aria-label': 'Ringkasan tutup buku' }, sel('Etalase', hs.ditemukan.length), sel('Terjual', hs.terjual.length), sel('Hilang', hs.hilang.length)),
    hs.hilang.length
      ? h('div', { class: 'pesan' }, ikon('awas'), `${hs.hilang.length} barang etalase belum ketemu. Kodenya ada di bawah.`)
      : h('div', { class: 'pesan' }, ikon('centang'), 'Tutup buku selesai. Semua barang etalase cocok.'));

  if (hs.hilang.length) {
    const gram = hs.hilang.reduce((s, k) => s + (peta.get(k)?.beratMg || 0), 0);
    const tandai = async (daftar, alasan) => {
      for (const kode of daftar) await q.tandaiHilang(kode, alasan);
      ctx.catatPerubahan(); berhasil(`${daftar.length} barang ditandai ${alasan}.`); ctx.segarkan();
    };
    node.append(h('h2', null, `Belum ketemu: ${hs.hilang.length} produk (${formatGram(gram)})`),
      h('ul', { class: 'daftar' }, hs.hilang.map((kode) => {
        const b = peta.get(kode);
        const tidakAda = b && b.status !== 'ada';
        return barisProduk(kode, b, tidakAda ? h('span', { class: 'chip merah' }, b.status) : tombol('Tandai hilang', async () => {
          const alasan = await pilihAlasan();
          if (!alasan) return;
          if (!(await konfirmasi(`Tandai ${kode} ${alasan}? Stok berkurang 1 dan tercatat sebagai koreksi hari ini.`, { ya: 'Ya, tandai' }))) return;
          try { await tandai([kode], alasan); } catch (e) { gagal(e.message); }
        }, 'bahaya kecil'));
      })),
      h('div', { class: 'baris' },
        tombol([ikon('pdf', 22), 'Simpan daftar (Excel/CSV)'], async () => {
          const rows = hs.hilang.map((kode) => { const b = peta.get(kode); return { Kode: kode, Jenis: b?.jenis || '', Kadar: b?.kadar || '', 'Berat (g)': (b?.beratMg || 0) / 1000, 'Tanggal masuk': b?.tglMasuk || '', 'Status saat ini': b?.status || '' }; });
          await simpanBerkas(bytesCSV(rows), `hilang-${hit.tanggal}.csv`, 'text/csv');
        }, 'abu'),
        tombol([ikon('hapus', 22), 'Tandai semua hilang'], async () => {
          const ada = hs.hilang.filter((k) => peta.get(k)?.status === 'ada');
          if (!ada.length) return;
          const alasan = await pilihAlasan();
          if (!alasan) return;
          if (!(await konfirmasi(`Tandai ${ada.length} barang ini ${alasan}? Stok berkurang ${ada.length} dan tercatat sebagai koreksi hari ini.`, { ya: 'Ya, tandai semua' }))) return;
          try { await tandai(ada, alasan); } catch (e) { gagal(e.message); }
        }, 'bahaya')));
  }

  if (hs.terjual.length) {
    node.append(h('h2', null, `Terjual (${hs.terjual.length})`),
      h('details', null, h('summary', null, 'Lihat barang terjual'), h('div', { class: 'isi' }, h('ul', { class: 'daftar' }, hs.terjual.map((kode) => {
        return barisProduk(kode, peta.get(kode), batal.get(kode) ? h('span', { class: 'chip merah' }, 'dibatalkan') : null);
      })))));
  }
  if (hs.asing.length) {
    node.append(h('h2', null, `Perlu diperiksa (${hs.asing.length})`),
      h('p', null, 'Kode ini dipindai tetapi tidak dihitung. Sering karena kamera atau scanner salah membaca satu karakter. Cocokkan dengan tulisan di labelnya.'),
      h('ul', { class: 'daftar' }, hs.asing.map((a) => h('li', null, h('div', { style: 'min-width:0' }, h('div', { class: 'kode' }, a.kode),
        h('small', null, a.kategori === 'tidak dikenal' ? 'Tidak dikenal' : `Tercatat ${a.kategori}`))))));
  }
  if (hs.ditemukan.length) {
    node.append(h('details', null, h('summary', null, `Cocok di etalase (${hs.ditemukan.length})`),
      h('div', { class: 'isi' }, h('ul', { class: 'daftar' }, hs.ditemukan.map((kode) => barisProduk(kode, peta.get(kode)))))));
  }
  node.append(h('small', null, 'Hasil ini dibekukan saat tutup buku selesai. Perbaikan di atas mengubah catatan stok, bukan daftar ini.'));
  return { judul: 'Hasil Tutup Buku', node, bantuan: BANTUAN.hasil };
}
