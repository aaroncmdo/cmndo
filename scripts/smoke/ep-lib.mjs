// Gemeinsame Bibliothek fuer die Entry-Point-Durchstiche (28.08.).
//
// Enthaelt: Service-Client, Identitaets-Erzeugung, Zustands-Abfrage (was ist entstanden?),
// und den Cleanup in der Reihenfolge, die schon mehrfach Waisen hinterlassen hat.
//
// ⚠ Identitaet: alle Test-Leads tragen eine @claimondo.de-Adresse mit Marker.
// Das ist NICHT kosmetisch — istInterneIdentitaet() haengt daran:
//   - der Test-SV-Guard laesst intern->Test-SV zu und blockt intern->ECHTER SV
//     (sonst bekommt ein echter Gutachter unsere Testtermine)
//   - die Send-Isolation unterdrueckt Kunden-Comms an interne Identitaeten
// Eine externe Adresse wuerde beides umkehren: echte SVs waeren buchbar, echte Sends gingen raus.

import { createClient } from '@supabase/supabase-js'

export const MARKER = 'EPSWEEP'
export const APP = 'https://app.claimondo.de'
export const MARKETING = 'https://claimondo.de'

export function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file?)')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Eindeutige interne Test-Identitaet je Einstieg + Lauf. */
export function identitaet(epId) {
  const stamp = Date.now().toString(36)
  return {
    epId,
    stamp,
    vorname: 'Epsweep',
    nachname: `${epId}${stamp.slice(-4).toUpperCase()}`,
    email: `epsweep-${epId.toLowerCase()}-${stamp}@claimondo.de`,
    // telefon bewusst LEER wo optional. Wo Pflicht: eine nicht vergebene Testnummer,
    // die zusammen mit der internen Email suppressed wird.
    telefon: '+491511000' + String(Math.floor(Math.random() * 900) + 100),
    kennzeichen: `K-EP${Math.floor(Math.random() * 9000) + 1000}`,
  }
}

/** Was ist zu dieser Identitaet entstanden? Eine Abfrage, alle relevanten Achsen. */
export async function zustand(db, email) {
  const out = { email }
  const { data: leads, error: leadErr } = await db
    .from('leads')
    .select('id, created_at, source_channel, status, service_typ, schuldfrage, telefon, vorname, nachname, kennzeichen, unfallhergang, unfallskizze_svg, unfallort, unfallort_plz, unfallort_lat, unfallort_lng, fahrzeug_standort_adresse, fahrzeug_standort_lat, unfalldatum, dsgvo_zustimmung_am')
    .eq('email', email)
  if (leadErr) throw new Error(`leads-Read: ${leadErr.message}`)
  out.leads = leads ?? []
  const leadIds = out.leads.map((l) => l.id)

  if (leadIds.length) {
    const [fl, cl, gt, at, gfa, na] = await Promise.all([
      db.from('flow_links').select('id, token, lead_id, status, erstellt_am').in('lead_id', leadIds),
      db.from('claims').select('id, claim_nummer, lead_id, operative_status, service_typ, kanzlei_wunsch, abrechnungsweg, sa_unterschrieben, sv_id, created_at').in('lead_id', leadIds),
      db.from('gutachter_termine').select('id, status, start_zeit, bezug_typ, bezug_id, assignee_id, durchgefuehrt_am').or(leadIds.map((id) => `bezug_id.eq.${id}`).join(',')),
      db.from('admin_termine').select('id, typ, status, lead_id, beschreibung').in('lead_id', leadIds),
      // ⚠ gutachter_finder_anfragen verweist ueber `konvertiert_zu_lead_id` — eine Spalte
      // `lead_id` gibt es NICHT. Stand hier falsch (29.08. gefunden): die Query schlug jedes
      // Mal fehl, `?? []` machte daraus eine leere Liste, und der Report meldete "gfa: 0".
      // Eine falsche Null liest sich wie "nichts entstanden".
      db.from('gutachter_finder_anfragen').select('id, status, regulierungs_modus, matching_typ, konvertiert_zu_lead_id, termin_id').in('konvertiert_zu_lead_id', leadIds),
      db.from('nachrichten').select('id, kanal, richtung, status, template_key, lead_id, claim_id, empfaenger_kontakt, created_at').in('lead_id', leadIds),
    ])
    // Fehler LAUT machen statt in `?? []` verschwinden zu lassen — sonst ist jede Null
    // zweideutig (nichts da vs. Query kaputt).
    for (const [name, r] of [['flow_links', fl], ['claims', cl], ['gutachter_termine', gt],
                             ['admin_termine', at], ['gutachter_finder_anfragen', gfa], ['nachrichten', na]]) {
      if (r.error) console.error(`  ⚠ zustand(): ${name} — ${r.error.message}`)
    }
    out.flowLinks = fl.data ?? []
    out.claims = cl.data ?? []
    out.termine = gt.data ?? []
    out.adminTermine = at.data ?? []
    out.gfa = gfa.data ?? []
    out.nachrichten = na.data ?? []
  } else {
    Object.assign(out, { flowLinks: [], claims: [], termine: [], adminTermine: [], gfa: [], nachrichten: [] })
  }

  // Claims koennen den Lead verloren haben (SET NULL) -> zusaetzlich ueber die Person suchen.
  const { data: claimsViaPerson } = await db
    .from('claims')
    .select('id, claim_nummer, lead_id, operative_status, service_typ, created_at')
    .gte('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .is('lead_id', null)
  out.verwaisteClaimsLetzte6h = (claimsViaPerson ?? []).length

  // Email-Versand laeuft ueber eine eigene Tabelle, nicht ueber nachrichten.
  const { data: mails } = await db
    .from('email_log')
    .select('id, empfaenger, template, status, lead_id, gesendet_am')
    .eq('empfaenger', email)
  out.mails = mails ?? []
  return out
}

/** Kompakte Zeile fuer die Ergebnistabelle. */
export function zusammenfassung(z) {
  const l = z.leads[0]
  return {
    lead: z.leads.length,
    source: l?.source_channel ?? null,
    status: l?.status ?? null,
    service_typ: l?.service_typ ?? null,
    flowLink: z.flowLinks.length,
    claim: z.claims.length,
    claimStatus: z.claims[0]?.operative_status ?? null,
    termine: z.termine.length,
    rueckruf: z.adminTermine.length,
    gfa: z.gfa.length,
    wa: z.nachrichten.filter((n) => n.kanal === 'whatsapp' && n.richtung === 'outbound').length,
    mails: z.mails.length,
    skizze: l?.unfallskizze_svg ? 'ja' : 'nein',
  }
}

/**
 * Cleanup in FK-sicherer Reihenfolge.
 * ⚠ Die Reihenfolge ist teuer erkauft:
 *   - claims.lead_id ist SET NULL -> Claims ZUERST einsammeln, sonst bleiben sie verwaist zurueck
 *   - partner_provisionen haengen an faelle_claim_bridge -> VOR der Bridge weg
 *   - gutachter_finder_anfragen VOR leads
 *   - admin_termine.lead_id VOR dem Lead-Delete
 * Jeder Delete wird geprueft (supabase-js wirft nicht) und gezaehlt.
 */
export async function cleanup(db, email) {
  const protokoll = []
  const fehler = []
  const del = async (tabelle, spalte, werte) => {
    if (!werte?.length) return
    const { data, error } = await db.from(tabelle).delete().in(spalte, werte).select('id')
    if (error) fehler.push(`${tabelle}: ${error.message}`)
    else if (data?.length) protokoll.push(`${tabelle}=${data.length}`)
  }

  const { data: leads } = await db.from('leads').select('id').eq('email', email)
  const leadIds = (leads ?? []).map((l) => l.id)

  // Claims ZUERST einsammeln (danach kappt der Lead-Delete die Spur)
  let claimIds = []
  if (leadIds.length) {
    const { data: c } = await db.from('claims').select('id').in('lead_id', leadIds)
    claimIds = (c ?? []).map((x) => x.id)
  }

  if (claimIds.length) {
    const { data: br } = await db.from('faelle_claim_bridge').select('fall_id, claim_id').in('claim_id', claimIds)
    const bridgeClaims = (br ?? []).map((b) => b.claim_id)
    await del('partner_provisionen', 'claim_id', bridgeClaims)
    await del('tasks', 'claim_id', claimIds)
    await del('pflichtdokumente', 'claim_id', claimIds)
    await del('claim_parties', 'claim_id', claimIds)
    await del('auftraege', 'claim_id', claimIds)
    await del('phase_transitions', 'claim_id', claimIds)
    await del('nachrichten', 'claim_id', claimIds)
    await del('faelle_claim_bridge', 'claim_id', claimIds)
    await del('claims', 'id', claimIds)
  }

  if (leadIds.length) {
    // Termine: beide Bezug-Achsen (bezug_id kanonisch + lead_id legacy)
    const { data: t1 } = await db.from('gutachter_termine').select('id').in('bezug_id', leadIds)
    const { data: t2 } = await db.from('gutachter_termine').select('id').in('lead_id', leadIds)
    await del('gutachter_termine', 'id', [...new Set([...(t1 ?? []), ...(t2 ?? [])].map((x) => x.id))])
    await del('admin_termine', 'lead_id', leadIds)
    // ⚠ NICHT `lead_id` — die Spalte heisst `konvertiert_zu_lead_id` (29.08. gefixt; der
    // Delete schlug jedes Mal fehl und haette bei einem Finder-Lauf Residue hinterlassen).
    await del('gutachter_finder_anfragen', 'konvertiert_zu_lead_id', leadIds)
    await del('flow_links', 'lead_id', leadIds)
    await del('nachrichten', 'lead_id', leadIds)
    await del('tasks', 'lead_id', leadIds)
    await del('leads', 'id', leadIds)
  }
  await del('email_log', 'empfaenger', [email])

  return { protokoll, fehler, leadIds, claimIds }
}
