const TEXT_ENCODINGS = ['utf-8', 'shift_jis', 'euc-jp', 'gb18030', 'big5', 'euc-kr'] as const

function hasBom(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8'
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf-16le'
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'utf-16be'
  }
  return null
}

function tryDecode(bytes: Uint8Array, encoding: string, strict: boolean): string | null {
  try {
    const decoder = new TextDecoder(encoding, { fatal: strict })
    const decoded = decoder.decode(bytes)
    if (strict && decoded.includes('\uFFFD')) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

export function detectAndDecode(bytes: Uint8Array): string {
  const bomEncoding = hasBom(bytes)
  if (bomEncoding) {
    const decoded = tryDecode(bytes, bomEncoding, false)
    if (decoded !== null) {
      return decoded.replace(/^\uFEFF/, '')
    }
  }

  const utf8Result = tryDecode(bytes, 'utf-8', true)
  if (utf8Result !== null) {
    return utf8Result.replace(/^\uFEFF/, '')
  }

  for (const encoding of TEXT_ENCODINGS) {
    if (encoding === 'utf-8') continue
    const result = tryDecode(bytes, encoding, false)
    if (result !== null && !result.includes('\uFFFD')) {
      return result
    }
  }

  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
}

export function decodeWithEncoding(bytes: Uint8Array, encoding?: string): string {
  if (!encoding) {
    return detectAndDecode(bytes)
  }
  const result = tryDecode(bytes, encoding, false)
  return result !== null
    ? result.replace(/^\uFEFF/, '')
    : new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
}
