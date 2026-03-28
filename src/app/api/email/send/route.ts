import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  emailNeuerFall,
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
  emailFallAbgeschlossen,
} from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  const body = await req.json()
  const { type, fallId } = body as { type: string; fallId: string }

  if (!type || !fallId) {
    return NextResponse.json({ error: 'type und fallId erforderlich' }, { status: 400 })
  }

  // Load fall data
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, sv_id, lead_id, regulierung_betrag')
    .eq('id', fallId)
    .single()

  if (!fall) {
    return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })
  }

  const fallNr = fall.fall_nummer ?? fall.id.slice(0, 8)

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
            await emailNeuerFall(admin.email, fallNr, fall.schadens_ursache ?? 'Unbekannt')
          }
        }
        break
      }

      case 'sv-zugewiesen': {
        if (!fall.sv_id) break
        const { data: sv } = await supabase
          .from('sachverstaendige')
          .select('profile_id')
          .eq('id', fall.sv_id)
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
        if (fall.lead_id) {
          const { data: lead } = await supabase
            .from('leads')
            .select('vorname, nachname')
            .eq('id', fall.lead_id)
            .single()
          if (lead) kundenName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
        }

        const adresse = [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'
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

      case 'fall-abgeschlossen': {
        if (!fall.lead_id) break
        const { data: lead } = await supabase
          .from('leads')
          .select('email')
          .eq('id', fall.lead_id)
          .single()
        if (!lead?.email) break

        const betrag = fall.regulierung_betrag
          ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(fall.regulierung_betrag))
          : '—'
        await emailFallAbgeschlossen(lead.email, fallNr, betrag)
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
