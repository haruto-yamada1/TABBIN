import { Unzip, UnzipInflate, unzipSync } from 'fflate'

const MAX_BYTES = 5 * 1024 * 1024
const INPUT_CHUNK_BYTES = 1024

/** Read exactly one JSON entry as data; never materialize archive paths. */
export function readFlakeArchive(input: Uint8Array): string {
  if (input.byteLength > MAX_BYTES) {
    throw new Error('Compressed report exceeds budget')
  }
  let entries = 0
  let expectedSize = 0
  let expectedName = ''
  // Validate EOCD/central-directory metadata without inflating any entries.
  // Local-stream completion alone does not prove the archive is complete.
  unzipSync(input, {
    filter: (file) => {
      entries++
      if (entries !== 1 || !/^flake-[a-zA-Z0-9_.-]+\.json$/u.test(file.name)) {
        throw new Error('Invalid report archive entry')
      }
      if (file.originalSize > MAX_BYTES) {
        throw new Error('Expanded report exceeds budget')
      }
      expectedSize = file.originalSize
      expectedName = file.name
      return false
    },
  })
  if (entries !== 1) {
    throw new Error('Incomplete report archive')
  }
  let files = 0
  let bytes = 0
  let finished = false
  let exceeded = false
  const chunks: Buffer[] = []
  const reader = new Unzip((file) => {
    files++
    if (files !== 1 || file.name !== expectedName) {
      throw new Error('Invalid report archive entry')
    }
    if (file.originalSize !== undefined && file.originalSize > MAX_BYTES) {
      throw new Error('Expanded report exceeds budget')
    }
    file.ondata = (error, data, final) => {
      if (error) {
        throw new Error(
          exceeded
            ? 'Expanded report exceeds budget'
            : 'Invalid report archive data',
        )
      }
      bytes += data.byteLength
      if (bytes > MAX_BYTES) {
        exceeded = true
        file.terminate()
        throw new Error('Expanded report exceeds budget')
      }
      chunks.push(Buffer.from(data))
      finished = final
    }
    file.start()
  })
  reader.register(UnzipInflate)
  // Small compressed chunks bound decoder output between budget checks, even
  // when the entry's declared uncompressed size is forged or absent.
  for (let offset = 0; offset < input.byteLength; offset += INPUT_CHUNK_BYTES) {
    const end = Math.min(input.byteLength, offset + INPUT_CHUNK_BYTES)
    reader.push(input.subarray(offset, end), end === input.byteLength)
  }
  if (!finished || files !== 1 || bytes !== expectedSize) {
    throw new Error('Incomplete report archive')
  }
  return Buffer.concat(chunks, bytes).toString('utf8')
}
