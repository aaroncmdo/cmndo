// Pure Token-Erzeugung + Redemption-Eligibility (Airdrop-Muster: Hash+Prefix, Klartext nur im Link).
import { createHash, randomBytes } from 'node:crypto'

export type EinladungZielRolle = 'sachverstaendiger' | 'werkstatt' | 'makler'
const TOKEN_BYTES = 16
const PREFIX_LEN = 8

export function hashEinladungToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateEinladungToken(): { token: string; tokenHash: string; lookupPrefix: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashEinladungToken(token), lookupPrefix: token.slice(0, PREFIX_LEN) }
}

export function istEinloesbar(row: { status: string; ablauf_am: string }, jetzt: Date = new Date()): boolean {
  return row.status === 'offen' && new Date(row.ablauf_am) > jetzt
}

export const ROLLE_TO_REGISTRIER_PFAD: Record<EinladungZielRolle, string> = {
  sachverstaendiger: '/sv/registrieren',
  werkstatt: '/werkstatt/registrieren',
  makler: '/makler/registrieren',
}
