import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeStaff, type StaffDb } from '@/lib/levelup/staff'
import { ladeCheck } from '@/lib/levelup/check'
import { leiteAb } from '@/lib/levelup/massnahmen'
import { baueGespraech } from '@/lib/levelup/gespraech'
import { modulNachId, type ModulId } from '@/lib/levelup/registry'
import type { ModulErgebnis } from '@/lib/levelup/messmaschine'
import type { Fehlstelle } from '@/lib/levelup/modul-vertrag'
import type { Db } from '@/lib/anreicherung/schreiben'
import { AuswertungClient } from './AuswertungClient'

export const dynamic = 'force-dynamic'

type LeadZeile = {
  id: string
  firma: string | null
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  website_url: string | null
  claim_status: string | null
  konvertiert_zu_sv_id: string | null
  kontakt_quelle: string | null
  angereichert_am: string | null
}

export default async function AuswertungSeite(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params

  // Schranke 1 — Mitarbeiter.
  const sitzung = await createClient()
  const staff = await pruefeStaff(sitzung as unknown as StaffDb)
  if (!staff.ok) redirect('/anmelden')

  const db = createAdminClient() as unknown as Db

  // Schranke 2 — der Token muss aufgehen.
  const { data: link } = await db
    .from('levelup_auswertungslinks')
    .select('id,check_id,aufrufe')
    .eq('token', token)
    .maybeSingle()

  if (!link) notFound()
  const linkZeile = link as { id: string; check_id: string; aufrufe: number }

  const { data: checkZeile } = await db
    .from('levelup_checks')
    .select('token')
    .eq('id', linkZeile.check_id)
    .maybeSingle()

  if (!checkZeile) notFound()
  const check = await ladeCheck(db, (checkZeile as { token: string }).token)
  if (!check) notFound()

  // Aufruf vermerken — nicht kritisch, ein Fehlschlag darf die Seite nicht
  // aufhalten.
  const { error: zaehlFehler } = await db
    .from('levelup_auswertungslinks')
    .update({ aufrufe: linkZeile.aufrufe + 1, letzter_aufruf: new Date().toISOString() })
    .eq('id', linkZeile.id)
    .select()
  if (zaehlFehler) console.error('Aufruf nicht vermerkt:', zaehlFehler.message)

  const befunde = (check.befunde ?? {}) as Record<string, ModulErgebnis>
  const fehlstellen = (check.fehlstellen ?? {}) as Record<string, Fehlstelle[]>
  const massnahmen = leiteAb(befunde)
  const gespraech = baueGespraech(befunde, massnahmen)

  // Lead samt Herkunft der Kontaktdaten — „woher stammt diese Adresse" ist im
  // Gespraech die Frage, die zuerst kommt.
  let lead: LeadZeile | null = null
  if (check.sv_lead_id) {
    const { data } = await db
      .from('sv_leads')
      .select('id,firma,vorname,nachname,email,telefon,website_url,claim_status,konvertiert_zu_sv_id,kontakt_quelle,angereichert_am')
      .eq('id', check.sv_lead_id)
      .maybeSingle()
    lead = (data as LeadZeile) ?? null
  }

  // ⚠ Spaltennamen gegen die Datenbank geprueft, nicht geraten — und die
  // Fehler ausgewertet. Beide Abfragen standen beim ersten Durchlauf auf
  // erfundenen Namen (`start_am`, `antworten`) und lieferten still nichts.
  const [terminAntwort, funnelAntwort] = await Promise.all([
    db.from('levelup_termine')
      .select('slot_start,telefon,einwilligung_am')
      .eq('check_id', check.id)
      .maybeSingle(),
    db.from('levelup_funnel')
      .select('jahre_erfahrung,ki_nutzung,marketing_partner')
      .eq('check_id', check.id)
      .maybeSingle(),
  ])
  if (terminAntwort.error) console.error('Termin nicht lesbar:', terminAntwort.error.message)
  if (funnelAntwort.error) console.error('Funnel nicht lesbar:', funnelAntwort.error.message)

  const termin = terminAntwort.data as { slot_start: string; telefon: string | null } | null
  const funnelZeile = funnelAntwort.data as {
    jahre_erfahrung: string | null
    ki_nutzung: string | null
    marketing_partner: string | null
  } | null

  // Nur beantwortete Fragen zeigen — eine leere Zeile waere ein Kasten ohne
  // Inhalt, und der Funnel ist ausdruecklich ueberspringbar.
  const funnel: Record<string, string> = {}
  if (funnelZeile?.jahre_erfahrung) funnel.jahreErfahrung = funnelZeile.jahre_erfahrung
  if (funnelZeile?.ki_nutzung) funnel.kiNutzung = funnelZeile.ki_nutzung
  if (funnelZeile?.marketing_partner) funnel.marketingPartner = funnelZeile.marketing_partner

  // Modulliste für die Filterleiste — nur Module, die tatsächlich etwas
  // geliefert haben (gemessen ODER als Fehlstelle vermerkt).
  const modulIds = [...new Set([...Object.keys(befunde), ...Object.keys(fehlstellen)])] as ModulId[]
  // ⚠ NICHT `module` nennen: Next verbietet den Namen (er kollidiert mit der
  // CommonJS-Variablen), und die Regel `no-assign-module-variable` bricht den
  // Lauf — der Build selbst laeuft vorher gruen durch.
  const modulKacheln = modulIds.map((id) => ({
    id,
    titel: modulNachId(id)?.titel ?? id,
    istPunkte: befunde[id]?.istPunkte ?? 0,
    maxPunkte: befunde[id]?.maxPunkte ?? 0,
    fehlstellen: (fehlstellen[id] ?? []).length,
  }))

  return (
    <AuswertungClient
      firmenname={check.firmenname}
      ort={check.standort_ort}
      modus={check.modus}
      score={check.score}
      keinScore={check.kein_score}
      punkteErhebbar={check.punkte_erhebbar}
      erhobenAm={check.erhoben_am}
      websiteUrl={check.website_url}
      checkToken={check.token}
      module={modulKacheln}
      befunde={befunde}
      fehlstellen={fehlstellen}
      massnahmen={massnahmen}
      gespraech={gespraech}
      lead={lead}
      terminAm={termin?.slot_start ?? null}
      terminTelefon={termin?.telefon ?? null}
      funnel={Object.keys(funnel).length > 0 ? funnel : null}
    />
  )
}
