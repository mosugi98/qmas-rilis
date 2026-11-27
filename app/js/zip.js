// ZIP minimal tanpa pustaka: penulis (tanpa kompresi) dan pembaca (tanpa kompresi atau deflate).
// Dipakai untuk berkas .qmas.

const enc = new TextEncoder();
const dec = new TextDecoder();

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABEL_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {Record<string, Uint8Array|string>} berkas  nama -> isi */
export function buatZip(berkas) {
  const bagian = [];
  const pusat = [];
  let offset = 0;
  const u16 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const gabung = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  for (const [nama, isi] of Object.entries(berkas)) {
    const data = typeof isi === 'string' ? enc.encode(isi) : isi;
    const n = enc.encode(nama);
    const crc = crc32(data);
    const lokal = gabung(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(n.length), u16(0), n, data);
    pusat.push(gabung(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(n.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), n));
    bagian.push(lokal);
    offset += lokal.length;
  }
  const dir = gabung(...pusat);
  const akhir = gabung(u32(0x06054b50), u16(0), u16(0), u16(pusat.length), u16(pusat.length), u32(dir.length), u32(offset), u16(0));
  return gabung(...bagian, dir, akhir);
}

async function inflateRaw(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** @returns {Promise<Record<string, Uint8Array>>} Melempar Error bila bukan ZIP yang sah. */
export async function bacaZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('Bukan berkas ZIP');
  const jumlah = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const hasil = {};
  for (let i = 0; i < jumlah; i++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('Direktori ZIP rusak');
    const metode = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const ukuranKomp = v.getUint32(p + 20, true);
    const nLen = v.getUint16(p + 28, true);
    const xLen = v.getUint16(p + 30, true);
    const cLen = v.getUint16(p + 32, true);
    const lokalOff = v.getUint32(p + 42, true);
    const nama = dec.decode(bytes.subarray(p + 46, p + 46 + nLen));
    if (lokalOff + 30 > bytes.length || v.getUint32(lokalOff, true) !== 0x04034b50) throw new Error('Isi ZIP rusak');
    const mulai = lokalOff + 30 + v.getUint16(lokalOff + 26, true) + v.getUint16(lokalOff + 28, true);
    if (mulai + ukuranKomp > bytes.length) throw new Error('Berkas terpotong');
    let isi = bytes.subarray(mulai, mulai + ukuranKomp);
    if (metode === 8) isi = await inflateRaw(isi);
    else if (metode !== 0) throw new Error('Metode kompresi ZIP tidak didukung');
    if (crc32(isi) !== crc) throw new Error(`Isi "${nama}" rusak (CRC tidak cocok)`);
    hasil[nama] = isi;
    p += 46 + nLen + xLen + cLen;
  }
  return hasil;
}
