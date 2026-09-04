'use client'

// AAR-558 (C9) Brutto-Leak-Fix: Diese Säule zeigt dem Kunden KEINE Brutto-
// Beträge mehr (regulierung_betrag / zahlung_betrag / kuerzungs_betrag).
// Die Netto-Auszahlung kommt aus AuszahlungCard (auszahlung_kunde_betrag aus
// faelle_kunde_view). Hier bleibt nur die eigene Forderung (schadens_hoehe_netto),
// der Totalschaden-Badge und die Zahlungsweg-Wahl (die vor Auszahlung nötig ist).

import { useState, useTransition } from 'react'
import { BanknoteIcon, AlertTriangleIcon, CheckIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Props = {
  fallId: string
  status: string
  schadens_hoehe_netto: number | null
  totalschaden: boolean
  zahlungsweg: string | null
  onZahlungswegSave?: (fallId: string, weg: string) => Promise<{ success: boolean; error?: string }>
  /** S2: true = ein Mensch (Gutachter/Admin) hat die Werte geprüft -> „vom Gutachter geprüft"-Badge. */
  svGeprueft?: boolean
  /**
   * AAR (14.05.2026): OCR-extrahierte Gutachten-Werte zur Kunde-Information
   * "Was steht mir zu?". Werden nur angezeigt nach ocr_processed_at.
   * Bei Totalschaden: Wiederbeschaffungswert - Restwert + Minderwert.
   * Bei Reparaturfall: Reparaturkosten-Brutto + Minderwert.
   */
  gutachtenWerte?: {
    reparaturkosten_brutto: number | null
    minderwert: number | null
    wiederbeschaffungswert: number | null
    restwert: number | null
    ocr_processed_at: string | null
  } | null
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function SaeuleMeinGeld({ fallId, status, schadens_hoehe_netto, totalschaden, zahlungsweg, onZahlungswegSave, gutachtenWerte, svGeprueft }: Props) {
  const t = useTranslations('kunde.fall.meinGeld')
  const [pending, startTransition] = useTransition()
  const [weg, setWeg] = useState<string | null>(zahlungsweg)
  const [saved, setSaved] = useState(!!zahlungsweg)
  const [saveError, setSaveError] = useState<string | null>(null)

  const gefordert = schadens_hoehe_netto ?? 0
  const showGefordert = !!schadens_hoehe_netto

  // Forderungssumme aus dem Gutachten. Rechenregel wie im Datei-Kopf beschrieben:
  //   Totalschaden  = Wiederbeschaffungswert − Restwert + Minderwert
  //   Reparaturfall = Reparaturkosten brutto + Minderwert
  // `null`, solange die Hauptposition fehlt — lieber keine Zahl als eine halbe.
  //
  // Bewusst selbst gerechnet: `v_gutachten_werte.gesamt_schadensbetrag` existiert,
  // ist auf prod aber in 81 von 82 Zeilen leer (gemessen 31.08.) und wird hier gar
  // nicht durchgereicht. Wird das Feld später verlässlich gefüllt, ist es die
  // autoritativere Quelle — dann diese Berechnung durch den Wert ersetzen.
  const gw = gutachtenWerte
  const summe: number | null = !gw?.ocr_processed_at
    ? null
    : totalschaden
      ? gw.wiederbeschaffungswert !== null
        ? gw.wiederbeschaffungswert - (gw.restwert ?? 0) + (gw.minderwert ?? 0)
        : null
      : gw.reparaturkosten_brutto !== null
        ? gw.reparaturkosten_brutto + (gw.minderwert ?? 0)
        : null
  // B4-slice-1b: 'in_kommunikation_vs'/'abgelehnt' ergaenzt. Vor dem endzustand-Write-Flip trug
  // der Cursor in dieser Phase 'regulierung' — ohne die zwei Werte verschwaende die Zahlungsweg-
  // Wahl genau dann, wenn sie gebraucht wird (VS-Verhandlung / Nachforderung laeuft).
  const showZahlungswegWahl = ['regulierung-laeuft', 'regulierung', 'in_kommunikation_vs', 'abgelehnt', 'zahlung-eingegangen'].includes(status) && !saved && onZahlungswegSave

  function handleSaveWeg(selected: string) {
    if (!onZahlungswegSave) return
    setSaveError(null)
    startTransition(async () => {
      const res = await onZahlungswegSave(fallId, selected)
      // K3 (b0e963b6 22.07.): Write-Fehler sichtbar machen — vorher wurde ein Fehlschlag still
      // verschluckt (kein Feedback, Auswahl klebte nicht), der Kunde glaubte gespeichert.
      if (res.success) { setWeg(selected); setSaved(true) }
      else setSaveError(res.error ?? 'Speichern fehlgeschlagen. Bitte erneut versuchen.')
    })
  }

  return (
    <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BanknoteIcon className="w-5 h-5 text-success" />
        <h2 className="text-sm font-semibold text-claimondo-navy">{t('heading')}</h2>
      </div>

      {totalschaden && (
        <div className="flex items-center gap-2 bg-danger-soft border border-danger/30 rounded-ios-lg px-3 py-2">
          <AlertTriangleIcon className="w-4 h-4 text-danger shrink-0" />
          <p className="text-xs text-danger-strong font-medium">{t('totalschadenBadge')}</p>
        </div>
      )}

      <div className="space-y-3">
        {showGefordert ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-claimondo-ondo">{t('ihreForderung')}</span>
            <span className="text-claimondo-navy font-semibold">{fmt(gefordert)}</span>
          </div>
        ) : !gutachtenWerte?.ocr_processed_at ? (
          <p className="text-xs text-claimondo-ondo/70">{t('beforeGutachten')}</p>
        ) : null}

        {gutachtenWerte?.ocr_processed_at && (
          <div className="border-t border-claimondo-border pt-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                {t('ausGutachten')}
              </p>
              {svGeprueft && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success-strong">
                  <CheckIcon className="w-3 h-3" /> {t('vomGutachterGeprueft')}
                </span>
              )}
            </div>
            {!totalschaden && gutachtenWerte.reparaturkosten_brutto !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-claimondo-ondo">{t('reparaturkosten')}</span>
                <span className="text-claimondo-navy font-medium">{fmt(gutachtenWerte.reparaturkosten_brutto)}</span>
              </div>
            )}
            {totalschaden && gutachtenWerte.wiederbeschaffungswert !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-claimondo-ondo">{t('wiederbeschaffungswert')}</span>
                <span className="text-claimondo-navy font-medium">{fmt(gutachtenWerte.wiederbeschaffungswert)}</span>
              </div>
            )}
            {totalschaden && gutachtenWerte.restwert !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-claimondo-ondo">{t('abzglRestwert')}</span>
                <span className="text-claimondo-navy font-medium">- {fmt(gutachtenWerte.restwert)}</span>
              </div>
            )}
            {gutachtenWerte.minderwert !== null && gutachtenWerte.minderwert > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-claimondo-ondo">{t('minderwert')}</span>
                <span className="text-claimondo-navy font-medium">+ {fmt(gutachtenWerte.minderwert)}</span>
              </div>
            )}

            {/* Kundenseite-Audit 30.08.: Hier standen zwei Posten mit „+", aber
                keine Summe — „Die ausgezahlte Summe sehen Sie nach der
                Regulierung". Der Kunde will genau diese Zahl: „Sein Job ist
                herauszufinden, was ihm zusteht" (PRODUCT.md).
                Aaron-Entscheidung 31.08.: Summe zeigen, MIT Vorbehalt — die
                Zahl ist die Forderung aus dem Gutachten, keine Zusage über die
                Auszahlung (deshalb war sie nach dem Brutto-Leak-Fix AAR-558
                ganz weggefallen). Die Rechenregel stand schon im Datei-Kopf. */}
            {summe !== null && (
              <div className="border-t border-claimondo-border pt-2 mt-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-claimondo-navy">
                    {t('summeTitel')}
                  </span>
                  <span className="text-sm font-semibold text-claimondo-navy tabular-nums">
                    {fmt(summe)}
                  </span>
                </div>
                <p className="text-body-sm text-claimondo-ondo">{t('summeVorbehalt')}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-body-sm text-claimondo-ondo">
          {t('auszahlungHinweis')}
        </p>
      </div>

      {saved && weg && (
        <p className="text-xs text-claimondo-ondo">{t('auszahlungLabel')} {weg === 'kundenkonto' ? t('aufMeinKonto') : t('direktWerkstatt')}</p>
      )}

      {showZahlungswegWahl && (
        <div className="border-t border-claimondo-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-claimondo-navy">{t('auszahlungFrage')}</p>
          <div className="flex gap-2">
            <button disabled={pending} onClick={() => handleSaveWeg('kundenkonto')} className="flex-1 px-3 py-2 rounded-ios-lg border border-claimondo-border text-xs font-medium hover:bg-claimondo-bg disabled:opacity-50">{t('aufMeinKonto')}</button>
            <button disabled={pending} onClick={() => handleSaveWeg('werkstatt_direkt')} className="flex-1 px-3 py-2 rounded-ios-lg border border-claimondo-border text-xs font-medium hover:bg-claimondo-bg disabled:opacity-50">{t('direktWerkstatt')}</button>
          </div>
          {saveError && <p className="text-xs text-danger">{saveError}</p>}
        </div>
      )}
    </div>
  )
}
