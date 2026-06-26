'use server'

// On-Demand-QR fuer eine Werkstatt im Admin-Portal. Spiegelt kva/qr-action.ts.
// Liefert den regulaeren Kunden-Einstiegs-QR (/start/werkstatt/<id>) — NICHT den KVA-QR.

import { createClient } from '@/lib/supabase/server'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { werkstattStartUrl } from '@/lib/start-link/werkstatt-start-url'

export async function werkstattQrSvg(
  werkstattId: string,
): Promise<{ ok: true; svg: string; url: string; name: string } | { ok: false; error: string }> {
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins duerfen QR-Codes abrufen.' }

  const { data: w } = await supabase.from('werkstaetten').select('name').eq('id', werkstattId).single()
  if (!w) return { ok: false, error: 'Werkstatt nicht gefunden.' }

  const url = werkstattStartUrl(werkstattId)
  const svg = await generateQrCodeSvg(url, 300)
  return { ok: true, svg, url, name: w.name }
}
