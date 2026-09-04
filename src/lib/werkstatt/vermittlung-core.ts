// Geteilter Vermittlungs-Kern (PURE, client-safe): Gate + Patch + Typen.
// KEINE Server-only-Imports (createAdminClient/notify) — die liegen in
// vermittlung-server.ts, damit brauchtWerkstattVermittlung auch im Client
// (FlowWizard-Gate) importierbar bleibt, ohne Server-Code ins Bundle zu ziehen.
// Authz liegt beim jeweiligen Caller (Rolle/Token/Ownership VOR dem Write).

export type VermittlungQuelle = 'dispatcher' | 'kunde' | 'embed' | 'gutachter' | 'kb' | 'qr_referral'
export type VermittlungTarget = { target: 'lead' | 'claim'; id: string }

/** Minimal-Shape fuer das Sichtbarkeits-Gate (Lead ODER Claim). */
export type BedarfRow = {
  reparaturwunsch?: string | null
  reparatur_werkstatt_id?: string | null
  werkstatt_id?: string | null
  reparatur_vermittlung_status?: string | null
  /** Kasko-WB Phase 1: false = Versicherer benennt die Werkstatt -> wir vermitteln NICHT. */
  freie_werkstattwahl?: boolean | null
}

/**
 * Picker sichtbar? Wenn Reparatur ODER fiktive Abrechnung gewuenscht (SP4d: der
 * Kunde kann auch bei fiktiver Abrechnung eine Werkstatt suchen — z.B. guenstiger
 * reparieren + Differenz behalten), noch KEINE Partner-Werkstatt vermittelt, KEIN
 * Inbound-QR-Werkstatt (dann hat der Kunde faktisch schon eine) und der operative
 * Status offen ist. reparatur_werkstatt_id IS NULL dominiert: sobald vermittelt,
 * bleibt der Picker ueberall verborgen.
 */
export function brauchtWerkstattVermittlung(row: BedarfRow): boolean {
  return (
    row.freie_werkstattwahl !== false &&
    (row.reparaturwunsch === 'reparatur' || row.reparaturwunsch === 'fiktiv') &&
    row.reparatur_werkstatt_id == null &&
    row.werkstatt_id == null &&
    (row.reparatur_vermittlung_status ?? 'offen') === 'offen'
  )
}

/**
 * Darf DIESE Auswahl angenommen werden — und muss dabei der Abrechnungswunsch nachgetragen
 * werden? (28.08.2026)
 *
 * Hintergrund: Der Werkstatt-Step im /flow laesst sich nicht wegkonfigurieren, wenn der Kunde
 * die Frage "Wie moechtest du den Schaden abrechnen?" uebersprungen hat — FlowWizardKfz friert
 * die Step-Sequenz beim Mount ein (gegen die Stale-Index-Falle), und `reparaturwunsch` wird
 * erst mitten im Flow erhoben. Der Schritt wird also angeboten; dann muss er auch bedienbar
 * sein. Prod-verifiziert war vorher: fuenf Werkstaetten sichtbar, jede Auswahl abgelehnt.
 *
 * Die Werkstattwahl IST die Antwort auf die uebersprungene Frage — aber nur, wenn ueberhaupt
 * keine gegeben wurde. `'keine'` ist eine klare Absage an die Reparatur und wird NIE
 * ueberschrieben.
 */
export function pruefeWerkstattAuswahl(row: BedarfRow): {
  erlaubt: boolean
  /** true = `reparaturwunsch` muss vor der Zuweisung auf 'reparatur' gesetzt werden. */
  wunschNachtragen: boolean
} {
  if (brauchtWerkstattVermittlung(row)) return { erlaubt: true, wunschNachtragen: false }

  const nichtFestgelegt = row.reparaturwunsch == null || row.reparaturwunsch === 'unentschieden'
  // Nur der WUNSCH darf fehlen — alle uebrigen Sperren (bereits vermittelt, Inbound-Werkstatt,
  // Status nicht offen) bleiben in Kraft.
  const nurDerWunschFehlt =
    nichtFestgelegt && brauchtWerkstattVermittlung({ ...row, reparaturwunsch: 'reparatur' })

  return { erlaubt: nurDerWunschFehlt, wunschNachtragen: nurDerWunschFehlt }
}

/**
 * Die fuenf Felder einer Zuweisung (die vier reparatur_werkstatt_* + status).
 * Type-Lag: die generierten DB-Types kennen die Spalten (noch) nicht -> der
 * Caller schreibt das Objekt via Record-/`as never`-Cast.
 */
export function buildZuweisungPatch(
  werkstattId: string,
  userId: string | null,
  quelle: VermittlungQuelle,
): Record<string, unknown> {
  return {
    reparatur_werkstatt_id: werkstattId,
    reparatur_werkstatt_zugewiesen_am: new Date().toISOString(),
    // uuid-Spalte: accountloser Kunde (Flow-Token, kein Login) hat keine userId ->
    // null schreiben, NIEMALS '' (leerer String wirft "invalid input syntax for type uuid").
    reparatur_werkstatt_zugewiesen_von: userId || null,
    reparatur_werkstatt_quelle: quelle,
    reparatur_vermittlung_status: 'vermittelt',
  }
}
