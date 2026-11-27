// Logika domain Q-mas v3. Semua perubahan lewat adapter.tulis() sehingga atomik
// (semua tersimpan atau tidak sama sekali).

import { rencanaKode, cekBaris, normalisasiAwalan, normalisasiKode, kodeMirip } from './codes.js';
import { hitungBuku, rincianHari, stokHariIni } from './ledger.js';
import { hargaBarang, tglLokal, waktuLokal, normalisasiKadar } from './util.js';

export const BATAS_COBA = 30;
export const ALASAN_KOREKSI = ['hilang', 'rusak', 'salah catat'];

export const PENGATURAN_BAWAAN = {
  id: 'utama',
  namaToko: '',
  awalanKode: 'KNG',
  ukuranHuruf: 'normal',
  tema: 'siang', // 'siang' | 'malam'
  hargaTerakhir: {},
  urutanKode: {}, // nomor terakhir yang pernah dipakai per awalan-jenis-berat; tidak pernah dipakai ulang
  autosave: { aktif: true, jadwal: 'harian', jam: '20:00', tiapJam: 6, salinan: 14, namaLokasi: '' },
  cadanganTerakhir: null,
  lisensi: '',
  labelUkuran: 'sedang',
  labelGaris: false,
  labelSalinan: 1,
};

let penghitungId = 0;
const idBaru = (waktu) => `${waktu.replace(/\D/g, '')}-${String(++penghitungId).padStart(3, '0')}${Math.random().toString(36).slice(2, 5)}`;

export class Qmas {
  /**
   * @param adapter  adapterIDB() atau adapterMemori()
   * @param opsi     { sekarang: () => Date, penuh: () => boolean }  penuh=false berarti mode coba
   */
  constructor(adapter, { sekarang = () => new Date(), penuh = () => true } = {}) {
    this.db = adapter;
    this.sekarang = sekarang;
    this.penuh = penuh;
  }

  hariIni() { return tglLokal(this.sekarang()); }

  // ---------- pengaturan ----------
  async pengaturan() {
    const p = await this.db.get('pengaturan', 'utama');
    return { ...structuredClone(PENGATURAN_BAWAAN), ...(p || {}), autosave: { ...PENGATURAN_BAWAAN.autosave, ...(p?.autosave || {}) } };
  }

  async ubahPengaturan(patch) {
    const p = await this.pengaturan();
    const baru = { ...p, ...patch, id: 'utama' };
    if ('awalanKode' in patch) baru.awalanKode = normalisasiAwalan(patch.awalanKode);
    await this.db.tulis([{ op: 'put', tabel: 'pengaturan', nilai: baru }]);
    return baru;
  }

  async hargaPerGram(kadar) {
    return (await this.pengaturan()).hargaTerakhir[normalisasiKadar(kadar)] || 0;
  }

  async setHargaPerGram(kadar, harga) {
    if (!Number.isInteger(harga) || harga < 0) throw new Error('Harga per gram harus berupa angka bulat');
    const p = await this.pengaturan();
    p.hargaTerakhir = { ...p.hargaTerakhir, [normalisasiKadar(kadar)]: harga };
    await this.db.tulis([{ op: 'put', tabel: 'pengaturan', nilai: p }]);
  }

  // ---------- barang ----------
  barangSemua() { return this.db.getAll('barang'); }
  async barang(kode) { return this.db.get('barang', normalisasiKode(kode)); }

  async jumlahAktif() { return (await this.barangSemua()).filter((b) => b.status === 'ada').length; }

  /** Pratinjau kode yang akan dibuat (tanpa menyimpan). */
  async pratinjauKode(rows) {
    const semua = await this.barangSemua();
    const p = await this.pengaturan();
    return rencanaKode(semua.map((b) => b.kode), rows, p.awalanKode, p.urutanKode).map((x) => x.kode);
  }

  /**
   * Tambah barang sebagai stok masuk hari ini. Semua tersimpan atau tidak sama sekali.
   * @returns {string[]} kode yang dibuat (untuk cetak barcode)
   */
  async tambahBarang(rows, { sumber = 'baru', catatan = '' } = {}) {
    if (!['baru', 'pelanggan'].includes(sumber)) throw new Error('Sumber tidak valid');
    const semua = await this.barangSemua();
    const p = await this.pengaturan();
    const rencana = rencanaKode(semua.map((b) => b.kode), rows, p.awalanKode, p.urutanKode);
    if (!this.penuh()) {
      const aktif = semua.filter((b) => b.status === 'ada').length;
      if (aktif + rencana.length > BATAS_COBA) {
        const sisa = Math.max(0, BATAS_COBA - aktif);
        throw new Error(`Mode coba hanya sampai ${BATAS_COBA} barang. Sisa ruang: ${sisa}. Tempel kunci lisensi di Pengaturan untuk membuka penuh.`);
      }
    }
    const tgl = this.hariIni();
    const waktu = waktuLokal(this.sekarang());
    const batch = idBaru(waktu); // satu kelompok per penyimpanan: dasar untuk urungkan dan cetak ulang
    const ops = rencana.map(({ kode, baris }) => ({
      op: 'put',
      tabel: 'barang',
      nilai: {
        kode, jenis: baris.jenis, kadar: baris.kadar, beratMg: baris.beratMg, ongkos: baris.ongkos || 0,
        status: 'ada', sumber, catatan: String(catatan || '').trim().slice(0, 200),
        tglMasuk: tgl, tglTerjual: null, batch, batchWaktu: waktu,
        belumCetak: true, // dihapus saat labelnya dicetak/disimpan sebagai PDF; dasar pengingat "belum dicetak"
      },
    }));
    const urutan = { ...(p.urutanKode || {}) };
    for (const r of rencana) urutan[r.stem] = Math.max(urutan[r.stem] || 0, r.n);
    ops.push({ op: 'put', tabel: 'pengaturan', nilai: { ...p, urutanKode: urutan, id: 'utama' } });
    await this.db.tulis(ops);
    return rencana.map((r) => r.kode);
  }

  /** Catat bahwa label barang-barang ini sudah dicetak (atau disimpan sebagai PDF/dikirim ke printer). */
  async tandaiDicetak(kodeList) {
    const ops = [];
    for (const kode of kodeList) {
      const b = await this.db.get('barang', kode);
      if (b && b.belumCetak) { const { belumCetak, ...sisa } = b; void belumCetak; ops.push({ op: 'put', tabel: 'barang', nilai: sisa }); }
    }
    if (ops.length) await this.db.tulis(ops);
    return ops.length;
  }

  /** Barang yang masih ada dan labelnya belum dicetak (pengingat di beranda). Barang lama tanpa penanda tidak dihitung. */
  async belumDicetak() {
    return (await this.barangSemua()).filter((b) => b.belumCetak && b.status === 'ada').sort((a, b) => (a.kode < b.kode ? -1 : 1));
  }

  /** Kombinasi jenis, kadar, berat yang terakhir dipakai (untuk pilihan cepat saat menambah barang). */
  async komboTerakhir(n = 3) {
    const hasil = [];
    const lihat = new Set();
    for (const g of await this.daftarBatch()) {
      for (const r of g.ringkas) {
        const k = `${r.jenis}|${r.kadar}|${r.beratMg}`;
        if (!lihat.has(k)) { lihat.add(k); hasil.push({ jenis: r.jenis, kadar: r.kadar, beratMg: r.beratMg }); }
        if (hasil.length >= n) return hasil;
      }
    }
    return hasil;
  }

  /** Kelompok penambahan barang, terbaru dulu. Dipakai layar Riwayat Tambah (urungkan dan cetak ulang). */
  async daftarBatch() {
    const peta = new Map();
    for (const b of await this.barangSemua()) {
      if (!b.batch) continue;
      let g = peta.get(b.batch);
      if (!g) { g = { id: b.batch, waktu: b.batchWaktu || '', kode: [], kodeAda: [], belumCetak: 0, ada: 0, terjual: 0, hilang: 0, ringkas: new Map() }; peta.set(b.batch, g); }
      g.kode.push(b.kode);
      if (b.status === 'ada') { g.kodeAda.push(b.kode); if (b.belumCetak) g.belumCetak += 1; }
      g[b.status] += 1;
      const k = `${b.jenis}|${b.kadar}|${b.beratMg}`;
      g.ringkas.set(k, (g.ringkas.get(k) || 0) + 1);
    }
    return [...peta.values()]
      .map((g) => ({ ...g, kode: g.kode.sort(), kodeAda: g.kodeAda.sort(), total: g.kode.length, ringkas: [...g.ringkas].map(([k, pcs]) => { const [jenis, kadar, mg] = k.split('|'); return { jenis, kadar, beratMg: Number(mg), pcs }; }) }))
      .sort((a, b) => (a.waktu < b.waktu ? 1 : a.waktu > b.waktu ? -1 : a.id < b.id ? 1 : -1));
  }

  /**
   * Urungkan satu kelompok penambahan kapan saja, selama SEMUA barangnya masih 'ada'.
   * Bila ada yang sudah terjual/hilang, ditolak dengan petunjuk (batalkan penjualannya dulu).
   */
  async urungkanBatch(id) {
    const anggota = (await this.barangSemua()).filter((b) => b.batch === id);
    if (!anggota.length) throw new Error('Kelompok barang tidak ditemukan');
    const tidakAda = anggota.filter((b) => b.status !== 'ada');
    if (tidakAda.length) {
      throw new Error(`${tidakAda.length} dari ${anggota.length} barang sudah terjual atau hilang. Batalkan penjualannya dulu, atau hapus barang satu per satu yang masih ada.`);
    }
    await this.db.tulis(anggota.map((b) => ({ op: 'del', tabel: 'barang', key: b.kode })));
    return anggota.length;
  }

  /** Hapus satu barang yang salah dimasukkan. Hanya barang berstatus 'ada' (belum pernah terjual/hilang). */
  async hapusBarang(kode) {
    const b = await this.barang(kode);
    if (!b) throw new Error('Barang tidak ditemukan');
    if (b.status !== 'ada') throw new Error(`Barang ${b.kode} sudah ${b.status}. Hanya barang yang masih ada yang bisa dihapus.`);
    await this.db.tulis([{ op: 'del', tabel: 'barang', key: b.kode }]);
  }

  /** Urungkan penambahan barang (tombol Batalkan 10 detik). Hanya barang yang masih 'ada' dan belum pernah terjual. */
  async batalkanTambah(kodeList) {
    const ops = [];
    for (const kode of kodeList) {
      const b = await this.db.get('barang', kode);
      if (b && b.status === 'ada') ops.push({ op: 'del', tabel: 'barang', key: kode });
    }
    if (ops.length) await this.db.tulis(ops);
  }

  async ubahOngkos(kode, ongkos) {
    const b = await this.barang(kode);
    if (!b) throw new Error('Barang tidak ditemukan');
    if (!Number.isInteger(ongkos) || ongkos < 0) throw new Error('Harga tidak boleh negatif');
    await this.db.tulis([{ op: 'put', tabel: 'barang', nilai: { ...b, ongkos } }]);
  }

  // ---------- jual ----------
  /** Harga satu barang pada saat ini (dipakai keranjang). */
  async hitungBaris(b, hargaPerGramOverride) {
    const ppg = hargaPerGramOverride ?? (await this.hargaPerGram(b.kadar));
    return { kode: b.kode, jenis: b.jenis, kadar: b.kadar, beratMg: b.beratMg, hargaPerGram: ppg, ongkos: b.ongkos || 0, harga: hargaBarang(b.beratMg, ppg, b.ongkos) };
  }

  /**
   * Selesaikan penjualan.
   * @param {Array<{kode:string, hargaPerGram?:number}>} baris
   * @param {{pembeli?:string}} opsi
   */
  async jual(baris, { pembeli = '' } = {}) {
    const { ops, nota } = await this._opsJual(baris, { pembeli });
    await this.db.tulis(ops);
    return nota;
  }

  /** Menyusun operasi penjualan tanpa menyimpannya (dipakai jual dan tutup buku). */
  async _opsJual(baris, { pembeli = '', tanggal = null, tutup = null } = {}) {
    if (!baris?.length) throw new Error('Keranjang masih kosong');
    const tgl = tanggal || this.hariIni();
    const unik = new Set();
    const ops = [];
    const garis = [];
    const p = await this.pengaturan();
    for (const l of baris) {
      const kode = normalisasiKode(l.kode);
      if (unik.has(kode)) throw new Error(`Barang ${kode} ada dua kali di keranjang`);
      unik.add(kode);
      const b = await this.db.get('barang', kode);
      if (!b) throw new Error(`Barang ${kode} tidak dikenal`);
      if (b.status !== 'ada') throw new Error(`Barang ${kode} sudah ${b.status === 'terjual' ? 'terjual' : 'tidak tersedia'}`);
      const ppg = l.hargaPerGram ?? p.hargaTerakhir[b.kadar] ?? 0;
      if (!Number.isInteger(ppg) || ppg < 0) throw new Error('Harga per gram tidak valid');
      garis.push({ kode, jenis: b.jenis, kadar: b.kadar, beratMg: b.beratMg, hargaPerGram: ppg, ongkos: b.ongkos || 0, harga: hargaBarang(b.beratMg, ppg, b.ongkos) });
      ops.push({ op: 'put', tabel: 'barang', nilai: { ...b, status: 'terjual', tglTerjual: tgl } });
    }
    const waktu = waktuLokal(this.sekarang());
    const nota = {
      id: idBaru(waktu), waktu, tanggal: tgl, baris: garis,
      total: garis.reduce((s, x) => s + x.harga, 0),
      pembeli: String(pembeli || '').trim().slice(0, 80), batal: false, waktuBatal: null,
    };
    if (tutup) nota.tutup = tutup;
    ops.push({ op: 'put', tabel: 'penjualan', nilai: nota });
    return { ops, nota };
  }

  async batalkanPenjualan(id) {
    const n = await this.db.get('penjualan', id);
    if (!n) throw new Error('Nota tidak ditemukan');
    if (n.batal) throw new Error('Nota ini sudah dibatalkan');
    const ops = [];
    for (const l of n.baris) {
      const b = await this.db.get('barang', l.kode);
      if (b) ops.push({ op: 'put', tabel: 'barang', nilai: { ...b, status: 'ada', tglTerjual: null } });
    }
    ops.push({ op: 'put', tabel: 'penjualan', nilai: { ...n, batal: true, waktuBatal: waktuLokal(this.sekarang()) } });
    await this.db.tulis(ops);
  }

  /** Daftar penjualan, terbaru dulu; opsional hanya satu tanggal. */
  async riwayatPenjualan(tanggal) {
    const semua = await this.db.getAll('penjualan');
    return semua.filter((n) => !tanggal || n.tanggal === tanggal).sort((a, b) => (a.waktu < b.waktu ? 1 : -1));
  }

  // ---------- koreksi & Cek Stok Fisik ----------
  async tandaiHilang(kode, alasan = 'hilang') {
    if (!ALASAN_KOREKSI.includes(alasan)) throw new Error('Alasan tidak valid');
    const b = await this.barang(kode);
    if (!b) throw new Error('Barang tidak ditemukan');
    if (b.status !== 'ada') throw new Error('Hanya barang yang tercatat ada yang bisa ditandai hilang');
    const tanggal = this.hariIni();
    await this.db.tulis([
      { op: 'put', tabel: 'barang', nilai: { ...b, status: 'hilang' } },
      { op: 'put', tabel: 'koreksi', nilai: { id: `${tanggal}-${b.kode}`, tanggal, kode: b.kode, alasan } },
    ]);
  }

  async hitunganBerjalan() {
    return (await this.db.getAll('hitungan')).find((h) => !h.selesai && h.jenis !== 'tutup') || null;
  }

  // ---------- Tutup Buku harian (gudang/etalase) ----------
  async tutupBerjalan() {
    return (await this.db.getAll('hitungan')).find((h) => h.jenis === 'tutup' && !h.selesai) || null;
  }

  /** Mulai (atau lanjutkan) tutup buku. Hitungan Cek Stok Fisik lama yang berjalan diubah menjadi daftar etalase terpindai. */
  async mulaiTutup(tanggal) {
    const ada = await this.tutupBerjalan();
    if (ada) return ada;
    const tgl = tanggal || this.hariIni();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw new Error('Tanggal tidak valid');
    if (tgl > this.hariIni()) throw new Error('Tanggal tidak boleh di masa depan');
    const waktu = waktuLokal(this.sekarang());
    const sesi = { id: idBaru(waktu), jenis: 'tutup', tanggal: tgl, mulai: waktu, selesai: null, terjual: [], etalase: [], asing: [], hasil: null };
    const ops = [];
    const lama = await this.hitunganBerjalan();
    if (lama) {
      for (const kode of lama.dipindai) {
        const b = await this.db.get('barang', kode);
        if (b && b.status === 'ada') sesi.etalase.push(kode);
      }
      ops.push({ op: 'del', tabel: 'hitungan', key: lama.id });
    }
    ops.push({ op: 'put', tabel: 'hitungan', nilai: sesi });
    await this.db.tulis(ops);
    return sesi;
  }

  /**
   * Catat satu pindaian pada tutup buku. peran 'terjual' = label barang terjual, 'etalase' = barang di etalase.
   * Tidak ada tebakan: kode yang tidak cocok tidak pernah dimasukkan, hanya diberi usulan.
   * @returns {{hasil:'baru'|'sudah'|'asing'|'konflik', kode:string, kategori?:string, barang?:object, mirip?:string[]}}
   */
  async pindaiTutup(kodeMentah, peran, { ganti = false } = {}) {
    if (!['terjual', 'etalase'].includes(peran)) throw new Error('Peran pindaian tidak valid');
    const s = await this.tutupBerjalan();
    if (!s) throw new Error('Tekan Mulai tutup buku dulu');
    const kode = normalisasiKode(kodeMentah);
    if (s[peran].includes(kode)) return { hasil: 'sudah', kode };
    const lain = peran === 'terjual' ? 'etalase' : 'terjual';
    const b = await this.db.get('barang', kode);
    const catatAsing = async (kategori) => {
      if (!s.asing.some((x) => x.kode === kode)) s.asing.push({ kode, peran, kategori });
      await this.db.tulis([{ op: 'put', tabel: 'hitungan', nilai: s }]);
    };
    if (!b) {
      await catatAsing('tidak dikenal');
      const sudah = new Set([...s.terjual, ...s.etalase]);
      const kandidat = (await this.barangSemua()).filter((x) => x.status === 'ada' && !sudah.has(x.kode)).map((x) => x.kode);
      return { hasil: 'asing', kode, kategori: 'tidak dikenal', mirip: kodeMirip(kode, kandidat) };
    }
    if (b.status !== 'ada') {
      const kategori = b.status === 'terjual' ? 'terjual' : 'hilang';
      await catatAsing(kategori);
      return { hasil: 'asing', kode, kategori, barang: b };
    }
    if (s[lain].includes(kode)) {
      if (!ganti) return { hasil: 'konflik', kode, barang: b, lain };
      s[lain] = s[lain].filter((k) => k !== kode);
    }
    s[peran].push(kode);
    s.asing = s.asing.filter((x) => x.kode !== kode);
    await this.db.tulis([{ op: 'put', tabel: 'hitungan', nilai: s }]);
    return { hasil: 'baru', kode, barang: b };
  }

  /** Buang satu pindaian (terjual, etalase, atau kode asing) dari tutup buku yang berjalan. */
  async lepasTutup(kodeMentah) {
    const s = await this.tutupBerjalan();
    if (!s) throw new Error('Tidak ada tutup buku yang berjalan');
    const kode = normalisasiKode(kodeMentah);
    s.terjual = s.terjual.filter((k) => k !== kode);
    s.etalase = s.etalase.filter((k) => k !== kode);
    s.asing = s.asing.filter((x) => x.kode !== kode);
    await this.db.tulis([{ op: 'put', tabel: 'hitungan', nilai: s }]);
  }

  async batalTutup() {
    const s = await this.tutupBerjalan();
    if (s) await this.db.tulis([{ op: 'del', tabel: 'hitungan', key: s.id }]);
  }

  /** Hitungan langsung dari sesi yang berjalan: etalase awal, terjual, ditemukan, dan hilang (dengan kode). */
  async ringkasTutup() {
    const s = await this.tutupBerjalan();
    if (!s) throw new Error('Tidak ada tutup buku yang berjalan');
    const semua = (await this.barangSemua()).sort((a, b) => (a.kode < b.kode ? -1 : 1));
    const etalaseAwal = semua.filter((b) => b.status === 'ada'); // seluruh stok yang ada = etalase
    const peta = new Map(etalaseAwal.map((b) => [b.kode, b]));
    const setTerjual = new Set(s.terjual);
    const setEtalase = new Set(s.etalase);
    const terjual = s.terjual.filter((k) => peta.has(k)).sort().map((k) => peta.get(k));
    return {
      tanggal: s.tanggal,
      etalaseAwal,
      terjual,
      terjualDariEtalase: terjual.length,
      ditemukan: etalaseAwal.filter((b) => setEtalase.has(b.kode) && !setTerjual.has(b.kode)),
      hilang: etalaseAwal.filter((b) => !setTerjual.has(b.kode) && !setEtalase.has(b.kode)),
      asing: s.asing,
    };
  }

  /** Selesaikan tutup buku: catat penjualan (satu nota per kode), bekukan hasil. Barang hilang TIDAK ditandai otomatis. */
  async selesaiTutup() {
    const s = await this.tutupBerjalan();
    if (!s) throw new Error('Tidak ada tutup buku yang berjalan');
    const r = await this.ringkasTutup();
    const awal = r.terjual.find((x) => x.tglMasuk && x.tglMasuk > s.tanggal);
    if (awal) throw new Error(`Barang ${awal.kode} masuk ${awal.tglMasuk}, tidak bisa terjual sebelum tanggal masuk (${s.tanggal}). Pilih tanggal tutup buku yang lebih baru.`);
    const ops = [];
    for (const x of r.terjual) {
      const { ops: o } = await this._opsJual([{ kode: x.kode, hargaPerGram: 0 }], { tanggal: s.tanggal, tutup: s.id });
      ops.push(...o);
    }
    const kode = (daftar) => daftar.map((b) => b.kode);
    const beku = {
      ...s,
      selesai: waktuLokal(this.sekarang()),
      hasil: {
        tanggal: s.tanggal, etalaseAwal: kode(r.etalaseAwal), terjual: kode(r.terjual), terjualDariEtalase: r.terjualDariEtalase,
        ditemukan: kode(r.ditemukan), hilang: kode(r.hilang), asing: r.asing,
      },
    };
    ops.push({ op: 'put', tabel: 'hitungan', nilai: beku });
    await this.db.tulis(ops);
    return beku;
  }

  async mulaiHitung() {
    const ada = await this.hitunganBerjalan();
    if (ada) return ada;
    const waktu = waktuLokal(this.sekarang());
    const h = { id: idBaru(waktu), mulai: waktu, selesai: null, dipindai: [], hasil: null };
    await this.db.tulis([{ op: 'put', tabel: 'hitungan', nilai: h }]);
    return h;
  }

  /**
   * Mencatat satu pindaian dan menjelaskan hasilnya.
   * @returns {{hasil:'baru'|'sudah'|'asing', kode:string, kategori?:'terjual'|'hilang'|'tidak dikenal', barang?:object, mirip?:string[]}}
   *   'mirip' (hanya untuk kode tidak dikenal): kode barang yang masih ada dan belum discan yang berbeda sedikit,
   *   untuk membantu bila scanner/kamera salah baca satu karakter.
   */
  async pindaiHitungRinci(kodeMentah) {
    const h = await this.hitunganBerjalan();
    if (!h) throw new Error('Tekan Mulai hitung dulu');
    const kode = normalisasiKode(kodeMentah);
    if (h.dipindai.includes(kode)) return { hasil: 'sudah', kode };
    h.dipindai.push(kode);
    await this.db.tulis([{ op: 'put', tabel: 'hitungan', nilai: h }]);
    const b = await this.db.get('barang', kode);
    if (b && b.status === 'ada') return { hasil: 'baru', kode, barang: b };
    if (b) return { hasil: 'asing', kode, kategori: b.status === 'terjual' ? 'terjual' : 'hilang', barang: b };
    const belum = (await this.barangSemua()).filter((x) => x.status === 'ada' && !h.dipindai.includes(x.kode)).map((x) => x.kode);
    return { hasil: 'asing', kode, kategori: 'tidak dikenal', mirip: kodeMirip(kode, belum) };
  }

  /** @returns 'baru' | 'sudah' | 'asing' */
  async pindaiHitung(kodeMentah) {
    return (await this.pindaiHitungRinci(kodeMentah)).hasil;
  }

  /** Buang satu pindaian yang keliru dari hitungan yang sedang berjalan. */
  async lepasPindaian(kodeMentah) {
    const h = await this.hitunganBerjalan();
    if (!h) throw new Error('Tidak ada hitungan yang berjalan');
    const kode = normalisasiKode(kodeMentah);
    h.dipindai = h.dipindai.filter((k) => k !== kode);
    await this.db.tulis([{ op: 'put', tabel: 'hitungan', nilai: h }]);
  }

  /** Barang yang tercatat ada tetapi belum discan pada hitungan yang berjalan (lengkap dengan detailnya). */
  async belumDiscan() {
    const h = await this.hitunganBerjalan();
    const sudah = new Set(h?.dipindai || []);
    return (await this.barangSemua()).filter((b) => b.status === 'ada' && !sudah.has(b.kode)).sort((a, b) => (a.kode < b.kode ? -1 : 1));
  }

  /** Barang yang tadinya ditandai hilang ternyata ketemu: kembalikan jadi 'ada' dan hapus koreksinya. */
  async kembalikanHilang(kodeMentah) {
    const b = await this.barang(kodeMentah);
    if (!b) throw new Error('Barang tidak ditemukan');
    if (b.status !== 'hilang') throw new Error('Barang ini tidak berstatus hilang');
    const ops = [{ op: 'put', tabel: 'barang', nilai: { ...b, status: 'ada', tglTerjual: null } }];
    for (const k of await this.db.getAll('koreksi')) if (k.kode === b.kode) ops.push({ op: 'del', tabel: 'koreksi', key: k.id });
    await this.db.tulis(ops);
  }

  /** Akhiri dan bekukan hitungan. */
  async selesaiHitung() {
    const h = await this.hitunganBerjalan();
    if (!h) throw new Error('Tidak ada hitungan yang berjalan');
    const semua = await this.barangSemua();
    const peta = new Map(semua.map((b) => [b.kode, b]));
    const dipindai = new Set(h.dipindai);
    const hasil = { ditemukan: [], belum: [], asing: [] };
    for (const b of semua) if (b.status === 'ada' && !dipindai.has(b.kode)) hasil.belum.push(b.kode);
    for (const kode of h.dipindai) {
      const b = peta.get(kode);
      if (b && b.status === 'ada') hasil.ditemukan.push(kode);
      else if (b) hasil.asing.push({ kode, kategori: b.status === 'terjual' ? 'terjual' : 'hilang', ket: b.status === 'terjual' ? 'tercatat terjual' : 'tercatat hilang' });
      else hasil.asing.push({ kode, kategori: 'tidak dikenal', ket: 'tidak dikenal', mirip: kodeMirip(kode, hasil.belum) });
    }
    const beku = { ...h, selesai: waktuLokal(this.sekarang()), hasil };
    await this.db.tulis([{ op: 'put', tabel: 'hitungan', nilai: beku }]);
    return beku;
  }

  async batalHitung() {
    const h = await this.hitunganBerjalan();
    if (h) await this.db.tulis([{ op: 'del', tabel: 'hitungan', key: h.id }]);
  }

  async daftarHitungan() {
    return (await this.db.getAll('hitungan')).filter((h) => h.selesai).sort((a, b) => (a.selesai < b.selesai ? 1 : -1));
  }

  /** Riwayat satu barang: masuk, terjual kapan, harga. */
  async riwayatBarang(kode) {
    const b = await this.barang(kode);
    if (!b) return null;
    const nota = (await this.db.getAll('penjualan')).filter((n) => n.baris.some((l) => l.kode === b.kode));
    return {
      barang: b,
      penjualan: nota.sort((x, y) => (x.waktu < y.waktu ? -1 : 1)).map((n) => ({ id: n.id, waktu: n.waktu, batal: n.batal, ...n.baris.find((l) => l.kode === b.kode) })),
      koreksi: (await this.db.getAll('koreksi')).filter((k) => k.kode === b.kode),
    };
  }

  // ---------- buku stok ----------
  async bukuStok() {
    const [barang, koreksi] = await Promise.all([this.barangSemua(), this.db.getAll('koreksi')]);
    return hitungBuku(barang, koreksi, this.hariIni());
  }

  async rincianHari(tanggal) {
    const [barang, koreksi] = await Promise.all([this.barangSemua(), this.db.getAll('koreksi')]);
    return rincianHari(barang, koreksi, tanggal);
  }

  /** Tiga angka beranda. 'stok' sama persis dengan baris terbaru buku stok. */
  async ringkasan() {
    const buku = await this.bukuStok();
    const hari = buku.length ? buku[buku.length - 1] : null;
    const stok = stokHariIni(buku);
    return { stok, masuk: hari?.masuk ?? { pcs: 0, mg: 0 }, terjual: hari?.terjual ?? { pcs: 0, mg: 0 } };
  }

  // ---------- data penuh (cadangan/pulihkan) ----------
  async dump() {
    const hasil = {};
    for (const t of ['barang', 'penjualan', 'koreksi', 'hitungan']) {
      hasil[t] = (await this.db.getAll(t)).sort((a, b) => String(a.kode ?? a.id).localeCompare(String(b.kode ?? b.id)));
    }
    hasil.pengaturan = [await this.pengaturan()];
    return hasil;
  }

  async pulihkan(isi) {
    await this.db.gantiSemua(isi);
  }
}

export { cekBaris };
