// AAR-762: Reine Status-Ableitung fuer Ad-hoc-Dokument-Anforderungen.
//
// dokument_upload_anfragen.status CHECK (DB-Ground-Truth):
//   gesendet | teilweise | komplett | abgelaufen
//
// Ausgelagert + unit-getestet, NACHDEM ein prod-Smoke einen Vokabular-Drift-Bug
// im Reader (AdHocAnforderungenListe) aufdeckte: der Reader mappte noch das ALTE,
// nie-gueltige Vokabular pending/completed/cancelled -> `canAct` war fuer jede
// echte Row false -> Kopieren/Resend/Stornieren-Buttons rendeten nie. Diese pure
// Funktion + Test verankern das korrekte Vokabular gegen Re-Drift.

export type AdhocToneKey = 'open' | 'done' | 'terminal' | 'expired'

export interface AdhocStatusView {
  /** Nutzer-sichtbares Label (DE). */
  label: string
  /** Semantischer Ton -> Icon/Farbe im Consumer. */
  toneKey: AdhocToneKey
  /** Kopieren/Resend/Stornieren nur solange die Anforderung offen ist. */
  canAct: boolean
  /** `gesendet`, aber `expires_at` ueberschritten (visuelle Warnung). */
  expired: boolean
}

/**
 * Leitet die Anzeige-/Aktions-Semantik einer Ad-hoc-Anforderung aus ihrem
 * DB-Status + Ablaufdatum ab. `now` ist injizierbar fuer deterministische Tests.
 *
 * `canAct === (status === 'gesendet' | 'teilweise')` — die offenen Zustaende.
 * `gesendet` matcht bewusst den `resendAdHocAnforderung`-Guard (nur `gesendet`
 * darf resendet werden); `komplett`/`abgelaufen` sind terminal (keine Aktionen).
 * Unbekannte/Legacy-Werte fallen sicher auf den offenen Default (nie Crash).
 */
export function resolveAdhocAnforderungStatus(
  status: string,
  expiresAt: string,
  now: number = Date.now(),
): AdhocStatusView {
  const expired = new Date(expiresAt).getTime() < now
  switch (status) {
    case 'komplett':
      return { label: 'Erhalten', toneKey: 'done', canAct: false, expired: false }
    case 'abgelaufen':
      return { label: 'Abgelaufen', toneKey: 'terminal', canAct: false, expired: false }
    case 'teilweise':
      return { label: 'Teilweise', toneKey: 'open', canAct: true, expired }
    case 'gesendet':
    default:
      return expired
        ? { label: 'Abgelaufen', toneKey: 'expired', canAct: true, expired: true }
        : { label: 'Ausstehend', toneKey: 'open', canAct: true, expired: false }
  }
}
