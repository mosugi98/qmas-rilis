// Penyimpanan perangkat. Dua adapter dengan antarmuka sama:
//   adapterIDB()    : IndexedDB (aplikasi nyata)
//   adapterMemori() : di memori (tes)
//
// Tabel data (ikut berkas cadangan): barang, penjualan, koreksi, pengaturan (+ hitungan untuk Cek Stok Fisik).
// Tabel 'lokal' (PIN, folder autosave, penanda) khusus perangkat ini dan TIDAK ikut cadangan.

export const TABEL = ['barang', 'penjualan', 'koreksi', 'pengaturan', 'hitungan'];
const KUNCI = { barang: 'kode', penjualan: 'id', koreksi: 'id', pengaturan: 'id', hitungan: 'id', lokal: 'k' };

/** Operasi atomik: [{op:'put', tabel, nilai}, {op:'del', tabel, key}] */
export function adapterMemori() {
  const data = Object.fromEntries([...TABEL, 'lokal'].map((t) => [t, new Map()]));
  const salin = (v) => structuredClone(v);
  return {
    async getAll(t) { return [...data[t].values()].map(salin); },
    async get(t, key) { const v = data[t].get(key); return v === undefined ? undefined : salin(v); },
    async tulis(ops) {
      const cadangan = Object.fromEntries(Object.entries(data).map(([t, m]) => [t, new Map(m)]));
      try {
        for (const o of ops) {
          if (o.op === 'put') data[o.tabel].set(o.nilai[KUNCI[o.tabel]], salin(o.nilai));
          else if (o.op === 'del') data[o.tabel].delete(o.key);
          else throw new Error('Operasi tidak dikenal');
        }
      } catch (e) {
        for (const t of Object.keys(data)) data[t] = cadangan[t];
        throw e;
      }
    },
    /** Ganti seluruh tabel data sekaligus (pulihkan). 'lokal' tidak disentuh. */
    async gantiSemua(isi) {
      const baru = {};
      for (const t of TABEL) {
        baru[t] = new Map((isi[t] || []).map((v) => [v[KUNCI[t]], salin(v)]));
      }
      for (const t of TABEL) data[t] = baru[t];
    },
  };
}

export function adapterIDB(nama = 'qmas3') {
  let dbp;
  const buka = () => (dbp ||= new Promise((ok, gagal) => {
    const rq = indexedDB.open(nama, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      for (const t of [...TABEL, 'lokal']) db.createObjectStore(t, { keyPath: KUNCI[t] });
    };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => gagal(rq.error || new Error('Penyimpanan tidak dapat dibuka'));
  }));
  const selesai = (tx) => new Promise((ok, gagal) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => gagal(tx.error);
    tx.onabort = () => gagal(tx.error || new Error('Penyimpanan dibatalkan'));
  });
  const minta = (rq) => new Promise((ok, gagal) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => gagal(rq.error); });
  return {
    async getAll(t) { const db = await buka(); return minta(db.transaction(t).objectStore(t).getAll()); },
    async get(t, key) { const db = await buka(); return minta(db.transaction(t).objectStore(t).get(key)); },
    async tulis(ops) {
      const db = await buka();
      const tabel = [...new Set(ops.map((o) => o.tabel))];
      const tx = db.transaction(tabel, 'readwrite');
      for (const o of ops) {
        const s = tx.objectStore(o.tabel);
        if (o.op === 'put') s.put(o.nilai); else s.delete(o.key);
      }
      await selesai(tx);
    },
    async gantiSemua(isi) {
      const db = await buka();
      const tx = db.transaction(TABEL, 'readwrite');
      for (const t of TABEL) {
        const s = tx.objectStore(t);
        s.clear();
        for (const v of isi[t] || []) s.put(v);
      }
      await selesai(tx);
    },
  };
}

/** Minta penyimpanan permanen agar browser tidak membersihkan data. */
export async function mintaPenyimpananPermanen() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* abaikan */ }
  return false;
}
