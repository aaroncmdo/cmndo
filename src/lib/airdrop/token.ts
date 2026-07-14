// Airdrop-Token fuer die Gegner-Einladung (Slice 2c).
//
// Anders als das sonstige Klartext-Token-Hausmuster (schadenkarte/token.ts) erzwingt
// airdrop_invitations Hash+Prefix: token_hash NOT NULL UNIQUE + token_lookup_prefix
// varchar(8) NOT NULL. Der Klartext-Token geht nur per SMS an den Gegner und liegt nie
// in der DB. Vorbild: src/lib/auth/twofa/remember-me.ts.
import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 16 // -> 22 Zeichen base64url, 128 Bit Entropie
const PREFIX_LEN = 8 // == varchar(8) des Schemas

export function hashAirdropToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function airdropLookupPrefix(token: string): string {
  return token.slice(0, PREFIX_LEN)
}

export function generateAirdropToken(): { token: string; tokenHash: string; lookupPrefix: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashAirdropToken(token), lookupPrefix: airdropLookupPrefix(token) }
}
