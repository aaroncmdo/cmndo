'use server'

// Storage-RLS-Rest: Vertrags-Unterschrift des SV.
//
// Vorher hat `/gutachter/vertrag` (Client-Component) das Signatur-PNG selbst
// mit dem Browser-Supabase-Client in den Bucket geschoben und danach
// `getStorageUrl` gerufen. Auf dem privaten Bucket liefert createSignedUrl im
// Browser aber `null` — der `unterschrift_url`-Write wurde uebersprungen, der
// Vertrag aber trotzdem als unterschrieben markiert. Ergebnis: unterschriebene
// Vertraege ohne hinterlegte Unterschrift.
//
// Jetzt server-seitig ueber den kanonischen Uploader `uploadSvUnterschrift`
// (Service-Client, Bucket `unterschriften`) — denselben Pfad nutzt bereits
// `signSvVertrag` im Onboarding.
//
// SICHERHEIT: die sv-ID kommt aus der Session (getGutachterForUser), nie vom
// Client. Ein Client-uebergebener svId waere eine user-manipulierbare
// Objekt-Referenz (OWASP A01/IDOR) — genau das tat die alte Client-Variante
// implizit, sie war nur durch RLS auf `sachverstaendige` gedeckt.

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { uploadSvUnterschrift } from '@/lib/actions/unterschrift-upload'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { signAndStoreContract } from '@/lib/contracts/sign-and-store'
import { headers } from 'next/headers'

/**
 * Markiert den Kooperationsvertrag des eingeloggten SV als unterschrieben und
 * persistiert die gezeichnete Signatur als wiederverwendbare Unterschrift.
 *
 * Bewusst NICHT `signSvVertrag`: das ist der Onboarding-Flow und erzeugt
 * zusaetzlich ein Vertrags-PDF, einen vertraege_unterzeichnet-Audit-Eintrag
 * und eine Welcome-Mail. Diese Seite auf jenen Flow umzustellen waere eine
 * Produktentscheidung, kein Bugfix — siehe Report/PR (Duplizierung der beiden
 * Vertrags-Oberflaechen ist ein offener Punkt fuer Aaron).
 */
export async function signVertragUnterschrift(
  signaturePngDataUri: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein SV-Profil gefunden' }

  // Best-effort (wie in signSvVertrag): ein fehlgeschlagener Signatur-Upload
  // darf die Vertrags-Zustimmung nicht blockieren — die Zustimmung ist der
  // rechtlich relevante Akt, das Bild ist Beiwerk.
  let unterschriftUrl: string | null = null
  try {
    const sig = await uploadSvUnterschrift(sv.id, signaturePngDataUri)
    if (sig.ok) unterschriftUrl = sig.url
    else console.error('[signVertragUnterschrift] Unterschrift-Upload:', sig.error)
  } catch (err) {
    console.error('[signVertragUnterschrift] Unterschrift-Upload throw:', err)
  }

  const { error } = await supabase
    .from('sachverstaendige')
    .update({
      vertrag_unterschrieben: true,
      vertrag_unterschrieben_am: new Date().toISOString(),
      ...(unterschriftUrl ? { unterschrift_url: unterschriftUrl } : {}),
    })
    .eq('id', sv.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/gutachter/vertrag')
  revalidatePath('/gutachter')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Basic-Partnervertrag nachholen (Aaron 20.09.2026: "3 ja")
//
// Gemessen am 20.09. auf prod: 16 von 22 freigeschalteten Basic-Gutachtern hatten
// keinen unterschriebenen Partnervertrag und NULL von ihnen eine Zeile in
// vertraege_unterzeichnet. Ursache: die Auto-Freischaltung (19.09.) laeuft ohne den
// Wizard-Abschluss, der den Vertrag sonst erzeugt haette.
//
// Diese Action ist der Nachhol-Weg. Anders als signVertragUnterschrift (oben) schreibt
// sie nicht nur zwei Flags, sondern geht durch dieselbe Pipeline wie der Basic-Wizard:
// signAndStoreContract erzeugt das PDF im Bucket `vertraege` und die Zeile in
// `vertraege_unterzeichnet` (vorlage_typ 'sv_basic_partnervertrag').
//
// Nicht blockierend: wer nicht unterschreibt, behaelt seinen Zugang und seine Faelle.

export async function signBasicPartnervertrag(
  signaturePngDataUri: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!signaturePngDataUri) return { ok: false, error: 'Unterschrift fehlt.' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string; paket: string | null }>(
    supabase,
    user.id,
    'id, paket',
  )
  if (!sv) return { ok: false, error: 'Kein SV-Profil gefunden' }
  if ((sv.paket ?? 'standard') !== 'basic') {
    return { ok: false, error: 'Dieser Vertrag gilt nur fuer Basic-Konten.' }
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()
  const unterschriftName =
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ').trim() || 'Sachverständiger'

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  try {
    await signAndStoreContract({
      vorlage_typ: 'sv_basic_partnervertrag',
      unterschrift_name: unterschriftName,
      unterschrift_ip: ip,
      unterschrift_user_agent: userAgent,
      signature_png_data_uri: signaturePngDataUri,
      sv_id: sv.id,
      rolle: 'Solo-Sachverstaendiger',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[signBasicPartnervertrag] signAndStoreContract:', msg)
    return { ok: false, error: `Vertrag konnte nicht erzeugt werden: ${msg}` }
  }

  // Signatur zusaetzlich als wiederverwendbare Unterschrift ablegen (best effort,
  // wie in signVertragUnterschrift): das PDF traegt sie ohnehin eingebrannt.
  let unterschriftUrl: string | null = null
  try {
    const sig = await uploadSvUnterschrift(sv.id, signaturePngDataUri)
    if (sig.ok) unterschriftUrl = sig.url
    else console.error('[signBasicPartnervertrag] Unterschrift-Upload:', sig.error)
  } catch (err) {
    console.error('[signBasicPartnervertrag] Unterschrift-Upload throw:', err)
  }

  const { error } = await admin
    .from('sachverstaendige')
    .update({
      vertrag_unterschrieben: true,
      vertrag_unterschrieben_am: new Date().toISOString(),
      partnervertrag_hinweis_am: new Date().toISOString(),
      ...(unterschriftUrl ? { unterschrift_url: unterschriftUrl } : {}),
    })
    .eq('id', sv.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/gutachter/vertrag')
  revalidatePath('/gutachter')
  return { ok: true }
}
