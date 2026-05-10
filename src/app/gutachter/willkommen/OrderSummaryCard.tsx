'use client'

// AAR-213: Lead-Preis-Tabelle-Link geht jetzt über Callback an
// WillkommenClient — dort wird der Overlay statt einem neuen Tab geöffnet.
import Link from 'next/link'

// BUG-96 + BUG-97: Geteilte Bestelluebersicht fuer Step 1 (Vertrag) und
// Step 2 (Stripe-Anzahlung) im Willkommen-Wizard.
//
// variant 'compact' → kompakte Card im Vertrag-Schritt
// variant 'xl'       → grosser Anzahlungs-Betrag links im 2-Spalten-Layout
//                      des Stripe-Checkout-Schritts.
//
// Buero-Inhaber bekommt zusaetzlich die Liste der Sub-Standorte mit ihren
// jeweiligen Anzahlungen. Die `subBueros` und `gesamtAnzahlung` Props sind
// dann gesetzt und das Render zeigt eine separate Tabelle.

type SubBuero = {
  id: string
  name: string | null
  standort_adresse: string | null
  standort_plz: string | null
  paket: string
  onboarding_anzahlung_betrag: number
}

type Props = {
  variant: 'compact' | 'xl'
  paketLabel: string
  kontingent: number
  radiusKm: number
  /**
   * Anzahlungs-Betrag — fuer Solo der eigene Wert, fuer Buero-Inhaber
   * die Gesamt-Summe ueber alle Sub-Standorte.
   */
  anzahlungBetrag: number
  /**
   * Optional: Sub-Standorte fuer Buero-Inhaber. Wenn gesetzt wird die
   * Tabelle gerendert + 'Anzahlung gesamt' Label.
   */
  subBueros?: SubBuero[]
  /**
   * Optional: Sub-SV einer Org → 'Du gehoerst zu [Name]' Hinweis statt
   * der vollen Tabelle.
   */
  organisationName?: string | null
  /**
   * Hauptfarben der Card. Default Claimondo-Navy/Blau, kann fuer Branding
   * via CSS-Vars ueberschrieben werden — hier explizit als Props damit das
   * Component framework-agnostisch bleibt.
   */
  className?: string
  /**
   * AAR-213: Callback um das Lead-Preis-Tabelle-Overlay im Parent zu öffnen.
   * Wenn nicht gesetzt fällt das Link-Verhalten auf /gutachter/leadpreise zurück.
   */
  onShowLeadPreise?: () => void
}

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard',
  pro: 'Pro',
  premium: 'Premium',
  individuell: 'Individuell',
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  })
}

export default function OrderSummaryCard({
  variant,
  paketLabel,
  kontingent,
  radiusKm,
  anzahlungBetrag,
  subBueros,
  organisationName,
  className = '',
  onShowLeadPreise,
}: Props) {
  const istBuero = !!subBueros && subBueros.length > 0
  const anzahlungLabel = istBuero ? 'Anzahlung gesamt' : 'Anzahlung'

  if (variant === 'xl') {
    return (
      <div className={`bg-white border border-[var(--brand-secondary)]/20 rounded-2xl p-6 ${className}`}>
        <p className="text-xs text-[var(--brand-primary)] uppercase tracking-wide font-semibold mb-1">
          Dein Auftrag
        </p>
        <p className="text-base font-semibold text-claimondo-navy">{paketLabel}</p>
        <p className="text-xs text-claimondo-ondo">
          {kontingent} Faelle/Monat · {radiusKm} km Radius
        </p>

        {organisationName && !istBuero && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-[#f8f9fb] border border-claimondo-border text-[11px] text-claimondo-ondo">
            Du gehoerst zu <strong>{organisationName}</strong>
          </div>
        )}

        {/* Anzahlung GROSS */}
        <div className="mt-5 pt-5 border-t border-claimondo-border">
          <p className="text-[10px] text-claimondo-ondo uppercase tracking-wide font-semibold mb-1">
            {anzahlungLabel}
          </p>
          <p className="text-4xl font-bold text-[var(--brand-primary)] tabular-nums leading-tight">
            {fmtEur(anzahlungBetrag)}
          </p>
          <p className="text-[11px] text-claimondo-ondo mt-1">netto · einmalig</p>
          <p className="text-[11px] text-claimondo-ondo mt-2 leading-relaxed">
            Wird mit den ersten Lead-Gebuehren verrechnet. Sobald die Zahlung
            eingegangen ist, ist dein Portal-Zugang freigeschaltet.
          </p>
        </div>

        {/* Sub-Buero-Tabelle fuer Inhaber */}
        {istBuero && (
          <div className="mt-5 pt-5 border-t border-claimondo-border">
            <p className="text-[10px] text-claimondo-ondo uppercase tracking-wide font-semibold mb-2">
              {subBueros!.length} Sub-Standort(e)
            </p>
            <ul className="divide-y divide-claimondo-border">
              {subBueros!.map((s, i) => (
                <li key={s.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-claimondo-navy font-medium truncate">
                      {i + 1}. {[s.standort_adresse, s.standort_plz].filter(Boolean).join(', ') || s.name || `Standort ${i + 1}`}
                    </p>
                    <p className="text-[10px] text-claimondo-ondo">
                      {PAKET_LABELS[s.paket] ?? s.paket}
                    </p>
                  </div>
                  <p className="text-xs text-claimondo-navy tabular-nums font-medium flex-shrink-0">
                    {fmtEur(s.onboarding_anzahlung_betrag)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t border-claimondo-border flex items-center justify-between text-xs">
              <span className="text-claimondo-ondo font-medium">Gesamt</span>
              <span className="text-[var(--brand-primary)] font-bold tabular-nums">{fmtEur(anzahlungBetrag)}</span>
            </div>
          </div>
        )}

        {/* Lead-Preise */}
        <div className="mt-5 pt-5 border-t border-claimondo-border text-xs">
          <p className="text-claimondo-ondo leading-relaxed mb-2">
            Kein monatlicher Grundpreis — nur Lead-Preise pro Fall (variiert nach Schadenhoehe).
          </p>
          {onShowLeadPreise ? (
            <button
              type="button"
              onClick={onShowLeadPreise}
              className="text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)] font-medium"
            >
              → Lead-Preis-Tabelle + ROI-Rechner
            </button>
          ) : (
            <Link
              href="/gutachter/leadpreise"
              target="_blank"
              className="text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)] font-medium"
            >
              → Lead-Preis-Tabelle einsehen
            </Link>
          )}
        </div>
      </div>
    )
  }

  // ─── compact variant (Vertrag-Step) ────────────────────────────────────
  return (
    <div className={`bg-[var(--brand-secondary)]/5 border border-[var(--brand-secondary)]/20 rounded-xl p-5 ${className}`}>
      <p className="text-xs text-[var(--brand-primary)] uppercase tracking-wide font-semibold mb-3">
        Deine Bestellung
      </p>
      <div className="grid grid-cols-2 gap-y-3 gap-x-4">
        <Cell label="Paket" value={paketLabel} />
        <Cell label="Faelle pro Monat" value={String(kontingent)} />
        <Cell label="Radius" value={`${radiusKm} km`} />
        <Cell label="Monatsbeitrag" value="0,00 EUR" />
        <Cell label={anzahlungLabel} value={fmtEur(anzahlungBetrag)} highlight />
        <Cell label="Abrechnung" value="Pay-per-Lead" />
      </div>
      {organisationName && !istBuero && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-white border border-claimondo-border text-[11px] text-claimondo-navy">
          Du gehoerst zu <strong>{organisationName}</strong>
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-[var(--brand-secondary)]/15 flex items-center justify-between text-xs">
        <span className="text-claimondo-ondo">
          Kein monatlicher Grundpreis — nur Lead-Preise pro Fall.
        </span>
        {onShowLeadPreise ? (
          <button
            type="button"
            onClick={onShowLeadPreise}
            className="text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)] font-medium ml-3 flex-shrink-0"
          >
            → Lead-Preis-Tabelle
          </button>
        ) : (
          <Link
            href="/gutachter/leadpreise"
            target="_blank"
            className="text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)] font-medium ml-3 flex-shrink-0"
          >
            → Lead-Preis-Tabelle
          </Link>
        )}
      </div>
    </div>
  )
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-claimondo-ondo uppercase">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 tabular-nums ${highlight ? 'text-[var(--brand-primary)]' : 'text-claimondo-navy'}`}>
        {value}
      </p>
    </div>
  )
}
