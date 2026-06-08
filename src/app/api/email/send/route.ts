import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import {
  emailNeuerFall,
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
} from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  const body = await req.json()
  const { type, fallId } = body as { type: string; fallId: string }

  if (!type || !fallId) {
    return NextResponse.json({ error: 'type und fallId erforderlich' }, { status: 400 })
  }

  // Load fall data
  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  // CMM-49: claims-direkt (SSoT) via resolveClaimId — sv_id/lead_id sind claims<->faelle
  // 0-diff; claim_nummer/schadenort_*/schadens_ursache claims-nativ. faelle-frei.
  const emClaimId = await resolveClaimId(supabase, fallId)
  const { data: fallClaim } = emClaimId
    ? await supabase
        .from('claims')
        .select('sv_id, lead_id, claim_nummer, schadenort_adresse, schadenort_plz, schadenort_ort, schadens_ursache')
        .eq('id', emClaimId)
        .maybeSingle()
    : { data: null }

  if (!fallClaim) {
    return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })
  }

  const fallNr = fallClaim.claim_nummer ?? fallId.slice(0, 8)

  try {
    switch (type) {
      case 'neuer-fall': {
        // Get admin emails
        const { data: admins } = await supabase
          .from('profiles')
          .select('email')
          .eq('rolle', 'admin')
        for (const admin of admins ?? []) {
          if (admin.email) {
            await emailNeuerFall(admin.email, fallNr, (fallClaim?.schadens_ursache as string | null) ?? 'Unbekannt')
          }
        }
        break
      }

      case 'sv-zugewiesen': {
        if (!fallClaim.sv_id) break
        const { data: sv } = await supabase
          .from('sachverstaendige')
          .select('profile_id')
          .eq('id', fallClaim.sv_id)
          .single()
        if (!sv) break
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, vorname, nachname')
          .eq('id', sv.profile_id)
          .single()
        if (!profile?.email) break

        // Get customer name
        let kundenName = '—'
        if (fallClaim.lead_id) {
          const { data: lead } = await supabase
            .from('leads')
            .select('vorname, nachname')
            .eq('id', fallClaim.lead_id)
            .single()
          if (lead) kundenName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
        }

        const adresse = [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ') || '—'
        await emailSvZugewiesen(profile.email, fallNr, kundenName, adresse)
        break
      }

      case 'gutachten-eingegangen': {
        const { data: admins } = await supabase
          .from('profiles')
          .select('email')
          .eq('rolle', 'admin')
        for (const admin of admins ?? []) {
          if (admin.email) {
            await emailGutachtenEingegangen(admin.email, fallNr)
          }
        }
        break
      }

      case 'filmcheck-bestanden': {
        // Send to kanzlei role
        const { data: kanzlei } = await supabase
          .from('profiles')
          .select('email')
          .eq('rolle', 'kanzlei')
        for (const k of kanzlei ?? []) {
          if (k.email) {
            await emailFilmcheckBestanden(k.email, fallNr)
          }
        }
        break
      }

      default:
        return NextResponse.json({ error: `Unbekannter Typ: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/email/send]', err)
    return NextResponse.json({ error: 'E-Mail konnte nicht gesendet werden' }, { status: 500 })
  }
}
