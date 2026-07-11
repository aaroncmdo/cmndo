// Pure Mapping-Helpers fuer die Makler-Akte-Ansprechpartner (FallKontakteCard-Props)
// + robuste Kunden-Identitaet (Lead-Fallback). Ausgelagert aus queries.ts fuer
// Unit-Testbarkeit ohne Supabase-Mock.

export type FallKontaktPerson = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
}

export type MaklerFallKontakte = {
  kundenbetreuer: FallKontaktPerson | null
  sv: (FallKontaktPerson & { verifiziert?: boolean }) | null
  kanzlei: FallKontaktPerson | null
}

export type KundeIdentity = {
  id: string | null
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  adresse: string | null
  plz: string | null
  ort: string | null
}

/** Supabase Nested-Embed kann Array oder Objekt liefern (Cardinality) -> Single. */
export function pickSingle<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

/** Kanzlei-Kontakt aus den claims/View-Feldern (Name-only -> vorname). Null wenn kein Name. */
export function buildKanzleiKontakt(
  name: string | null | undefined,
  email: string | null | undefined,
  telefon: string | null | undefined,
): FallKontaktPerson | null {
  const n = (name ?? '').trim()
  if (!n) return null
  return { vorname: n, nachname: null, email: email ?? null, telefon: telefon ?? null }
}

/** SV-Anzeigename: anzeigename hat Vorrang (Firmen-SV ohne vorname/nachname). */
export function svDisplayName(
  p: { anzeigename?: string | null; vorname?: string | null; nachname?: string | null } | null,
): { vorname: string | null; nachname: string | null } {
  if (!p) return { vorname: null, nachname: null }
  const anzeige = (p.anzeigename ?? '').trim()
  if (anzeige) return { vorname: anzeige, nachname: null }
  return { vorname: p.vorname ?? null, nachname: p.nachname ?? null }
}

/**
 * Kunden-Identitaet robust: bevorzugt das geschaedigter-Profil, faellt auf den Lead
 * zurueck (Name + Kontakt), wenn geschaedigter_user_id null ist oder das Profil keinen
 * Namen traegt. `full` = vollzugriff-Consent -> Kontaktfelder; sonst nur Name
 * (Datenminimierung, wie bisher die profiles-only-Variante).
 */
export function mergeKundeIdentity(
  profil: Partial<KundeIdentity> | null,
  lead: { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null,
  full: boolean,
): KundeIdentity | null {
  if (!profil && !lead) return null
  const vorname = profil?.vorname ?? lead?.vorname ?? null
  const nachname = profil?.nachname ?? lead?.nachname ?? null
  if (!vorname && !nachname && !profil?.id) return null
  const email = profil?.email ?? lead?.email ?? null
  const telefon = profil?.telefon ?? lead?.telefon ?? null
  return {
    id: profil?.id ?? null,
    vorname,
    nachname,
    email: full ? email : null,
    telefon: full ? telefon : null,
    adresse: full ? (profil?.adresse ?? null) : null,
    plz: full ? (profil?.plz ?? null) : null,
    ort: full ? (profil?.ort ?? null) : null,
  }
}
