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
