import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-152 Phase 3: Community-Leaderboard taeglich aktualisieren.
 *
 * Schedule (vercel.json): 0 4 * * *  — taeglich 04:00 UTC
 *
 * Pro Community mit community_leaderboard_aktiv=true:
 *   - Aggregiere alle Faelle des aktuellen Monats pro Mitglied
 *   - count, umsatz, durchschnitt_bearbeitungsdauer
 *   - rang via sort + index
 *   - Upsert in community_leaderboard (UNIQUE constraint org/sv/monat/jahr)
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  const monthStart = new Date(jahr, monat - 1, 1).toISOString()
  const monthEnd = new Date(jahr, monat, 1).toISOString()

  // Alle Communities mit aktivem Leaderboard
  const { data: communities } = await db.from('organisationen')
    .select('id, name')
    .eq('typ', 'community')
    .eq('community_leaderboard_aktiv', true)

  if (!communities?.length) {
    return NextResponse.json({ ok: true, communities: 0, eintraege: 0 })
  }

  let totalEintraege = 0

  for (const community of communities) {
    // Alle Mitglieder der Community
    const { data: members } = await db.from('sachverstaendige')
      .select('id')
      .eq('organisation_id', community.id)
      .eq('rolle_in_organisation', 'community_member')

    if (!members?.length) continue

    // Pro Mitglied: Faelle des aktuellen Monats aggregieren
    const aggregates: Array<{
      sv_id: string
      faelle_count: number
      umsatz_netto: number
      durchschnitt_bearbeitungsdauer_h: number | null
    }> = []

    for (const m of members) {
      // CMM-49: claims-direkt (faelle-frei). claims.sv_id==faelle.sv_id (0-diff); faelle.id
      // wird im Aggregat nicht genutzt. Filter direkt auf claims.created_at.
      const { data: claimRows } = await db.from('claims')
        .select('abgeschlossen_am, created_at, lead_preis_netto')
        .eq('sv_id', m.id)
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd)

      const count = claimRows?.length ?? 0
      const umsatz = (claimRows ?? []).reduce(
        (s, c) => s + Number((c as { lead_preis_netto?: number | null }).lead_preis_netto ?? 0),
        0,
      )

      // Durchschnitts-Bearbeitungsdauer (h) aus created_at -> abgeschlossen_am (claims = SSoT).
      const completedClaims = (claimRows ?? []).filter(
        (c) => (c as { abgeschlossen_am?: string | null }).abgeschlossen_am,
      )
      let avgDauerH: number | null = null
      if (completedClaims.length > 0) {
        const totalH = completedClaims.reduce((s, c) => {
          const diff =
            new Date((c as { abgeschlossen_am: string }).abgeschlossen_am).getTime() -
            new Date((c as { created_at: string }).created_at).getTime()
          return s + diff / (1000 * 60 * 60)
        }, 0)
        avgDauerH = Math.round((totalH / completedClaims.length) * 100) / 100
      }

      aggregates.push({
        sv_id: m.id,
        faelle_count: count,
        umsatz_netto: umsatz,
        durchschnitt_bearbeitungsdauer_h: avgDauerH,
      })
    }

    // Sortieren nach faelle_count DESC, dann umsatz DESC
    aggregates.sort((a, b) => {
      if (b.faelle_count !== a.faelle_count) return b.faelle_count - a.faelle_count
      return b.umsatz_netto - a.umsatz_netto
    })

    // Upsert in community_leaderboard mit Rang
    for (let i = 0; i < aggregates.length; i++) {
      const a = aggregates[i]
      const { error: upErr } = await db.from('community_leaderboard').upsert({
        organisation_id: community.id,
        sv_id: a.sv_id,
        zeitraum_monat: monat,
        zeitraum_jahr: jahr,
        faelle_count: a.faelle_count,
        umsatz_netto: a.umsatz_netto,
        durchschnitt_bearbeitungsdauer_h: a.durchschnitt_bearbeitungsdauer_h,
        rang: i + 1,
        letzte_aktualisierung: new Date().toISOString(),
      }, { onConflict: 'organisation_id,sv_id,zeitraum_monat,zeitraum_jahr' })

      if (upErr) {
        console.error(`[KFZ-152] Leaderboard upsert org=${community.id} sv=${a.sv_id}:`, upErr.message)
      } else {
        totalEintraege++
      }
    }
  }

  console.log(`[KFZ-152] Community-Leaderboard updated: communities=${communities.length} eintraege=${totalEintraege}`)
  return NextResponse.json({ ok: true, communities: communities.length, eintraege: totalEintraege, monat, jahr })
}
