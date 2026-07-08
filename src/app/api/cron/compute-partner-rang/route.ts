import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeSvKandidaten, ladeMaklerKandidaten, type Kandidat } from '@/lib/partner-rang/signals'
import { computePartnerStrength } from '@/lib/partner-rang/compute'
import { ladeRangConfig } from '@/lib/partner-rang/config-loader'

// Naechtlicher Cron: berechnet Partner-Rang (Bronze/Silber/Gold) je SV + Makler und
// upsertet partner_rang. Config kommt aus der DB-SSoT (partner_rang_config). Werkstatt
// dormant (kein Volumen). Auth: Bearer ${CRON_SECRET} (Projekt-Konvention).
//
// VPS-Crontab-Eintrag (Aaron) — naechtliche Ausfuehrung um 03:00 Uhr:
//   0 3 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/compute-partner-rang
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const config = await ladeRangConfig(supabase)
  const [svs, makler] = await Promise.all([ladeSvKandidaten(supabase), ladeMaklerKandidaten(supabase)])
  const alle: Kandidat[] = [...svs, ...makler]
  const rows = alle.map((k) => {
    const r = computePartnerStrength(k.signals, config)
    return {
      partner_typ: k.signals.typ, partner_id: k.id, volumen: k.signals.volumen,
      score: r.score, credential_score: r.credentialScore, rating_score: r.ratingScore,
      gate_ok: r.gateOk, gate_cap: r.gateCap, rang: r.tier, sinnsatz: r.sinnsatz,
      stand: new Date().toISOString(),
    }
  })
  let updated = 0
  if (rows.length > 0) {
    const { error } = await supabase.from('partner_rang').upsert(rows, { onConflict: 'partner_typ,partner_id' })
    if (error) {
      console.error('[partner-rang] upsert fehlgeschlagen:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    updated = rows.length
  }
  return NextResponse.json({ ok: true, computed: alle.length, updated })
}
