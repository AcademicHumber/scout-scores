const fs = require("fs")
const zlib = require("zlib")

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function createPNG(width, height, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0
  const ihdrType = Buffer.from("IHDR")
  const ihdrCrc = crc32(Buffer.concat([ihdrType, ihdrData]))
  const ihdr = Buffer.alloc(4 + 4 + 13 + 4)
  ihdr.writeUInt32BE(13, 0)
  ihdrType.copy(ihdr, 4)
  ihdrData.copy(ihdr, 8)
  ihdr.writeUInt32BE(ihdrCrc, 21)

  const rowLen = 1 + width * 3
  const raw = Buffer.alloc(height * rowLen)
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0
    for (let x = 0; x < width; x++) {
      raw[y * rowLen + 1 + x * 3] = r
      raw[y * rowLen + 1 + x * 3 + 1] = g
      raw[y * rowLen + 1 + x * 3 + 2] = b
    }
  }
  const compressed = zlib.deflateSync(raw)
  const idatType = Buffer.from("IDAT")
  const idatCrc = crc32(Buffer.concat([idatType, compressed]))
  const idat = Buffer.alloc(4 + 4 + compressed.length + 4)
  idat.writeUInt32BE(compressed.length, 0)
  idatType.copy(idat, 4)
  compressed.copy(idat, 8)
  idat.writeUInt32BE(idatCrc, 8 + compressed.length)

  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])

  return Buffer.concat([sig, ihdr, idat, iend])
}

// Purple brand color #622599 = rgb(98, 37, 153)
fs.writeFileSync("public/icons/icon-192.png", createPNG(192, 192, 98, 37, 153))
fs.writeFileSync("public/icons/icon-512.png", createPNG(512, 512, 98, 37, 153))
console.log("Icons created: icon-192.png, icon-512.png")
