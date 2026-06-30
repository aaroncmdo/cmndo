import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { headers } from 'next/headers'

// Geteilter IP-Rate-Limit — extrahiert aus dem sv-basic-Muster (claim-actions.ts).
// Nutzt die bestehende RPC check_gfa_rate_limit (generischer ip_hash-Bucket; der
// namespace trennt die Buckets pro Flow). failClosed=true -> RPC-Fehler ODER fehlende
// IP = ablehnen (fuer sicherheitsrelevante Aktionen wie Account-Anlage). failClosed=false
// -> durchlassen (low-risk). Server-only Helper (headers/admin) — kein 'use server'.

async function resolveIpHash(namespace: string): Promise<string | null> {
  const hdrs = await headers()
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip')?.trim() ||
    null
  if (!ip) return null
  return createHash('sha256').update(ip + ':' + namespace).digest('hex')
}

export async function checkIpRateLimit(
  namespace: string,
  opts: { failClosed: boolean },
): Promise<{ allowed: boolean; noIp: boolean }> {
  const ipHash = await resolveIpHash(namespace)
  if (!ipHash) {
    // Keine IP = kein Rate-Limit moeglich. Bei fail-closed ablehnen.
    return { allowed: !opts.failClosed, noIp: true }
  }
  const adminDb = createAdminClient()
  const { data: allowed, error } = await adminDb.rpc('check_gfa_rate_limit', {
    p_ip_hash: ipHash,
  })
  if (error) {
    console.error('[ip-rate-limit] check_gfa_rate_limit rpc failed:', error.message)
    return { allowed: !opts.failClosed, noIp: false }
  }
  return { allowed: allowed !== false, noIp: false }
}
