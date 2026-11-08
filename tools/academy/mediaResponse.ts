type MediaResponse = {
  status: 200 | 206 | 416
  headers: Record<string, string>
  body: Buffer
}

/** Single byte ranges for the playback verifier's immutable local assets.
 * Other range formats are ignored (RFC 9110 section 14.2).
 */
export const createMediaResponse = (
  file: Buffer,
  range: string | undefined,
): MediaResponse => {
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Length': String(file.length),
  }
  const match = /^bytes=(\d+)-(\d*)$/u.exec(range ?? '')
  if (!match) {
    return { status: 200, headers, body: file }
  }
  const start = Number(match[1])
  const end = Math.min(
    file.length - 1,
    match[2] ? Number(match[2]) : file.length - 1,
  )
  if (start >= file.length || end < start) {
    return {
      status: 416,
      headers: {
        ...headers,
        'Content-Length': '0',
        'Content-Range': `bytes */${file.length}`,
      },
      body: Buffer.alloc(0),
    }
  }
  const body = file.subarray(start, end + 1)
  return {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(body.length),
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
    },
    body,
  }
}
