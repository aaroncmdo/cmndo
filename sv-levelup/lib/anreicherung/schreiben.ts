import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Der Service-Role-Client wird HEREINGEGEBEN, nicht hier beschafft.
 *
 * Zwei Gruende: (1) `@/lib/supabase/admin` importiert 'server-only', was in
 * jeder Node-Umgebung ausserhalb von Next schon beim Import wirft — der
 * CLI-Runner und die Tests koennten dieses Modul sonst nicht laden.
 * (2) Wer eine Datenbank braucht, soll sie bekommen; das macht den Schreibpfad
 * an jeder Aufrufstelle sichtbar.
 */
export type Db = SupabaseClient

/** Die fuenf Felder, die die Anreicherung ueberhaupt anfassen darf (R-M). */
export type AnreicherungsFeld = 'email' | 'telefon' | 'website_url' | 'vorname' | 'nachname'

/** Wie die Website gefunden wurde (CONTEXT §6: Spalte `website_gefunden`). */
export type WebsiteMethode = 'impressum' | 'domain_raten' | 'verzeichnis' | 'manuell'

export type Fund = {
  feld: AnreicherungsFeld
  wert: string
  /** Wo es gefunden wurde — Pflicht, damit spaeter belegbar ist, woher eine Adresse stammt. */
  quelleUrl: string
  /**
   * Wie belastbar DIESER Wert ist. Bei Rollenadressen hoechstens 60 (T-25) —
   * hinter `info@` steckt keine benennbare Person.
   */
  sicherheit: number
  /**
   * Wie sicher die QUELLE zu diesem Lead gehoert (Website-Sicherheit).
   *
   * ⚠ Getrennt von `sicherheit`, weil beides sonst in einer Zahl kollidiert:
   * eine Rollenadresse von einer perfekt zugeordneten Website hat sicherheit 60
   * und zuordnung 100. Wer die Kanal-Schwelle auf `sicherheit` legt, verwirft
   * damit JEDE Rollenadresse — bei Sachverstaendigen die haeufigste
   * Impressumsadresse. Am Bestand aufgefallen (sv-wester.de, 18.08.).
   *
   * Fehlt der Wert, gilt `sicherheit` — fuer Aufrufer ohne Quellenbezug.
   */
  zuordnung?: number
  /** Nur beim Feld `website_url` gesetzt. */
  methode?: WebsiteMethode
}

export type SchreibErgebnis =
  | { ok: true; geschrieben: AnreicherungsFeld[]; uebersprungen: { feld: string; grund: string }[] }
  | { ok: false; error: string }

/** Die einzige Liste — `rueckwaerts.ts` importiert sie, statt sie zu wiederholen. */
export const FELDER: AnreicherungsFeld[] = ['email', 'telefon', 'website_url', 'vorname', 'nachname']

/**
 * Mindest-Zuordnungssicherheit fuer KONTAKTdaten.
 *
 * ⚠ Verschaerfung gegenueber CONTEXT §5, das "unter 70 schreiben, aber in der
 * Vertriebsliste markieren" vorsieht. Begruendung am Bestand (18.08.,
 * Trockenlauf): "Ing.-Büro Urbach KG" traf `sv-ing.de` mit Sicherheit 40 — eine
 * fremde Firma, deren Impressum eine fremde Telefonnummer lieferte.
 *
 * Der Unterschied, den die Spec nicht macht: eine Website mit 40 ist ein
 * Rechercheanhaltspunkt, den ein Mensch beim Draufschauen korrigiert. Eine
 * Adresse mit 40 ist ein KANAL — die Cold Mail geht automatisiert raus, an einen
 * Unbeteiligten. Das ist §7 Abs. 2 UWG gegenueber jemandem, der nicht einmal
 * zur Zielgruppe gehoert, und es beschaedigt die Absender-Reputation.
 * Markieren reicht dort nicht, weil zwischen Markierung und Versand kein
 * Mensch mehr steht.
 */
export const KONTAKT_MINDESTSICHERHEIT = 70
const KONTAKTFELDER: AnreicherungsFeld[] = ['email', 'telefon', 'vorname', 'nachname']

/**
 * Schreibt Funde in sv_leads — und zwar AUSSCHLIESSLICH in Leerstellen (F-16, T-24).
 *
 * Warum ein eigener Schreibpfad und nicht upsertSvLead: die RPC sv_lead_upsert
 * macht `email = coalesce(nullif(excluded.email,''), sv_leads.email)` — ein neuer
 * Wert UEBERSCHREIBT dort den alten. Hier ist es umgekehrt: ein gefuelltes Feld
 * bleibt unangetastet, auch wenn der Fund "besser" aussieht. Ausserdem ist die
 * RPC ein Upsert ganzer Identitaeten (mit name/adresse/geo als Pflicht), kein
 * Feld-Update.
 *
 * Reihenfolge der Regeln — sie ist Teil der Zusage:
 *   1. Suppression:  eine abgemeldete Adresse wird GAR NICHT erst geschrieben
 *   2. Leerstelle:   ein gefuelltes Feld wird nie ueberschrieben
 *   3. Row-Check:    supabase-js wirft nicht — ein 0-Row-Update ist ein FEHLER,
 *                    kein Erfolg (DSGVO-Storno-Lehre)
 *   4. Audit:        Zeilen in levelup_anreicherung erst NACH wirksamem Update
 */
export async function schreibeFunde(
  db: Db,
  leadId: string,
  funde: Fund[],
  laufId: string,
  opts: { dryRun?: boolean } = {},
): Promise<SchreibErgebnis> {
  if (funde.length === 0) return { ok: true, geschrieben: [], uebersprungen: [] }

  const uebersprungen: { feld: string; grund: string }[] = []

  // 1. Ist-Zustand laden. Ohne den koennen wir "leer" nicht feststellen.
  const { data: lead, error: ladeFehler } = await db
    .from('sv_leads')
    .select('id,email,telefon,website_url,vorname,nachname')
    .eq('id', leadId)
    .single()

  if (ladeFehler || !lead) {
    return { ok: false, error: `Lead ${leadId} nicht lesbar: ${ladeFehler?.message ?? 'nicht gefunden'}` }
  }

  // 2. Suppression VOR allem anderen — abgemeldete Adressen kommen nicht in die DB.
  const emailFunde = funde.filter((f) => f.feld === 'email').map((f) => f.wert)
  let gesperrt = new Set<string>()
  if (emailFunde.length > 0) {
    const { data: sup, error: supFehler } = await db
      .from('cold_mail_suppression')
      .select('email')
      .in('email', emailFunde)
    if (supFehler) {
      return { ok: false, error: `Suppression-Pruefung fehlgeschlagen: ${supFehler.message}` }
    }
    gesperrt = new Set((sup ?? []).map((s: { email: string }) => s.email.toLowerCase()))
  }

  // 3. Entscheiden, was ueberhaupt geschrieben wird.
  const werte: Record<string, unknown> = {}
  const auditZeilen: Record<string, unknown>[] = []

  for (const fund of funde) {
    if (!FELDER.includes(fund.feld)) {
      uebersprungen.push({ feld: fund.feld, grund: 'kein Anreicherungsfeld' })
      continue
    }
    // Erster Fund je Feld gewinnt. Sonst ueberschreibt der zweite den Wert im
    // Update-Objekt, das Audit protokolliert aber BEIDE — und behauptet damit
    // einen Schreibvorgang, der nicht passiert ist. Die Reihenfolge der Funde
    // ist die Rangfolge der Quellen (/impressum vor /kontakt).
    if (auditZeilen.some((z) => z.feld === fund.feld)) {
      uebersprungen.push({ feld: fund.feld, grund: 'Duplikat im Fund-Satz' })
      continue
    }
    // Geprueft wird die ZUORDNUNG der Quelle, nicht die Belastbarkeit des
    // Werts: sonst faellt jede Rollenadresse durch (siehe Fund.zuordnung).
    const zuordnung = fund.zuordnung ?? fund.sicherheit
    if (KONTAKTFELDER.includes(fund.feld) && zuordnung < KONTAKT_MINDESTSICHERHEIT) {
      uebersprungen.push({
        feld: fund.feld,
        grund: `Zuordnung zu unsicher (${zuordnung} < ${KONTAKT_MINDESTSICHERHEIT})`,
      })
      continue
    }
    if (fund.feld === 'email' && gesperrt.has(fund.wert.toLowerCase())) {
      uebersprungen.push({ feld: fund.feld, grund: 'in cold_mail_suppression' })
      continue
    }
    const vorher = (lead as Record<string, unknown>)[fund.feld]
    if (vorher !== null && vorher !== undefined && String(vorher).trim() !== '') {
      uebersprungen.push({ feld: fund.feld, grund: 'bereits gefuellt' })
      continue
    }
    werte[fund.feld] = fund.wert

    // Begleitspalten (CONTRACT §281) — nur zusammen mit ihrem Feld. Wird das
    // Feld uebersprungen, darf auch die Metadatenzeile nicht einsickern: eine
    // Sicherheit von 40 neben einer alten, belastbaren Website waere eine Luege.
    if (fund.feld === 'website_url') {
      if (fund.methode) werte.website_gefunden = fund.methode
      werte.website_sicherheit = fund.sicherheit
    }
    if (fund.feld === 'email' || fund.feld === 'telefon') {
      werte.kontakt_quelle = fund.quelleUrl
    }

    auditZeilen.push({
      sv_lead_id: leadId,
      feld: fund.feld,
      wert_vorher: vorher ?? null,
      wert_nachher: fund.wert,
      quelle_url: fund.quelleUrl,
      sicherheit: fund.sicherheit,
      lauf_id: laufId,
    })
  }

  // NICHT Object.keys(werte) — dort stehen auch die Begleitspalten, die keine
  // Anreicherungsfelder sind und die Trefferquote verfaelschen wuerden.
  const geschrieben = auditZeilen.map((z) => z.feld as AnreicherungsFeld)
  if (geschrieben.length === 0) return { ok: true, geschrieben: [], uebersprungen }
  if (opts.dryRun) return { ok: true, geschrieben, uebersprungen }

  // 4. Schreiben — mit .select(), weil supabase-js nicht wirft.
  werte.angereichert_am = new Date().toISOString()
  const { data: zeilen, error: updateFehler } = await db
    .from('sv_leads')
    .update(werte)
    .eq('id', leadId)
    .select()

  if (updateFehler) return { ok: false, error: `Update fehlgeschlagen: ${updateFehler.message}` }
  if (!zeilen || zeilen.length === 0) {
    // Kein Fehler UND keine Zeile: RLS oder ein verschwundener Lead. Das ist der
    // stille Fehlschlag, den wir hier nicht als Erfolg durchlassen.
    return { ok: false, error: `Update traf 0 Zeilen fuer Lead ${leadId}` }
  }

  // 5. Audit erst jetzt — der Log soll nichts behaupten, was nicht passiert ist.
  const { error: auditFehler } = await db.from('levelup_anreicherung').insert(auditZeilen)
  if (auditFehler) {
    return { ok: false, error: `Werte geschrieben, aber Audit fehlgeschlagen: ${auditFehler.message}` }
  }

  return { ok: true, geschrieben, uebersprungen }
}
