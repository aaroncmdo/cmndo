// AAR-558 (C9): Auszahlungs-Card für das Kunde-Portal.
// Zeigt AUSSCHLIESSLICH den Netto-Kunden-Anteil (auszahlung_kunde_betrag).
// NIE regulierung_betrag (Brutto inkl. SV-Honorar) und NIE
// auszahlung_gutachter_betrag. Datenquelle: faelle_kunde_view (C8), die
// genau diese Spalten-Auswahl auf DB-Ebene erzwingt.

import { getTranslations } from 'next-intl/server'
import { BanknoteIcon } from 'lucide-react'

interface Props {
  betrag: number | null
  eingegangenAm: string | null
  zahlungsweg: string | null
}

// Portal-i18n: bekannte Zahlungswege → `auszahlung`-Namespace-Keys; de-Label
// bleibt als Fallback, unbekannte Werte fallen auf den rohen DB-Wert zurueck.
const ZAHLUNGSWEG_KEY: Record<string, string> = {
  ueberweisung: 'zahlungsweg.ueberweisung',
  werkstatt_direkt: 'zahlungsweg.werkstattDirekt',
  scheck: 'zahlungsweg.scheck',
}
const ZAHLUNGSWEG_LABEL: Record<string, string> = {
  ueberweisung: 'Überweisung',
  werkstatt_direkt: 'Werkstatt-Direktzahlung',
  scheck: 'Scheck',
}

function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function AuszahlungCard({ betrag, eingegangenAm, zahlungsweg }: Props) {
  const n = betrag == null ? null : Number(betrag)
  if (n == null || Number.isNaN(n) || n <= 0) return null

  const eingegangen = !!eingegangenAm
  const t = await getTranslations('auszahlung')

  // Zahlungsweg-Label: bekannter Key → Übersetzung (mit de-Fallback), sonst roher Wert.
  let zahlungswegLabel: string | null = null
  if (zahlungsweg) {
    const key = ZAHLUNGSWEG_KEY[zahlungsweg]
    zahlungswegLabel = key && t.has(key as Parameters<typeof t.has>[0])
      ? t(key as Parameters<typeof t>[0])
      : (ZAHLUNGSWEG_LABEL[zahlungsweg] ?? zahlungsweg)
  }

  return (
    <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-4 space-y-2">
      <div className="flex items-center gap-2">
        <BanknoteIcon className="w-4 h-4 text-emerald-700" />
        <p className="text-sm font-semibold text-claimondo-navy">{t('titel')}</p>
        <span
          className={`ml-auto text-[10px] font-medium rounded-full px-2 py-0.5 ${
            eingegangen ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {eingegangen ? t('statusEingegangen') : t('statusAvisiert')}
        </span>
      </div>

      <div>
        <p className="text-xs text-claimondo-ondo">{t('nettoBetrag')}</p>
        <p className="text-2xl font-bold text-claimondo-navy">{formatEuro(n)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs pt-1">
        {eingegangen && eingegangenAm && (
          <div>
            <p className="text-claimondo-ondo">{t('eingang')}</p>
            <p className="text-claimondo-navy font-medium">{formatDate(eingegangenAm)}</p>
          </div>
        )}
        {zahlungsweg && (
          <div>
            <p className="text-claimondo-ondo">{t('zahlungswegLabel')}</p>
            <p className="text-claimondo-navy font-medium">
              {zahlungswegLabel}
            </p>
          </div>
        )}
      </div>

      <p className="text-[11px] text-claimondo-ondo pt-1 border-t border-claimondo-border">
        {t('hinweis')}
      </p>
    </div>
  )
}
