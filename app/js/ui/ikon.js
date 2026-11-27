// Set ikon gambar sendiri: satu gaya (garis 2 px, ujung bulat) agar konsisten. Tidak memakai huruf atau emoji.

const NS = 'http://www.w3.org/2000/svg';

const BENTUK = {
  kembali: 'M15 18l-6-6 6-6',
  beranda: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  bantuan: ['circle:12,12,9', 'M9.6 9.2a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8', 'circle:12,17,.6'],
  jual: ['M3 4h2l2.4 11h10.2l2-8H6.2', 'circle:9,19,1.3', 'circle:17,19,1.3'],
  tambah: 'M12 5v14M5 12h14',
  stok: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4',
  cek: 'M9 4h6v3H9zM7 5.5H5V21h14V5.5h-2M9 14.5l2 2 4-4.5',
  cadang: 'M12 3v12M7 10.5l5 5 5-5M4 20h16',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  pdf: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6',
  bluetooth: 'M7 7l10 10-5 5V2l5 5L7 17',
  urung: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  hapus: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  cari: ['circle:11,11,7', 'M16.5 16.5L21 21'],
  kamera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'circle:12,13.5,3.3'],
  centang: 'M5 13l4 4L19 7',
  silang: 'M6 6l12 12M18 6L6 18',
  atur: ['M4 7h10M18 7h2M4 17h2M10 17h10', 'circle:16,7,2', 'circle:8,17,2'],
  riwayat: ['circle:12,12,9', 'M12 7v5l3 2'],
  kurang: 'M5 12h14',
  panah: 'M9 6l6 6-6 6',
  awas: 'M12 3l10 18H2zM12 10v5M12 18.2v.3',
  kunci: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  simpan: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  merek: ['circle:11.5,11.5,7', 'M15.5 15.5L20 20'],
  pilihsemua: 'M4 6h4M4 12h4M4 18h4M11 6h9M11 12h9M11 18h9',
};

/** Membuat elemen SVG ikon. Dekoratif (aria-hidden); label teks ada di tombolnya. */
export function ikon(nama, ukuran = 24) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', ukuran);
  svg.setAttribute('height', ukuran);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ikon');
  const daftar = [].concat(BENTUK[nama] || []);
  for (const d of daftar) {
    if (d.startsWith('circle:')) {
      const [cx, cy, r] = d.slice(7).split(',');
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
      svg.append(c);
    } else {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
  }
  return svg;
}
