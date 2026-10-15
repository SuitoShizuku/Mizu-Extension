// ADD: アイコン生成用スクリプト (純粋なNode.jsでPNGバイナリ生成)
const fs = require('fs');
const zlib = require('zlib');

function createPng(width, height, drawFn) {
  // ADD: RGBAバッファ作成
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const color = drawFn(x, y, width, height);
      buffer[idx] = color[0];
      buffer[idx + 1] = color[1];
      buffer[idx + 2] = color[2];
      buffer[idx + 3] = color[3];
    }
  }

  // ADD: PNGのIDAT用スキャンライン生成 (Filter type 0: None)
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  let scanIdx = 0;
  for (let y = 0; y < height; y++) {
    scanlines[scanIdx++] = 0;
    const start = y * width * 4;
    buffer.copy(scanlines, scanIdx, start, start + width * 4);
    scanIdx += width * 4;
  }

  const compressed = zlib.deflateSync(scanlines);

  // ADD: チャンク構築ヘルパー
  function createChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(len + 12);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, len + 8));
    buf.writeInt32BE(crc, len + 8);
    return buf;
  }

  // ADD: CRC32計算
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) | 0;
  }

  // ADD: IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// ADD: アイコン描画関数 (グラデーション背景＋再生ボタン風アイコン)
function drawIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.5;

  // 角丸四角形のマスク
  const r = 0.2;
  const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - r), 0);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > r) {
    return [0, 0, 0, 0];
  }

  // 背景グラデーション (赤～紫～ダーク)
  const red = Math.round(255 - ny * 100);
  const green = Math.round(30 + nx * 40);
  const blue = Math.round(80 + ny * 120);

  // 中央の三角形 (再生ボタン)
  const triX = (nx - 0.38) / 0.35;
  const triY = (ny - 0.5) / 0.35;
  const inTriangle = triX >= 0 && triX <= 1 && Math.abs(triY) <= (1 - triX) * 0.8;

  if (inTriangle) {
    return [255, 255, 255, 255];
  }

  return [red, green, blue, 255];
}

const sizes = [16, 48, 128];
sizes.forEach(size => {
  const pngBuf = createPng(size, size, drawIcon);
  fs.writeFileSync(`icon${size}.png`, pngBuf);
});
console.log('Icons generated successfully!');
