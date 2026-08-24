/**
 * Das Staff-Gate der Vertriebsansicht.
 *
 * ⚠ Warum es ein eigenes Gate braucht und nicht die Portal-Sitzung genuegt:
 * `src/lib/supabase/client.ts` setzt die Cookies der Haupt-App OHNE `domain`,
 * sie gelten also nur fuer `app.claimondo.de`. Ein frueherer Kommentar in
 * `lib/supabase/server.ts` behauptete das Gegenteil („die Sitzung gilt
 * subdomain-uebergreifend") — nachgemessen am 20.08., es stimmt nicht.
 * sv-levelup meldet deshalb selbst an, gegen dieselben Konten.
 */

export type StaffDb = {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>
  }
  rpc(name: string): Promise<{ data: unknown; error: unknown }>
}

export type StaffErgebnis =
  | { ok: true; userId: string }
  | { ok: false; grund: 'keine_sitzung' | 'kein_staff' }

/**
 * Prueft, ob die Sitzung zu einem Mitarbeiter gehoert.
 *
 * ⚠ SCHLIESST BEI STOERUNG. Jeder Zweifelsfall — kein Nutzer, Fehler beim
 * Aufruf, unerwarteter Antworttyp — endet mit „nein". Ein Gate, das bei einer
 * Stoerung oeffnet, ist kein Gate: dahinter liegt der Gespraechsleitfaden samt
 * Einwandbehandlung, also genau das Dokument, das der geprueften Person nie
 * unter die Augen kommen darf.
 */
export async function pruefeStaff(db: StaffDb): Promise<StaffErgebnis> {
  const { data, error } = await db.auth.getUser()
  const user = data?.user
  if (error || !user) return { ok: false, grund: 'keine_sitzung' }

  const { data: istStaff, error: rpcFehler } = await db.rpc('is_staff')
  // Bewusst strikt auf `true` geprueft: `null` (Fehler), `undefined` (Feld
  // fehlt) und wahrheitswertige Fremdtypen sind allesamt kein Ja.
  if (rpcFehler || istStaff !== true) return { ok: false, grund: 'kein_staff' }

  return { ok: true, userId: user.id }
}
