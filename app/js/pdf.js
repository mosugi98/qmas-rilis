// Pembuat PDF label barcode tanpa pustaka. Barcode digambar sebagai vektor (tajam di printer apa pun),
// tata letak sama dengan label cetak v2 (lebar 40/55/80 mm). Hasilnya diserahkan ke pengguna untuk
// disimpan/dibagikan lalu dicetak dari komputer.

import { modul128 } from './code128.js';
import { formatBerat } from './util.js';

const MM = 72 / 25.4;
export const LEBAR_MM = { kecil: 40, sedang: 55, besar: 80 };
export const HALAMAN_MM = { lebar: 210, tinggi: 297 }; // A4
const MARGIN_MM = 10;

// Lebar karakter Helvetica / Helvetica-Bold untuk ASCII 32..126 (per 1000 satuan)
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
export const _LEBAR = { reg: W_REG, bold: W_BOLD };

const MIDDLE_DOT = '·';

function lebarTeks(teks, ukuran, tebal) {
  const tabel = tebal ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of teks) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? tabel[c - 32] : 278;
  }
  return (w / 1000) * ukuran;
}

function esc(teks) {
  let o = '';
  for (const ch of teks) {
    const c = ch.charCodeAt(0);
    if (ch === '\\' || ch === '(' || ch === ')') o += '\\' + ch;
    else if (ch === MIDDLE_DOT) o += '\\267';
    else if (c >= 32 && c <= 126) o += ch;
    else o += '?';
  }
  return o;
}

const f2 = (n) => (Math.round(n * 100) / 100).toString();

/** Tinggi label (mm) untuk lebar tertentu, selaras dengan proporsi label cetak. */
export const tinggiLabelMm = (w) => Math.round(w * 0.72 * 100) / 100;

export function tataLetak(ukuran = 'sedang') {
  const w = LEBAR_MM[ukuran] ?? LEBAR_MM.sedang;
  const h = tinggiLabelMm(w);
  const kol = Math.max(1, Math.floor((HALAMAN_MM.lebar - 2 * MARGIN_MM) / w));
  const baris = Math.max(1, Math.floor((HALAMAN_MM.tinggi - 2 * MARGIN_MM) / h));
  // pusatkan blok label secara horizontal
  const x0 = (HALAMAN_MM.lebar - kol * w) / 2;
  return { w, h, kol, baris, x0, y0: MARGIN_MM, perHalaman: kol * baris };
}

/** Perintah konten PDF satu label. (xMm, yMm) = pojok kiri atas, dalam mm dari kiri-atas halaman. */
function labelKonten(b, xMm, yMm, w, h, garis) {
  const p = w * 0.05;
  const g = w * 0.025;
  const baseY = (yTopMm) => (HALAMAN_MM.tinggi - yTopMm) * MM; // mm dari atas -> pt dari bawah
  const cx = (xMm + w / 2) * MM;
  const out = [];

  if (garis) {
    out.push(`q [2 2] 0 d 0.4 w 0.4 G ${f2(xMm * MM)} ${f2(baseY(yMm + h))} ${f2(w * MM)} ${f2(h * MM)} re S Q`);
  }
  const teks = (s, ukMm, tebal, tengahY) => {
    let uk = ukMm * MM;
    const lebarMaks = (w - 2 * p) * MM;
    const lw = lebarTeks(s, uk, tebal);
    if (lw > lebarMaks) uk *= lebarMaks / lw;
    const x = cx - lebarTeks(s, uk, tebal) / 2;
    out.push(`BT /${tebal ? 'F2' : 'F1'} ${f2(uk)} Tf ${f2(x)} ${f2(baseY(tengahY))} Td (${esc(s)}) Tj ET`);
  };

  let y = yMm + p;
  const f1 = w * 0.065;
  teks(`${b.jenis} ${formatBerat(b.beratMg)} g`, f1, true, y + f1 * 0.95);
  y += f1 * 1.2 + g;

  // barcode
  const m = modul128(b.kode);
  const zona = 10;
  const total = m.length + zona * 2;
  const bw = w - 2 * p;
  const unit = (bw * MM) / total;
  const tinggiBar = w * 0.3;
  const yBawah = baseY(y + tinggiBar);
  let path = '';
  for (let i = 0; i < m.length;) {
    if (m[i] === '1') {
      let j = i;
      while (j < m.length && m[j] === '1') j++;
      path += `${f2((xMm + p) * MM + (i + zona) * unit)} ${f2(yBawah)} ${f2((j - i) * unit)} ${f2(tinggiBar * MM)} re `;
      i = j;
    } else i++;
  }
  out.push(`q 0 g ${path}f Q`);
  y += tinggiBar + g;

  const f3 = w * 0.078;
  teks(b.kode, f3, true, y + f3 * 0.95);
  y += f3 * 1.2 + g;

  const f4 = w * 0.062;
  teks(`${b.kadar} ${MIDDLE_DOT} ${formatBerat(b.beratMg)} g`, f4, false, y + f4 * 0.95);
  return out.join('\n');
}

/**
 * @param {Array<{kode:string,jenis:string,kadar:string,beratMg:number}>} daftar
 * @returns {Uint8Array} berkas PDF (A4)
 */
export function buatPdfLabel(daftar, { ukuran = 'sedang', salinan = 1, garis = false } = {}) {
  if (!daftar.length) throw new Error('Tidak ada label untuk dicetak');
  const L = tataLetak(ukuran);
  const n = Math.max(1, Math.min(100, Number(salinan) || 1));
  const semua = daftar.flatMap((b) => Array.from({ length: n }, () => b));
  const halaman = [];
  for (let i = 0; i < semua.length; i += L.perHalaman) halaman.push(semua.slice(i, i + L.perHalaman));

  const objek = []; // isi string objek, indeks 0 = objek nomor 1
  const tambah = (s) => { objek.push(s); return objek.length; };
  tambah('<< /Type /Catalog /Pages 2 0 R >>'); // 1
  tambah(''); // 2 (diisi kemudian)
  tambah('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); // 3
  tambah('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); // 4

  const idHalaman = [];
  for (const isi of halaman) {
    const konten = isi.map((b, i) => {
      const k = i % L.kol;
      const r = Math.floor(i / L.kol);
      return labelKonten(b, L.x0 + k * L.w, L.y0 + r * L.h, L.w, L.h, garis);
    }).join('\n');
    const idKonten = objek.length + 2;
    const idH = tambah(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(HALAMAN_MM.lebar * MM)} ${f2(HALAMAN_MM.tinggi * MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idKonten} 0 R >>`);
    tambah(`<< /Length ${konten.length} >>\nstream\n${konten}\nendstream`);
    idHalaman.push(idH);
  }
  objek[1] = `<< /Type /Pages /Kids [${idHalaman.map((i) => `${i} 0 R`).join(' ')}] /Count ${idHalaman.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offset = [];
  objek.forEach((s, i) => {
    offset.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${s}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objek.length + 1}\n0000000000 65535 f \n`;
  for (const o of offset) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objek.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

export const jumlahHalaman = (jumlahLabel, ukuran) => Math.ceil(jumlahLabel / tataLetak(ukuran).perHalaman);
