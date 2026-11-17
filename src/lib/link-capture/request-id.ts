const UUID_BYTES = 16
const UUID_VERSION_MASK = 15
const UUID_V4_BITS = 0x40
const UUID_VARIANT_MASK = 63
const UUID_VARIANT_BITS = 0x80
const HEX_BASE = 16

/** getRandomValues is available in isolated worlds on ordinary HTTP pages too. */
export const createCaptureRequestId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES))
  bytes[6] = ((bytes[6] ?? 0) & UUID_VERSION_MASK) | UUID_V4_BITS
  bytes[8] = ((bytes[8] ?? 0) & UUID_VARIANT_MASK) | UUID_VARIANT_BITS
  const hex = Array.from(bytes, (byte) =>
    byte.toString(HEX_BASE).padStart(2, '0'),
  ).join('')
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
}
