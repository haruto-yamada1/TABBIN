import assert from 'node:assert/strict'
import {
  constants,
  generateKeyPairSync,
  privateEncrypt,
  sign,
  verify,
} from 'node:crypto'

import forge from 'node-forge'

// A real low-exponent RSA key exercises the affected PKCS#1 v1.5 parser.
// Native privateEncrypt preserves the supplied DigestInfo bytes in RSA padding.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicExponent: 3,
})
const forgePublicKey = forge.pki.publicKeyFromPem(
  publicKey.export({ format: 'pem', type: 'pkcs1' }).toString(),
)
const message = Buffer.from('TABBIN node-forge RSA validation regression')
const hash = forge.md.sha256.create()
hash.update(message.toString())
const digest = hash.digest().getBytes()
const { asn1 } = forge
const sha256Oid = forge.pki.oids.sha256
assert.ok(sha256Oid)

const element = (
  type: forge.asn1.Type,
  constructed: boolean,
  value: string | forge.asn1.Asn1[],
): forge.asn1.Asn1 =>
  asn1.create(asn1.Class.UNIVERSAL, type, constructed, value)

const encodeDigestInfo = (
  withParameters: boolean,
  extraChildren: forge.asn1.Asn1[] = [],
): string => {
  const algorithm = [
    element(asn1.Type.OID, false, asn1.oidToDer(sha256Oid).getBytes()),
    ...(withParameters ? [element(asn1.Type.NULL, false, '')] : []),
    ...extraChildren,
  ]
  return asn1
    .toDer(
      element(asn1.Type.SEQUENCE, true, [
        element(asn1.Type.SEQUENCE, true, algorithm),
        element(asn1.Type.OCTETSTRING, false, digest),
      ]),
    )
    .getBytes()
}

const nodeSignature = sign('sha256', message, privateKey)
const createSignature = (digestInfo: string): string =>
  privateEncrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(digestInfo, 'binary'),
  ).toString('binary')
assert.equal(verify('sha256', message, publicKey, nodeSignature), true)
assert.equal(
  forgePublicKey.verify(digest, nodeSignature.toString('binary')),
  true,
)
assert.equal(
  forgePublicKey.verify(
    forge.md.sha256.create().update('modified message').digest().getBytes(),
    nodeSignature.toString('binary'),
  ),
  false,
)

for (const withParameters of [false, true]) {
  const validSignature = createSignature(encodeDigestInfo(withParameters))
  assert.equal(forgePublicKey.verify(digest, validSignature), true)

  for (const extraChildren of [
    [element(asn1.Type.OCTETSTRING, false, 'attacker padding')],
    [element(asn1.Type.NULL, false, ''), element(asn1.Type.NULL, false, '')],
  ]) {
    const malformedSignature = createSignature(
      encodeDigestInfo(withParameters, extraChildren),
    )
    assert.throws(
      () => forgePublicKey.verify(digest, malformedSignature),
      /valid RSASSA-PKCS1-v1_5 DigestInfo/,
      'RSA verification must reject extra nested DigestAlgorithm elements',
    )
  }
}

for (const invalidParameters of ['x', 'x'.repeat(32)]) {
  const malformedSignature = createSignature(
    encodeDigestInfo(false, [
      element(asn1.Type.NULL, false, invalidParameters),
    ]),
  )
  assert.throws(
    () => forgePublicKey.verify(digest, malformedSignature),
    /valid RSASSA-PKCS1-v1_5 DigestInfo/,
    'RSA verification must reject non-empty ASN.1 NULL parameters',
  )
}

console.log('node-forge RSA DigestAlgorithm and NULL validation verified')
