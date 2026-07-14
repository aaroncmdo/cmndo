// Slice 2c — alle Daten, die in die Unfallmeldung an die Gegner-Haftpflicht gehoeren.
// Bewusst ein expliziter Admin-Client-Loader statt v_claim_full: der Trigger laeuft im
// anonymen Gegner-Kontext (kein User, keine RLS-Session).
import { createAdminClient } from '@/lib/supabase/admin'

export type VsMeldungDaten = {
  claimId: string
  claimNummer: string | null
  unfallDatum: string | null
  hergang: string | null
  /** Die Gegner-Haftpflicht. Wird HIER mitgeladen, damit sendeUnfallmeldung sie nicht erneut holen muss. */
  gegnerVersicherungId: string | null
  geschaedigt: { firmaName: string | null; kennzeichen: string | null; fahrzeug: string | null }
  gegner: {
    name: string | null
    kennzeichen: string | null
    versicherungsnummer: string | null
    versicherungsAktenzeichen: string | null
  }
}

/** Supabase liefert eingebettete Relationen je nach Cardinality als Objekt ODER Array (AGENTS.md). */
function eins<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function fahrzeugName(v: { hersteller?: string | null; modell?: string | null } | null): string | null {
  if (!v) return null
  const teile = [v.hersteller, v.modell].filter((t): t is string => Boolean(t && t !== 'Unbekannt'))
  return teile.length ? teile.join(' ') : null
}

export async function ladeVsMeldungDaten(claimId: string): Promise<VsMeldungDaten | null> {
  const admin = createAdminClient()

  const { data: claim, error } = await admin
    .from('claims')
    .select('id, claim_nummer, unfall_datum, hergang_kunde_text, gegner_versicherung_id')
    .eq('id', claimId)
    .maybeSingle()

  if (error || !claim) {
    if (error) console.error('[vs-meldung] Claim-Load fehlgeschlagen:', error.message)
    return null
  }

  const { data: parties } = await admin
    .from('claim_parties')
    .select(
      'rolle, kennzeichen, versicherungsnummer, versicherungs_aktenzeichen, firmen(name), vehicles(hersteller, modell), personen(vorname, nachname)',
    )
    .eq('claim_id', claimId)

  const rows = (parties ?? []) as Array<Record<string, unknown>>
  const g = rows.find((p) => p.rolle === 'geschaedigter') ?? null
  const v = rows.find((p) => p.rolle === 'verursacher') ?? null

  const gegnerPerson = eins(v?.personen as { vorname?: string | null; nachname?: string | null } | null)
  const gegnerName = gegnerPerson
    ? [gegnerPerson.vorname, gegnerPerson.nachname].filter(Boolean).join(' ').trim() || null
    : null

  return {
    claimId: claim.id as string,
    claimNummer: (claim.claim_nummer as string | null) ?? null,
    unfallDatum: (claim.unfall_datum as string | null) ?? null,
    gegnerVersicherungId: (claim.gegner_versicherung_id as string | null) ?? null,
    // Der Gegner-Hergang landet heute in hergang_kunde_text (semantisch unsauber; die
    // saubere Spalte hergang_gegner_text ist auf die claims-DDL-Lane gegated).
    hergang: (claim.hergang_kunde_text as string | null) ?? null,
    geschaedigt: {
      firmaName: eins(g?.firmen as { name?: string } | null)?.name ?? null,
      kennzeichen: (g?.kennzeichen as string | null) ?? null,
      fahrzeug: fahrzeugName(eins(g?.vehicles as { hersteller?: string | null; modell?: string | null } | null)),
    },
    gegner: {
      name: gegnerName,
      kennzeichen: (v?.kennzeichen as string | null) ?? null,
      versicherungsnummer: (v?.versicherungsnummer as string | null) ?? null,
      versicherungsAktenzeichen: (v?.versicherungs_aktenzeichen as string | null) ?? null,
    },
  }
}
