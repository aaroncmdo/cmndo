'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  freigebenProvision,
  storniereProvision,
  auszahlenProvision,
  resolveLedgerKontext,
  PROVISION_TABELLEN,
} from '@/lib/finance/provision-status'
import {
  korrigierePartnerGutschrift,
  computeKorrekturBetraege,
} from '@/lib/finance/partner-gutschrift-korrektur'
import { partnerTabelleFuer } from '@/lib/finance/partner-tabellen'
import {
  markBezahlt,
  retryEinzug,
  stornoAbrechnung,
} from '@/app/admin/abrechnungen/actions'

// AAR-664: Nur async Funktionen exportieren — keine Konst/Typen aus 'use server'-Files.

/** Inline Admin-Guard — gibt { ok:true } zurueck oder { ok:false, error } wenn nicht admin. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht autorisiert' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nicht autorisiert' }
  return { ok: true }
}

/**
 * Markiert eine Rechnung manuell als bezahlt (z.B. nach Bank-Ueberweisung).
 * Nur fuer quelle='abrechnungen' unterstuetzt.
 */
export async function markiereAlsBezahlt(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (quelle !== 'abrechnungen') {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const r = await markBezahlt(id)
  revalidatePath('/admin/finance')
  return r.success ? { ok: true } : { ok: false, error: r.error }
}

/**
 * Loest einen erneuten Stripe-Lastschrift-Einzug aus.
 * Nur fuer quelle='abrechnungen' unterstuetzt.
 */
export async function loeseEinzugErneutAus(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (quelle !== 'abrechnungen') {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const r = await retryEinzug(id)
  revalidatePath('/admin/finance')
  return r.success ? { ok: true } : { ok: false, error: r.error }
}

/**
 * Gibt eine Provision frei (Status -> 'freigegeben').
 * Quelle muss eine der 5 Provisions-/Bonus-Tabellen sein.
 */
export async function gebeProvisionFrei(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (!(PROVISION_TABELLEN as readonly string[]).includes(quelle)) {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const admin = createAdminClient()

  // P3 Netzwerk (Review-Fund): der manuelle Freigeben-Pfad darf die Freundes-Graph-Suppression
  // nicht UNINFORMIERT umgehen — die pending-Zeile traegt im Panel keinen Intra-Indikator, und
  // nach manueller Freigabe fasst der (gegatete) Release-Cron die Row nie wieder an. Dieselbe
  // Pruefung wie im Cron; bei intra-Netzwerk wird abgelehnt (KEIN Write — der Cron markiert die
  // Row bei Release-Berechtigung selbst als 'unterdrueckt'). Fail-open: schlaegt die Pruefung
  // fehl, zaehlt die Admin-Entscheidung (Status quo).
  if (quelle === 'partner_provisionen') {
    try {
      const { data: row } = await admin
        .from('partner_provisionen')
        .select('id, partner_typ, partner_id, claim_id')
        .eq('id', id)
        .maybeSingle()
      if (row) {
        const { bestimmeIntraNetzwerkProvisionen } = await import('@/lib/netzwerk/provisions-suppression')
        const intra = await bestimmeIntraNetzwerkProvisionen(admin, [
          row as { id: string; partner_typ: string; partner_id: string; claim_id: string | null },
        ])
        if (intra.has(id)) {
          return {
            ok: false,
            error:
              'Netzwerk-intern: Der vermittelnde Partner ist mit dem zugewiesenen Gegenpart befreundet — diese Provision wird nicht vergütet (das Netzwerkpartner-Abo deckt sie). Der Release-Lauf markiert sie automatisch als „Netzwerk-intern".',
          }
        }
      }
    } catch (err) {
      console.error('[gebeProvisionFrei] Netzwerk-Gate fehlgeschlagen — Admin-Entscheidung zaehlt (fail-open):', err)
    }
  }

  const r = await freigebenProvision(admin, quelle as (typeof PROVISION_TABELLEN)[number], id)
  revalidatePath('/admin/finance')
  return r
}

/**
 * Zahlt eine Provision aus (Freeze USt + Status -> ausgezahlt/paid).
 * Quelle muss eine der 5 Provisions-/Bonus-Tabellen sein.
 */
export async function zahleProvisionAus(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (!(PROVISION_TABELLEN as readonly string[]).includes(quelle)) {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const admin = createAdminClient()
  const r = await auszahlenProvision(admin, quelle as (typeof PROVISION_TABELLEN)[number], id)
  revalidatePath('/admin/finance')
  return r
}

/**
 * Storniert eine Rechnung oder Provision.
 * - quelle='abrechnungen' -> stornoAbrechnung (Stripe Refund + Storno-Rechnung)
 * - quelle in PROVISION_TABELLEN -> storniereProvision
 */
export async function storniere(
  quelle: string,
  id: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (quelle === 'abrechnungen') {
    const r = await stornoAbrechnung(id, grund)
    revalidatePath('/admin/finance')
    return r.success ? { ok: true } : { ok: false, error: r.error }
  }

  if ((PROVISION_TABELLEN as readonly string[]).includes(quelle)) {
    const admin = createAdminClient()
    const r = await storniereProvision(
      admin,
      quelle as (typeof PROVISION_TABELLEN)[number],
      id,
      grund,
    )
    revalidatePath('/admin/finance')
    return r
  }

  return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
}

/**
 * Speichert Steuerdaten eines Partners (ust_id + Adresse) fuer die Gutschrift-Erstellung.
 * Schreibt auf makler / werkstaetten / firmen.
 *
 * Neue Spalten via Migration in diesem Branch — Typen folgen beim Merge-Regen (Regel 2).
 * Payload daher als `never` gecastet.
 */
export async function setzePartnerSteuerdaten(
  partnerTyp: 'makler' | 'werkstatt' | 'firmen_flotte',
  partnerId: string,
  daten: { ust_id?: string; adresse_strasse?: string; adresse_plz?: string; adresse_ort?: string },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const updateObj: Record<string, string | null> = {}
  if ('ust_id' in daten) updateObj.ust_id = daten.ust_id?.trim() || null
  if ('adresse_strasse' in daten) updateObj.adresse_strasse = daten.adresse_strasse?.trim() || null
  if ('adresse_plz' in daten) updateObj.adresse_plz = daten.adresse_plz?.trim() || null
  if ('adresse_ort' in daten) updateObj.adresse_ort = daten.adresse_ort?.trim() || null

  if (Object.keys(updateObj).length === 0) {
    return { ok: false, error: 'Keine Daten' }
  }

  const table = partnerTabelleFuer(partnerTyp)
  if (!table) return { ok: false, error: `Unbekannter partner_typ '${partnerTyp}'` }
  const admin = createAdminClient()

  const { error } = await admin
    .from(table)
    .update(updateObj as never)
    .eq('id', partnerId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/finance')
  revalidatePath('/admin/werkstaetten')
  revalidatePath('/admin/finance')
  return { ok: true }
}

/**
 * Setzt den USt-Status eines Partners (Kleinunternehmer ja/nein).
 * Schreibt ist_kleinunternehmer auf makler / werkstaetten / firmen.
 *
 * Hinweis: ist_kleinunternehmer ist via Migration in diesem Branch neu — Typen
 * folgen beim Merge-Regen (Regel 2). Payload daher als `never` gecastet.
 */
export async function setzePartnerUstStatus(
  partnerTyp: 'makler' | 'werkstatt' | 'firmen_flotte',
  partnerId: string,
  istKleinunternehmer: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const table = partnerTabelleFuer(partnerTyp)
  if (!table) return { ok: false, error: `Unbekannter partner_typ '${partnerTyp}'` }
  const admin = createAdminClient()

  // ist_kleinunternehmer: Spalte per Migration in Branch angelegt, Typen noch nicht regeneriert.
  const { error } = await admin
    .from(table)
    .update({ ist_kleinunternehmer: istKleinunternehmer } as never)
    .eq('id', partnerId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/finance')
  return { ok: true }
}

/**
 * Erstellt eine signierte Signed-URL fuer die Gutschrift-PDF eines Ledger-Eintrags.
 * Laedt aus partner_gutschriften den pdf_storage_path und gibt eine 5-Minuten-Signed-URL zurueck.
 */
export async function getPartnerGutschriftDownloadUrl(
  ledgerTabelle: string,
  ledgerId: string,
  typ: 'gutschrift' | 'storno' = 'gutschrift',
  gutschriftId?: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const admin = createAdminClient()

  // Praezise per Gutschrift-ID (nach einer Korrektur hat ein Ledger mehrere typ='gutschrift'-Zeilen:
  // stornierte + aktive Original). Fallback ohne ID: ledger+typ, aktiv-/aktualitaets-bewusst
  // (neueste zuerst + limit 1) statt bloss .maybeSingle() -> kein PGRST116 bei mehreren Zeilen.
  const { data: g, error } = gutschriftId
    ? await admin.from('partner_gutschriften').select('pdf_storage_path').eq('id', gutschriftId).maybeSingle()
    : await admin
        .from('partner_gutschriften')
        .select('pdf_storage_path')
        .eq('ledger_tabelle', ledgerTabelle)
        .eq('ledger_id', ledgerId)
        .eq('typ', typ)
        .order('erstellt_am', { ascending: false })
        .limit(1)
        .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!g?.pdf_storage_path) return { ok: false, error: 'Keine Gutschrift-PDF vorhanden' }

  const { data: signed, error: urlErr } = await admin.storage
    .from('abrechnungen-pdf')
    .createSignedUrl(g.pdf_storage_path as string, 300)

  if (urlErr || !signed?.signedUrl) return { ok: false, error: urlErr?.message ?? 'Signed-URL-Fehler' }
  return { ok: true, url: signed.signedUrl }
}

/**
 * Laedt alle Billing-Zeilen + Aggregat + USt-Flag eines einzelnen Partners.
 * Wird vom Admin-Drawer in Makler-, Werkstatt-, Firmen-Flotten- und Kanzlei-Listen on-demand aufgerufen.
 *
 * Fuer 'kanzlei': kein ist_kleinunternehmer (Forderungs-Partner, immer 19% USt) → null.
 * Fuer alle anderen Typen: gibt zusaetzlich gutschriftDocsByLedger (Original + Storno je Ledger) zurueck.
 */
export async function ladePartnerBilling(
  partnerTyp: 'makler' | 'werkstatt' | 'firmen_flotte' | 'kanzlei',
  partnerId: string,
): Promise<
  | {
      ok: true
      rows: import('@/lib/finance/partner-billing').PartnerBillingRow[]
      aggregat: import('@/lib/finance/partner-billing').PartnerBillingAggregat
      istKleinunternehmer: boolean | null
      steuerdaten: { ust_id: string | null; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null } | null
      gutschriftDocsByLedger: Record<string, import('@/lib/finance/partner-billing').LedgerGutschriftDocs>
    }
  | { ok: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  let istKleinunternehmer: boolean | null = null
  let steuerdaten: { ust_id: string | null; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null } | null = null
  let gutschriftDocsByLedger: Record<string, import('@/lib/finance/partner-billing').LedgerGutschriftDocs> = {}

  // Kanzlei ist Forderungs-Partner ohne Steuerdaten-Spalten → skip
  if (partnerTyp !== 'kanzlei') {
    const table = partnerTabelleFuer(partnerTyp)
    if (!table) return { ok: false, error: `Unbekannter partner_typ '${partnerTyp}'` }
    const admin = createAdminClient()

    // Spalten per Migration in Branch angelegt — Typen folgen beim Merge-Regen
    const { data } = await admin
      .from(table)
      .select('ist_kleinunternehmer, ust_id, adresse_strasse, adresse_plz, adresse_ort')
      .eq('id', partnerId)
      .single()
    const row = data as {
      ist_kleinunternehmer: boolean | null
      ust_id: string | null
      adresse_strasse: string | null
      adresse_plz: string | null
      adresse_ort: string | null
    } | null
    istKleinunternehmer = row?.ist_kleinunternehmer ?? null
    steuerdaten = row
      ? { ust_id: row.ust_id, adresse_strasse: row.adresse_strasse, adresse_plz: row.adresse_plz, adresse_ort: row.adresse_ort }
      : null

    // Gutschrift-Belege je Ledger laden (Original + Storno) fuer Download + Bezug-Anzeige.
    const { data: gs } = await admin
      .from('partner_gutschriften')
      .select('id, gutschrift_nr, typ, status, bezug_gutschrift_id, ledger_tabelle, ledger_id')
      .eq('partner_typ', partnerTyp)
      .eq('partner_id', partnerId)
    const { buildGutschriftDocsByLedger } = await import('@/lib/finance/partner-billing')
    gutschriftDocsByLedger = buildGutschriftDocsByLedger(
      (gs ?? []) as import('@/lib/finance/partner-billing').GutschriftRohzeile[],
    )
  }

  const { getPartnerBilling } = await import('@/lib/finance/partner-billing')

  try {
    const { rows, aggregat } = await getPartnerBilling({ partnerTyp, partnerId })
    return { ok: true, rows, aggregat, istKleinunternehmer, steuerdaten, gutschriftDocsByLedger }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

/**
 * Vorschau fuer das Korrektur-Modal: Betraege der aktiven Original-Gutschrift + Recompute-Default
 * aus den aktuellen Ledger-/Partner-Daten. Alles in Cent (DB speichert EUR -> *100). recompute
 * faellt auf die Original-Werte zurueck, wenn der USt-Status (noch) unbekannt ist.
 */
export async function getKorrekturVorschauAction(
  ledgerTabelle: string,
  ledgerId: string,
): Promise<
  | {
      ok: true
      original: { nettoCent: number; ustSatz: number | null; ustBetragCent: number | null; bruttoCent: number; nr: string }
      recompute: { nettoCent: number; ustSatz: number | null; ustBetragCent: number | null; bruttoCent: number }
    }
  | { ok: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!(PROVISION_TABELLEN as readonly string[]).includes(ledgerTabelle)) {
    return { ok: false, error: 'Korrektur für diese Quelle nicht verfügbar' }
  }

  const admin = createAdminClient()
  const { data: orig, error } = await admin
    .from('partner_gutschriften')
    .select('gutschrift_nr, betrag_netto, ust_satz, ust_betrag, betrag_brutto')
    .eq('ledger_tabelle', ledgerTabelle)
    .eq('ledger_id', ledgerId)
    .eq('typ', 'gutschrift')
    .neq('status', 'storniert')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!orig) return { ok: false, error: 'Keine aktive Gutschrift zum Korrigieren gefunden' }
  const o = orig as Record<string, number | string | null>

  const toCent = (v: number | string | null): number => Math.round(Number(v ?? 0) * 100)
  const original = {
    nettoCent: toCent(o.betrag_netto),
    ustSatz: o.ust_satz === null || o.ust_satz === undefined ? null : Number(o.ust_satz),
    ustBetragCent: o.ust_betrag === null || o.ust_betrag === undefined ? null : toCent(o.ust_betrag),
    bruttoCent: toCent(o.betrag_brutto),
    nr: String(o.gutschrift_nr),
  }

  const kt = await resolveLedgerKontext(admin, ledgerTabelle as (typeof PROVISION_TABELLEN)[number], ledgerId)
  const rc = kt.ok
    ? computeKorrekturBetraege({ currentNettoEur: kt.ctx.nettoEur, istKleinunternehmer: kt.ctx.istKleinunternehmer })
    : ({ ok: false, error: 'kontext' } as const)
  const recompute = rc.ok
    ? {
        nettoCent: rc.betraege.nettoCent,
        ustSatz: rc.betraege.ustSatz,
        ustBetragCent: rc.betraege.ustBetragCent,
        bruttoCent: rc.betraege.bruttoCent,
      }
    : {
        nettoCent: original.nettoCent,
        ustSatz: original.ustSatz,
        ustBetragCent: original.ustBetragCent,
        bruttoCent: original.bruttoCent,
      }

  return { ok: true, original, recompute }
}

/**
 * Korrigiert eine ausgestellte Partner-Gutschrift: Storno der aktiven Original + korrigierte
 * Neuausstellung (recompute + optionales Override netto/ust_satz). Delegiert an den Baustein.
 */
export async function korrigierePartnerGutschriftAction(
  ledgerTabelle: string,
  ledgerId: string,
  grund: string,
  override?: { nettoCent?: number; ustSatz?: number },
): Promise<{ ok: boolean; error?: string; stornoNummer?: string; korrekturNummer?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!(PROVISION_TABELLEN as readonly string[]).includes(ledgerTabelle)) {
    return { ok: false, error: 'Korrektur für diese Quelle nicht verfügbar' }
  }
  if (!grund?.trim()) return { ok: false, error: 'Bitte einen Korrektur-Grund angeben.' }

  const admin = createAdminClient()
  const r = await korrigierePartnerGutschrift(admin, ledgerTabelle, ledgerId, grund.trim(), override)

  revalidatePath('/admin/finance')
  revalidatePath('/admin/finance')
  revalidatePath('/admin/werkstaetten')
  revalidatePath('/admin/makler')
  return r
}
