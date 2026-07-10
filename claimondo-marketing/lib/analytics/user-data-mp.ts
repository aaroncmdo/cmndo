// SERVER-ONLY: SHA-256-gehashte user-provided data fuer GA4 Measurement Protocol
// (Enhanced Conversions). Normalisiert (E.164/lowercase/trim) → SHA-256 hex.
// Wird von ga4-mp.sendGa4Event in den MP-Body als `user_data` gehaengt.
import { createHash } from 'node:crypto'
import { toE164 } from './user-data'

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export type MpUserDataInput = {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
}

/** GA4-MP user_data (pre-gehasht). null wenn keine brauchbaren Felder. */
export function buildHashedUserData(input: MpUserDataInput): Record<string, unknown> | null {
  const ud: Record<string, unknown> = {}
  const email = input.email?.trim().toLowerCase()
  if (email && email.includes('@')) ud.sha256_email_address = sha256(email)
  const phone = toE164(input.phone ?? undefined)
  if (phone) ud.sha256_phone_number = sha256(phone)
  const address: Record<string, string> = {}
  const first = input.firstName?.trim().toLowerCase()
  const last = input.lastName?.trim().toLowerCase()
  if (first) address.sha256_first_name = sha256(first)
  if (last) address.sha256_last_name = sha256(last)
  if (Object.keys(address).length > 0) ud.address = address
  return Object.keys(ud).length > 0 ? ud : null
}
