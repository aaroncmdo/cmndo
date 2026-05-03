// AAR-717: AES-256-GCM-Encryption für CalDAV-Credentials.
//
// Der CalDAV-Standard kennt kein OAuth — wir müssen Username + App-Passwort
// persistieren. Klartext-Speicher ist inakzeptabel, also AES-256-GCM mit
// einem Master-Key (CALDAV_ENCRYPTION_KEY, 32 Byte Base64) aus den Env-Vars.
//
// Format: "<iv_b64>:<authTag_b64>:<ciphertext_b64>"
//   - Random IV (12 Byte) pro Encrypt — darf nie wiederverwendet werden
//   - Auth-Tag (16 Byte) garantiert Integrität (tampered ciphertext → throw)
//   - Key ist 32 Byte aus CALDAV_ENCRYPTION_KEY (base64-decoded)

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM Standard
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const raw = process.env.CALDAV_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'CALDAV_ENCRYPTION_KEY nicht gesetzt — erforderlich für CalDAV-Credential-Speicherung',
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `CALDAV_ENCRYPTION_KEY muss 32 Byte (base64-decoded) lang sein, ist aber ${key.length}`,
    )
  }
  return key
}

export function encrypt(plaintext: string): string {
  if (!plaintext) throw new Error('encrypt: leerer plaintext nicht erlaubt')
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decrypt(encoded: string): string {
  if (!encoded) throw new Error('decrypt: leerer Ciphertext nicht erlaubt')
  const parts = encoded.split(':')
  if (parts.length !== 3) {
    throw new Error('decrypt: Format-Fehler — erwartet "iv:tag:ciphertext"')
  }
  const [ivB64, tagB64, ctB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ciphertext = Buffer.from(ctB64, 'base64')
  if (iv.length !== IV_LENGTH) {
    throw new Error(`decrypt: IV-Länge ${iv.length} statt ${IV_LENGTH}`)
  }
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`decrypt: AuthTag-Länge ${tag.length} statt ${AUTH_TAG_LENGTH}`)
  }
  const key = getKey()
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
