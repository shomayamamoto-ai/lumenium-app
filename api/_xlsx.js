// Dependency-free .xlsx builder (ZIP/STORE + SpreadsheetML, inline strings).
// Pure Web APIs (TextEncoder/Uint8Array) — runs in edge functions and
// browsers alike. Same generator as the admin page, server-side.

export function buildXlsx(rows) {
  const enc = new TextEncoder()
  const esc = (s) =>
    String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const sheetRows = rows
    .map(
      (r) =>
        '<row>' +
        r
          .map(
            (v) =>
              '<c t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>'
          )
          .join('') +
        '</row>'
    )
    .join('')
  const files = [
    ['[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>'],
    ['_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'],
    ['xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="会員リスト" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>'],
    ['xl/worksheets/sheet1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/>' +
      '<col min="3" max="3" width="32" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/>' +
      '<col min="5" max="5" width="10" customWidth="1"/></cols>' +
      '<sheetData>' + sheetRows + '</sheetData></worksheet>'],
  ]
  const TBL = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })()
  const crc32 = (u8) => {
    let c = 0xFFFFFFFF
    for (let i = 0; i < u8.length; i++) c = TBL[(c ^ u8[i]) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  const le16 = (v) => [v & 255, (v >>> 8) & 255]
  const le32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
  const chunks = []
  const central = []
  let offset = 0
  for (const [name, content] of files) {
    const nameU8 = enc.encode(name)
    const dataU8 = enc.encode(content)
    const crc = crc32(dataU8)
    const head = [].concat(
      le32(0x04034b50), le16(20), le16(0x0800), le16(0), le16(0), le16(DOS_DATE),
      le32(crc), le32(dataU8.length), le32(dataU8.length), le16(nameU8.length), le16(0)
    )
    chunks.push(new Uint8Array(head), nameU8, dataU8)
    central.push(
      new Uint8Array([].concat(
        le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(0), le16(0), le16(DOS_DATE),
        le32(crc), le32(dataU8.length), le32(dataU8.length), le16(nameU8.length),
        le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset)
      )),
      nameU8
    )
    offset += head.length + nameU8.length + dataU8.length
  }
  const centralStart = offset
  let centralSize = 0
  for (const u8 of central) {
    chunks.push(u8)
    centralSize += u8.length
  }
  chunks.push(new Uint8Array([].concat(
    le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length),
    le32(centralSize), le32(centralStart), le16(0)
  )))
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}
