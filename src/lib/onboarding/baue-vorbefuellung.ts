/**
 * Baut die Vorbefuellungs-Map des Kunden-Onboardings aus den vier DB-Quellen
 * (Fall-Bridge, Claim, Lead, Vehicle) plus den vorhandenen Dokumenten.
 *
 * Pure — extrahiert aus `load-needed-phases.ts` (dort `'use server'`, also nicht
 * unit-testbar). Der Loader ruft nur noch diese Funktion.
 *
 * ═══ Die Reihenfolge ist die eigentliche Aussage ═══
 *
 * ANLASS (Aaron 28.08.2026): *„Ich habe die Felder im FlowLink veraendert und die
 * wurden nicht uebernommen."* Der FlowLink-Teil hatte eine eigene Ursache (leeres
 * `.catch()`, PR #5695) — beim Nachmessen fiel diese zweite Stelle auf.
 *
 * Frueher stand hier `{...fall, ...claim, ...lead, ...vehicle}` — der **Lead
 * gewann ueber den Claim**. Das ist die falsche Richtung: der Lead ist die
 * Erstmeldung, der Claim der laufende Vorgang. Genau die Felder, die das
 * Onboarding selbst nach `claims` schreibt (`service_typ`, `polizei_vor_ort`,
 * `kanzlei_wunsch`, …), wurden beim naechsten Laden wieder vom Lead ueberschrieben.
 *
 * ⭐ Gemessen auf prod (28.08.2026), bevor die Reihenfolge gedreht wurde:
 *
 *   - 65 Spalten kollidieren zwischen `claims` und `leads`, 18 davon liest ein
 *     `onboarding_feld` ueber `db_target.spalte`.
 *   - Verhalten aendert sich NUR, wo beide Seiten gefuellt UND verschieden sind —
 *     `flachKopie` filtert Leeres, ein leerer Claim loescht also nie einen
 *     gefuellten Lead-Wert. Das trifft **8 Zeilen in 2 Spalten**:
 *
 *       reparatur_vermittlung_status   6x   claim 'vermittelt'  <- lead 'offen'
 *       service_typ                    2x   claim 'komplett'    <- lead 'nur_gutachter'
 *
 *   - In **8 von 8** Faellen war der Claim sowohl der juengere (`updated_at`) als
 *     auch der fortgeschrittenere Wert. Keine Gegenevidenz. `service_typ` ist dabei
 *     der real sichtbare Fall: der Kunde stockt im Onboarding auf „komplett" auf,
 *     es landet in `claims` — und beim naechsten Laden stand wieder „nur_gutachter" da.
 *
 * `vehicle` bleibt bewusst zuletzt: Fahrzeugdaten (`fin`, `hsn`, `tsn`) sind dort
 * spezifischer als in Claim oder Lead.
 */

export type VorbefuellungsDokument = {
  dokument_typ: string | null
  pflichtdokument_id: string | null
}

/**
 * Ein Pflicht-Slot ist die ZWEITE Quelle, aus der ein Dokument-Nachweis kommen kann.
 *
 * ⭐⭐ Prod-Messung 28.08.: Beide Quellen sind noetig, weil sie sich NICHT decken.
 * `convert-lead-to-fall` zieht nur `unfallfotos` nach `fall_dokumente` nach; alles
 * andere spiegelt `syncLeadDokumenteAnPflicht` ausschliesslich in `pflichtdokumente`.
 * Wer vor der Fall-Anlage hochlaedt (real: 1–4 Minuten davor), landet deshalb nur dort:
 *
 *   CLM-2026-03507  fahrzeugschein   Slot 'hochgeladen' + URL   →  0 Zeilen in fall_dokumente
 *   CLM-2026-03507  polizeibericht   Slot 'hochgeladen' + URL   →  0
 *   CLM-2026-05265  fahrzeugschein   Slot 'hochgeladen' + URL   →  0
 *   (dieselben Faelle mit schadensfotos/sachschaden_* liegen dagegen in BEIDEN)
 *
 * Wer nur `fall_dokumente` liest, fragt diese Kunden erneut — obwohl ihr Slot
 * „hochgeladen" sagt und eine URL traegt.
 */
export type VorbefuellungsPflichtSlot = {
  dokument_typ: string | null
  status: string | null
}

/** Slot-Zustaende, die einen vorhandenen Upload belegen. */
const SLOT_STATUS_ERLEDIGT = new Set(['hochgeladen', 'geprueft'])

export type VorbefuellungsQuellen = {
  fall: Record<string, unknown> | null
  claim: Record<string, unknown> | null
  lead: Record<string, unknown> | null
  vehicle: Record<string, unknown> | null
  dokumente: ReadonlyArray<VorbefuellungsDokument>
  /** Optional — fehlt sie, verhaelt sich die Funktion wie zuvor. */
  pflichtSlots?: ReadonlyArray<VorbefuellungsPflichtSlot>
}

/**
 * Ein Upload-Feld weist sich durch sein DOKUMENT aus, nicht durch einen Feldwert.
 *
 * ANLASS (Aaron 28.08.2026): *„ausserdem wurde ich nochmal nach dem Fahrzeugschein
 * gefragt obwohl ich den schon hochgeladen hatte."* `fahrzeugschein_foto` ist
 * `pflicht: true`, hat aber keinen Speicherort (`db_target.tabelle = '_self'`) — der
 * Wert lebte nur im lokalen React-State und war nach jedem Reload weg.
 *
 * ⚠ Zwei Dokumenttypen je Feld sind kein Versehen: `schadensfoto` (6 Schreibstellen)
 * und `schadensfotos` (2) bezeichnen dieselbe Sache — dokumentierte Altlast, siehe
 * `src/lib/dokumente/dokument-typen.ts` (`BEKANNTE_DUBLETTEN`). Bis sie zusammengelegt
 * ist, muss jeder Name zaehlen, sonst fragt der Wizard je nach Schreibstelle erneut.
 */
const UPLOAD_FELD_ZU_DOKUMENTTYPEN: Record<string, readonly string[]> = {
  fahrzeugschein_foto: ['fahrzeugschein'],
  schadensfotos: ['schadensfoto', 'schadensfotos'],
}

/** Uebernimmt nur belegte Werte — `null`/`undefined`/`''` zaehlen als „nicht da". */
export function flachKopie(o: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o ?? {})) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return out
}

export function baueVorbefuellung(q: VorbefuellungsQuellen): Record<string, unknown> {
  // Praezedenz aufsteigend: der spaetere Spread gewinnt.
  // Lead (Erstmeldung) < Claim (laufender Vorgang) < Vehicle (Fahrzeug-Detail).
  const prefilled: Record<string, unknown> = {
    ...flachKopie(q.fall),
    ...flachKopie(q.lead),
    ...flachKopie(q.claim),
    ...flachKopie(q.vehicle),
  }

  // Pro Pflichtdokument-Slot + Dokument-Typ ein Flag.
  for (const d of q.dokumente) {
    if (d.pflichtdokument_id) prefilled[`doc_${d.pflichtdokument_id}`] = true
    if (d.dokument_typ) prefilled[`doc_typ_${d.dokument_typ}`] = true
  }

  // Zweite Nachweis-Quelle: ein erledigter Pflicht-Slot (s. Kommentar am Typ oben).
  for (const s of q.pflichtSlots ?? []) {
    if (s.dokument_typ && s.status && SLOT_STATUS_ERLEDIGT.has(s.status)) {
      prefilled[`doc_typ_${s.dokument_typ}`] = true
    }
  }

  // Upload-Felder aus den vorhandenen Dokumenten ableiten (s. Kommentar oben).
  for (const [feldKey, typen] of Object.entries(UPLOAD_FELD_ZU_DOKUMENTTYPEN)) {
    if (prefilled[feldKey] != null && prefilled[feldKey] !== '') continue
    if (typen.some((t) => prefilled[`doc_typ_${t}`] === true)) {
      // Der konkrete Wert ist gleichgueltig — `validatePhase` prueft nur auf „nicht leer",
      // und der Wizard ueberspringt vorbefuellte Felder.
      prefilled[feldKey] = true
    }
  }

  return prefilled
}
