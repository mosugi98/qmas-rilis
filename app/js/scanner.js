// Scanner: USB (berperilaku seperti keyboard) bekerja di semua layar tanpa klik kolom apa pun;
// kamera lewat BarcodeDetector (Chrome) dengan cadangan ZXing. Bunyi bip dan getar untuk umpan balik.

/** Penguraian ketikan scanner. Murni dan dapat dites: masukkan (karakter, waktuMs) -> kode saat Enter. */
export class PenguraiScanner {
  constructor({ jedaMaks = 60, panjangMin = 4 } = {}) {
    this.jedaMaks = jedaMaks;
    this.panjangMin = panjangMin;
    this.buf = '';
    this.terakhir = 0;
    this.cepat = true;
  }

  /** @returns {string|null} kode bila ini akhir pindaian (Enter) yang sah */
  masuk(tombol, waktu) {
    if (tombol === 'Enter') {
      const kode = this.buf;
      const sah = kode.length >= this.panjangMin && this.cepat;
      this.reset();
      return sah ? kode : null;
    }
    if (tombol.length !== 1) return null;
    if (this.buf && waktu - this.terakhir > this.jedaMaks) { this.buf = ''; this.cepat = true; }
    if (this.buf) this.cepat = this.cepat && waktu - this.terakhir <= this.jedaMaks;
    this.buf += tombol;
    this.terakhir = waktu;
    return null;
  }

  reset() { this.buf = ''; this.cepat = true; }
}

/**
 * Penstabil bacaan kamera: sebuah kode baru diterima bila terbaca SAMA dua kali berturut-turut dalam waktu singkat.
 * Satu bacaan keliru (mis. satu karakter salah) tidak lagi langsung dianggap pindaian.
 * Setelah diterima, kode yang sama diabaikan selama jedaUlangMs.
 */
export class PenstabilPindaian {
  constructor({ butuh = 2, jendelaMs = 1500, jedaUlangMs = 2000 } = {}) {
    this.butuh = butuh; this.jendelaMs = jendelaMs; this.jedaUlangMs = jedaUlangMs;
    this.calon = ''; this.n = 0; this.tCalon = 0; this.terakhir = ''; this.tTerakhir = -Infinity;
  }

  /** @returns {string|null} kode bila stabil dan belum baru saja diterima */
  masuk(kode, waktu = Date.now()) {
    if (kode === this.calon && waktu - this.tCalon <= this.jendelaMs) this.n += 1;
    else { this.calon = kode; this.n = 1; }
    this.tCalon = waktu;
    if (this.n < this.butuh) return null;
    if (kode === this.terakhir && waktu - this.tTerakhir < this.jedaUlangMs) return null;
    this.terakhir = kode; this.tTerakhir = waktu; this.n = 0;
    return kode;
  }
}

/** Pasang pendengar global. Mengembalikan fungsi pelepas. */
export function pasangScannerUSB(saat) {
  const p = new PenguraiScanner();
  const h = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const kode = p.masuk(e.key, e.timeStamp);
    if (kode) {
      e.preventDefault();
      const t = e.target;
      // Bersihkan huruf pindaian yang terlanjur masuk ke kolom isian.
      if (t && 'value' in t && typeof t.value === 'string' && t.value.endsWith(kode.slice(0, -1))) {
        t.value = t.value.slice(0, t.value.length - (kode.length - 1));
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
      saat(kode.toUpperCase());
    }
  };
  document.addEventListener('keydown', h, true);
  return () => document.removeEventListener('keydown', h, true);
}

// ---------- bunyi & getar ----------
let ctx;
function nada(frek, durasi, mulai = 0) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = frek;
    o.type = 'square';
    g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + mulai);
    o.stop(ctx.currentTime + mulai + durasi);
  } catch { /* tanpa audio */ }
}

/** jenis: 'ok' (satu bip tinggi) | 'sudah' (dua bip pendek) | 'asing' (satu bip rendah panjang) */
export function bip(jenis) {
  if (jenis === 'ok') nada(1400, 0.12);
  else if (jenis === 'sudah') { nada(900, 0.07); nada(900, 0.07, 0.12); }
  else { nada(220, 0.4); }
  try { navigator.vibrate?.(jenis === 'ok' ? 60 : jenis === 'sudah' ? [40, 40, 40] : 300); } catch { /* abaikan */ }
}

// ---------- kamera ----------
export async function mulaiKamera(video, saat) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  let jalan = true;
  const penstabil = new PenstabilPindaian();
  const lapor = (kode) => {
    const stabil = penstabil.masuk(kode.toUpperCase());
    if (stabil) saat(stabil);
  };

  if ('BarcodeDetector' in window) {
    const det = new window.BarcodeDetector({ formats: ['code_128'] });
    (async function putar() {
      while (jalan) {
        try {
          const r = await det.detect(video);
          if (r.length) lapor(r[0].rawValue);
        } catch { /* lanjut */ }
        await new Promise((ok) => setTimeout(ok, 150));
      }
    })();
  } else {
    await muatZXing();
    const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = window.ZXing;
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);
    const baca = new BrowserMultiFormatReader(hints);
    baca.decodeFromVideoElementContinuously?.(video, (hasil) => { if (hasil) lapor(hasil.getText()); });
    const henti0 = () => baca.reset();
    return () => { jalan = false; henti0(); stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  }
  return () => { jalan = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
}

function muatZXing() {
  if (window.ZXing) return Promise.resolve();
  return new Promise((ok, gagal) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/zxing.min.js', import.meta.url).href;
    s.onload = ok;
    s.onerror = () => gagal(new Error('Pustaka kamera tidak termuat'));
    document.head.appendChild(s);
  });
}
