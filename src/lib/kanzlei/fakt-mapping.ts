// KB-Fakt-getriebene Kanzlei-Strecke — reines Fakt→Update-Mapping (import-frei, unit-testbar).
//
// KB traegt einen Kanzlei-Fakt ein (was die Kanzlei per Telefon/Email meldet). Diese Funktion
// uebersetzt den Fakt in die zu schreibenden DB-Felder (richtige Tabelle) + den Kunde-Comm-Key.
// applyKanzleiFakt fuehrt das aus und ruft danach checkFallAutoPhase (Phase leitet aus den
// Fakten ab — kein externes LexDrive-API, kein Drift). Spec:
// docs/superpowers/specs/2026-06-29-kanzlei-kb-fakt-strecke-design.md

export type KanzleiFaktKey =
  | 'anschlussschreiben' // AS an die gegnerische VS raus
  | 'vs_reaktion' // VS hat reagiert (voll/gekuerzt/abgelehnt)
  | 'regulierung' // VS reguliert
  | 'klage' // Klage eingereicht
  | 'zahlung' // Zahlung eingegangen
  | 'abschluss' // Fall abgeschlossen

export type KanzleiFaktWert = {
  /** ISO-Timestamp/Date des Ereignisses (Default: jetzt — vom Caller gesetzt) */
  datum?: string | null
  betrag?: number | null
  vsReaktionTyp?: 'voll' | 'gekuerzt' | 'abgelehnt'
  grund?: string | null
}

export type KanzleiFaktUpdate = {
  /** Felder fuer upsertKanzleiFall (kanzlei_faelle) */
  kanzleiFaelle?: Record<string, unknown>
  /** Felder fuer claims.update */
  claims?: Record<string, unknown>
  /** Felder fuer upsertCurrentClaimPayment (claim_payments) */
  payment?: { zahlungseingang_am?: string; erhaltener_betrag?: number; status?: 'erhalten' }
  /** sendFallCommunication-Key (Kunde-Benachrichtigung) oder null */
  commKey?: string | null
}

/**
 * Uebersetzt einen KB-Fakt in die zu schreibenden Felder + Kunde-Comm.
 * Rein — kein DB-Zugriff. `datum` muss der Caller setzen (kein Date.now hier).
 */
export function kanzleiFaktToUpdate(faktKey: KanzleiFaktKey, wert: KanzleiFaktWert): KanzleiFaktUpdate {
  const datum = wert.datum ?? null
  switch (faktKey) {
    case 'anschlussschreiben':
      return { kanzleiFaelle: { anschlussschreiben_am: datum }, commKey: 'as_gesendet' }
    case 'vs_reaktion': {
      const kf: Record<string, unknown> = {
        vs_reaktion_typ: wert.vsReaktionTyp ?? null,
        vs_reaktion_am: datum,
      }
      if (wert.vsReaktionTyp === 'gekuerzt') {
        if (wert.betrag != null) kf.kuerzungs_betrag = wert.betrag
        if (wert.grund != null) kf.vs_kuerzung_grund = wert.grund
      } else if (wert.vsReaktionTyp === 'abgelehnt') {
        if (wert.grund != null) kf.vs_kuerzung_grund = wert.grund
      }
      // 'voll' -> Regulierung folgt; keine Kunde-Comm hier (regulierung-Fakt loest sie aus).
      return { kanzleiFaelle: kf, commKey: null }
    }
    case 'regulierung':
      return { kanzleiFaelle: { regulierung_am: datum }, commKey: 'regulierung_angekuendigt' }
    case 'klage':
      return {
        kanzleiFaelle: { klage_uebergeben_am: datum },
        claims: wert.grund != null ? { geschlossen_grund: wert.grund } : undefined,
        commKey: null,
      }
    case 'zahlung':
      return {
        payment: {
          ...(datum ? { zahlungseingang_am: datum } : {}),
          ...(wert.betrag != null ? { erhaltener_betrag: wert.betrag } : {}),
          status: 'erhalten',
        },
        commKey: 'zahlung_eingegangen',
      }
    case 'abschluss':
      return { claims: { abgeschlossen_am: datum }, commKey: null }
  }
}
