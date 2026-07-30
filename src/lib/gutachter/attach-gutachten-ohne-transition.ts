// P4 (Netzwerk SV-Vermittlungs-Flow): der reine DATENTEIL des Gutachten-Uploads —
// Storage + fall_dokumente + gutachten-Upsert + paket_faelle_genutzt-Increment.
// BEWUSST OHNE transitionFallStatus/checkFallAutoPhase/Filmcheck-Task (das macht
// uploadGutachten fuer den Normal-Flow): der Sofort-Claim ist bereits in
// 'gutachten-eingegangen' geboren, die QC-/Billing-Effekte sind auf POST-Onboarding
// aufgeschoben (resumeFunnelAfterOnboarding). Result-Object, wirft nicht.
import type { createAdminClient } from '@/lib/supabase/admin'
import { getStorageUrl } from '@/lib/storage/url'

export async function attachGutachtenOhneTransition(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    claimId: string
    fallId: string
    svId: string
    file: File
    betrag: number
    userId: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const { claimId, fallId, svId, file, betrag, userId } = input

  // Storage-Upload (Muster uploadGutachten): gutachten/<fallId>/<ts>-<name>.
  const filePath = `gutachten/${fallId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await admin.storage.from('fall-dokumente').upload(filePath, file)
  if (uploadError) return { ok: false, error: `Upload fehlgeschlagen: ${uploadError.message}` }

  const pdfUrl = await getStorageUrl(admin, 'fall-dokumente', filePath)
  if (!pdfUrl) return { ok: false, error: 'URL-Generierung fehlgeschlagen' }

  const { error: docError } = await admin.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: 'gutachten',
    storage_path: filePath,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    kategorie: 'gutachten',
    quelle: 'gutachter',
    hochgeladen_von_user_id: userId,
    uploaded_by_sv: true,
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  } as never)
  if (docError) return { ok: false, error: `Dokument-Eintrag fehlgeschlagen: ${docError.message}` }

  // gutachten-Upsert (SSoT: fertiggestellt_am + gesamt_schadensbetrag; sv_id NOT NULL).
  const { error: gErr } = await admin
    .from('gutachten')
    .upsert(
      {
        claim_id: claimId,
        sv_id: svId,
        fertiggestellt_am: new Date().toISOString(),
        gesamt_schadensbetrag: betrag,
      } as never,
      { onConflict: 'claim_id' },
    )
  if (gErr) return { ok: false, error: `Gutachten-Eintrag fehlgeschlagen: ${gErr.message}` }

  // SV-Kapazitaets-Zaehler (Dispatch-Signal) — wie uploadGutachten, non-fatal.
  try {
    const { data: svData } = await admin
      .from('sachverstaendige')
      .select('paket_faelle_genutzt')
      .eq('id', svId)
      .single()
    if (svData) {
      await admin
        .from('sachverstaendige')
        .update({ paket_faelle_genutzt: ((svData.paket_faelle_genutzt as number | null) ?? 0) + 1 } as never)
        .eq('id', svId)
    }
  } catch (err) {
    console.warn('[attachGutachtenOhneTransition] Zaehler non-fatal:', err)
  }

  return { ok: true }
}
