// Admin-only Card: zeigt die per Claude-OCR aus dem Gutachten extrahierten
// Werte des Claims. Für KB/SV/Kunde/Kanzlei wird sie nicht eingebunden;
// die Felder werden ausserdem in getClaimForRole für Nicht-Admins entfernt.

import { FileText, AlertTriangle } from 'lucide-react'

type OcrData = {
  reparaturkosten_netto: number | null
  reparaturkosten_brutto: number | null
  minderwert: number | null
  restwert: number | null
  wiederbeschaffungswert: number | null
  wiederbeschaffungsdauer_tage: number | null
  nutzungsausfall_tage: number | null
  totalschaden: boolean | null
  gutachten_datum: string | null
  gutachten_ocr_processed_at: string | null
  gutachten_ocr_error: string | null
}

type Props = {
  data: OcrData
}

const formatEuro = (n: number | null) =>
  n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const formatDate = (s: string | null) => {
  if (!s) return '–'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('de-DE')
}

export default function GutachtenOcrCard({ data }: Props) {
  const verarbeitet = !!data.gutachten_ocr_processed_at
  const fehler = data.gutachten_ocr_error

  return (
    <section className="bg-white border border-claimondo-border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-claimondo-shield" />
        <h3 className="text-sm font-semibold text-claimondo-navy">
          Gutachten-Auswertung
        </h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-claimondo-ondo/70">
          Admin-only · OCR
        </span>
      </div>

      {!verarbeitet && (
        <p className="text-xs text-claimondo-ondo">
          Noch keine OCR-Auswertung — wird nach QC-Freigabe automatisch
          generiert.
        </p>
      )}

      {verarbeitet && fehler && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div>
            <p className="font-medium">OCR-Fehler</p>
            <p className="text-amber-800">{fehler}</p>
          </div>
        </div>
      )}

      {verarbeitet && !fehler && (
        <>
          {data.totalschaden && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-800 border border-red-200">
              Totalschaden
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Field label="Reparaturkosten netto" value={formatEuro(data.reparaturkosten_netto)} />
            <Field label="Reparaturkosten brutto" value={formatEuro(data.reparaturkosten_brutto)} />
            <Field label="Minderwert" value={formatEuro(data.minderwert)} />
            <Field label="Wiederbeschaffungswert" value={formatEuro(data.wiederbeschaffungswert)} />
            <Field label="Restwert" value={formatEuro(data.restwert)} />
            <Field
              label="Wiederbeschaffungsdauer"
              value={data.wiederbeschaffungsdauer_tage != null ? `${data.wiederbeschaffungsdauer_tage} Tage` : '–'}
            />
            <Field
              label="Nutzungsausfall"
              value={data.nutzungsausfall_tage != null ? `${data.nutzungsausfall_tage} Tage` : '–'}
            />
            <Field label="Gutachten-Datum" value={formatDate(data.gutachten_datum)} />
          </dl>
          <p className="text-[10px] text-claimondo-ondo/70">
            Verarbeitet {formatDate(data.gutachten_ocr_processed_at)} · Werte
            stammen aus automatischer PDF-Extraktion und sind ggf. manuell zu
            verifizieren.
          </p>
        </>
      )}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-claimondo-ondo/80">{label}</dt>
      <dd className="text-claimondo-navy font-medium text-right">{value}</dd>
    </>
  )
}
