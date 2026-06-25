'use server'

import { revalidatePath } from 'next/cache'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'
import { extrahiereKvaAusBase64, type KvaOcrResult } from '@/lib/ai/kostenvoranschlag-ocr'
import type { WerkstattKvaInput } from './types'

export async function extrahiereKvaOcr(
  input: { base64: string; mediaType: string },
): Promise<{ ok: true; data: KvaOcrResult } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!input?.base64) return { ok: false, error: 'Kein Dokument' }
  return extrahiereKvaAusBase64(input)
}

export async function erstelleWerkstattLeadAusKva(
  daten: WerkstattKvaInput,
): Promise<{ ok: true; token: string; leadId: string } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) return { ok: false, error: 'Werkstatt nicht gefunden' }

  const admin = createAdminClient()
  const ort = [werkstatt.adresse_plz, werkstatt.adresse_ort].filter(Boolean).join(' ').trim()
  const besichtigungsort = [werkstatt.adresse_strasse, ort].filter(Boolean).join(', ').trim() || null

  const { data: gfa, error } = await admin
    .from('gutachter_finder_anfragen')
    .insert({
      vorname: (daten.vorname ?? '').trim() || 'Kunde',
      nachname: (daten.nachname ?? '').trim() || '(Werkstatt-KVA)',
      email: (daten.email ?? '').trim(),
      telefon: (daten.telefon ?? '').trim() || null,
      schadentyp: 'Unfallschaden',
      status: 'neu',
      werkstatt_id: werkstatt.id,
      besichtigungsort_adresse: besichtigungsort,
      schadenort: besichtigungsort,
      fahrzeug_hersteller: daten.fahrzeug_hersteller ?? null,
      fahrzeug_modell: daten.fahrzeug_modell ?? null,
      kennzeichen: daten.kennzeichen ?? null,
      fin_vin: daten.fin ?? null,
      erstzulassung: daten.erstzulassung ?? null,
      fahrzeug_baujahr: daten.fahrzeug_baujahr ?? null,
      kostenvoranschlag_netto: daten.kostenvoranschlag_netto ?? null,
      kostenvoranschlag_brutto: daten.kostenvoranschlag_brutto ?? null,
      ocr_rohdaten: (daten.ocrRoh as Record<string, unknown> | null) ?? null,
      ocr_extrahiert_am: new Date().toISOString(),
    } as Record<string, unknown>)
    .select('id')
    .single()
  if (error || !gfa) return { ok: false, error: error?.message ?? 'Anlage fehlgeschlagen' }

  const issued = await issueCanonicalFlowLinkForAnfrage(gfa.id as string, {
    send: !!(daten.telefon && daten.telefon.trim()) && daten.perWhatsApp === true,
  })
  if (!issued.ok) return { ok: false, error: issued.error }

  // KVA-Dokument an den Lead haengen (non-critical).
  try {
    if (daten.kvaBase64 && daten.kvaMediaType) {
      const ext = daten.kvaMediaType === 'application/pdf' ? 'pdf' : (daten.kvaMediaType.split('/')[1] ?? 'bin')
      const bytes = Buffer.from(daten.kvaBase64, 'base64')
      await admin.storage
        .from('fall-dokumente')
        .upload(`leads/${issued.leadId}/kostenvoranschlag_${Date.now()}.${ext}`, bytes, {
          contentType: daten.kvaMediaType,
          upsert: false,
        })
    }
  } catch (e) {
    console.error('[werkstatt-kva] KVA-Doc-Upload fehlgeschlagen (nicht kritisch):', e)
  }

  revalidatePath('/werkstatt')
  revalidatePath('/werkstatt/kva')
  return { ok: true, token: issued.token, leadId: issued.leadId }
}
