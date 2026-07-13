// AAR-489 F4: Zentrale Darstellung des Makler-Consent-Scopes (Label + Status-Farb-Token).
// Der Scope-String lebt auf makler_fall_consent.consent_scope ('vollzugriff' | 'minimal').
// Vorher wurde die Vollzugriff/Minimal-Unterscheidung inline dupliziert (MaklerAkteDetail,
// MaklerSettings, MaklerLeadsTable). Vollzugriff ist ausserdem die Bedingung dafuer, dass
// der Copilot arbeitet (Route gatet auf 'vollzugriff') und die Gutachten-Werte sichtbar sind.

/** True nur bei exaktem Vollzugriff — alles andere (minimal/null/unbekannt) = eingeschraenkt. */
export function istVollzugriff(scope: string | null | undefined): boolean {
  return scope === 'vollzugriff'
}

/** Nutzer-sichtbares Label fuer den Consent-Scope. Fallback: Minimal. */
export function consentScopeLabel(scope: string | null | undefined): string {
  return istVollzugriff(scope) ? 'Vollzugriff' : 'Minimal'
}

/** Status-Farb-Token fuer den Consent-Wert: success (voll) / warning (minimal) — kein raw emerald/amber. */
export function consentScopeValueClass(scope: string | null | undefined): string {
  return istVollzugriff(scope) ? 'text-success-strong' : 'text-warning-strong'
}
