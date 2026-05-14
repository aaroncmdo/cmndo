'use client'

// CMM-42: VS-Korrespondenz erfassen + anzeigen.
//
// Wird unter der RegulierungCard im Fallakte-Layout gerendert (admin/kb).
// Zeigt eine Liste aller VS-Kontakte (chronologisch absteigend) plus einen
// „Kontakt erfassen"-Button der ein Modal-Form oeffnet. Insert geht via
// erfasseVsKorrespondenz Server-Action.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownIcon, ArrowUpIcon, MailIcon, PhoneIcon, FileTextIcon, GlobeIcon, PrinterIcon, PlusIcon } from 'lucide-react'
import { erfasseVsKorrespondenz } from '@/lib/vs-korrespondenz/actions'

type Kanal = 'email' | 'post' | 'fax' | 'telefon' | 'portal'
type Richtung = 'eingehend' | 'ausgehend'

export type VsKorrespondenzEintrag = {
  id: string
  datum: string
  richtung: Richtung
  kanal: Kanal
  versicherung: string | null
  aktenzeichen: string | null
  betreff: string | null
  notiz: string | null
  naechste_frist: string | null
}

type Props = {
  fallId: string
  claimId: string
  eintraege: VsKorrespondenzEintrag[]
  /** Versicherungs-Name aus dem Claim (falls bekannt) — als Default fuer das Form */
  versicherungVorgabe: string | null
}

const KANAL_ICON: Record<Kanal, typeof MailIcon> = {
  email: MailIcon,
  post: FileTextIcon,
  fax: PrinterIcon,
  telefon: PhoneIcon,
  portal: GlobeIcon,
}

const KANAL_LABEL: Record<Kanal, string> = {
  email: 'Email',
  post: 'Post',
  fax: 'Fax',
  telefon: 'Telefon',
  portal: 'Portal',
}

function fmtDatum(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime()
    const d = Math.floor(ms / (1000 * 60 * 60 * 24))
    if (d <= 0) return 'heute'
    if (d === 1) return 'vor 1 Tag'
    return `vor ${d} Tagen`
  } catch {
    return ''
  }
}

function todayLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function VsKorrespondenzCard({ fallId, claimId, eintraege, versicherungVorgabe }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form-State
  const [datum, setDatum] = useState<string>(todayLocalIso())
  const [richtung, setRichtung] = useState<Richtung>('ausgehend')
  const [kanal, setKanal] = useState<Kanal>('telefon')
  const [versicherung, setVersicherung] = useState<string>(versicherungVorgabe ?? '')
  const [aktenzeichen, setAktenzeichen] = useState<string>('')
  const [betreff, setBetreff] = useState<string>('')
  const [notiz, setNotiz] = useState<string>('')
  const [naechsteFrist, setNaechsteFrist] = useState<string>('')

  const [filterRichtung, setFilterRichtung] = useState<'alle' | Richtung>('alle')

  const sichtbar = filterRichtung === 'alle'
    ? eintraege
    : eintraege.filter((e) => e.richtung === filterRichtung)

  function reset() {
    setDatum(todayLocalIso())
    setRichtung('ausgehend')
    setKanal('telefon')
    setVersicherung(versicherungVorgabe ?? '')
    setAktenzeichen('')
    setBetreff('')
    setNotiz('')
    setNaechsteFrist('')
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const r = await erfasseVsKorrespondenz({
        claimId,
        fallId,
        richtung,
        kanal,
        datum: new Date(datum).toISOString(),
        versicherung: versicherung || null,
        aktenzeichen: aktenzeichen || null,
        betreff: betreff || null,
        notiz: notiz || null,
        naechsteFrist: naechsteFrist ? new Date(naechsteFrist).toISOString() : null,
      })
      if (!r.ok) {
        setError(r.error ?? 'Speichern fehlgeschlagen')
        return
      }
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-claimondo-navy">VS-Korrespondenz</p>
          <p className="text-xs text-claimondo-ondo">Anrufe, Emails, Briefe mit der Versicherung</p>
        </div>
        <button
          type="button"
          onClick={() => { reset(); setOpen(true) }}
          className="inline-flex items-center gap-1.5 rounded-ios-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-xs font-medium px-3 py-2 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Kontakt erfassen
        </button>
      </div>

      {/* Filter-Pills */}
      {eintraege.length > 0 && (
        <div className="flex gap-1">
          {(['alle', 'eingehend', 'ausgehend'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilterRichtung(opt)}
              className={`text-[11px] px-2.5 py-1 rounded-ios-md font-medium transition-colors ${
                filterRichtung === opt
                  ? 'bg-claimondo-navy text-white'
                  : 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              {opt === 'alle' ? 'Alle' : opt === 'eingehend' ? 'Eingehend' : 'Ausgehend'}
            </button>
          ))}
        </div>
      )}

      {/* Liste */}
      {sichtbar.length === 0 ? (
        <p className="text-xs text-claimondo-ondo italic py-4 text-center">
          {eintraege.length === 0
            ? 'Noch keine Korrespondenz erfasst. Trage den ersten Kontakt mit der Versicherung ein.'
            : 'Keine Einträge für diesen Filter.'}
        </p>
      ) : (
        <ol className="space-y-2">
          {sichtbar.map((e) => {
            const KIcon = KANAL_ICON[e.kanal]
            const fristAbgelaufen = e.naechste_frist != null && new Date(e.naechste_frist).getTime() < Date.now()
            return (
              <li key={e.id} className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <KIcon className="w-4 h-4 text-claimondo-ondo" />
                    {e.richtung === 'eingehend'
                      ? <ArrowDownIcon className="w-3 h-3 text-emerald-600" />
                      : <ArrowUpIcon className="w-3 h-3 text-claimondo-ondo" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-claimondo-navy">
                        {KANAL_LABEL[e.kanal]} · {e.richtung === 'eingehend' ? 'eingehend' : 'ausgehend'}
                      </span>
                      <span className="text-[11px] text-claimondo-ondo">
                        {fmtDatum(e.datum)} ({fmtRelative(e.datum)})
                      </span>
                    </div>
                    {e.betreff && (
                      <p className="text-xs text-claimondo-navy mt-0.5 truncate">{e.betreff}</p>
                    )}
                    {(e.versicherung || e.aktenzeichen) && (
                      <p className="text-[11px] text-claimondo-ondo mt-0.5">
                        {e.versicherung ?? ''}
                        {e.versicherung && e.aktenzeichen ? ' · AZ ' : ''}
                        {e.aktenzeichen ?? ''}
                      </p>
                    )}
                    {e.notiz && (
                      <p className="text-[11px] text-claimondo-navy/80 mt-1 whitespace-pre-wrap">{e.notiz}</p>
                    )}
                    {e.naechste_frist && (
                      <p className={`text-[11px] mt-1 font-medium ${fristAbgelaufen ? 'text-red-700' : 'text-claimondo-navy'}`}>
                        Nächste Frist: {fmtDatum(e.naechste_frist)}{fristAbgelaufen ? ' (abgelaufen)' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-claimondo-navy">VS-Kontakt erfassen</h3>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Datum">
                <input
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  className="w-full rounded-ios-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                />
              </Field>
              <Field label="Richtung">
                <select
                  value={richtung}
                  onChange={(e) => setRichtung(e.target.value as Richtung)}
                  className="w-full rounded-ios-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                >
                  <option value="ausgehend">Ausgehend (wir an VS)</option>
                  <option value="eingehend">Eingehend (VS an uns)</option>
                </select>
              </Field>
            </div>

            <Field label="Kanal">
              <div className="grid grid-cols-5 gap-1">
                {(['telefon', 'email', 'post', 'fax', 'portal'] as const).map((k) => {
                  const KIcon = KANAL_ICON[k]
                  const active = kanal === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKanal(k)}
                      className={`flex flex-col items-center gap-0.5 py-2 rounded-ios-lg border text-[11px] font-medium transition-colors ${
                        active
                          ? 'border-claimondo-navy bg-claimondo-navy text-white'
                          : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
                      }`}
                    >
                      <KIcon className="w-4 h-4" />
                      {KANAL_LABEL[k]}
                    </button>
                  )
                })}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Versicherung">
                <input
                  type="text"
                  value={versicherung}
                  onChange={(e) => setVersicherung(e.target.value)}
                  placeholder="z.B. Allianz"
                  className="w-full rounded-ios-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                />
              </Field>
              <Field label="Aktenzeichen">
                <input
                  type="text"
                  value={aktenzeichen}
                  onChange={(e) => setAktenzeichen(e.target.value)}
                  placeholder="VS-AZ"
                  className="w-full rounded-ios-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                />
              </Field>
            </div>

            <Field label="Betreff">
              <input
                type="text"
                value={betreff}
                onChange={(e) => setBetreff(e.target.value)}
                placeholder="Kurz worum es ging"
                className="w-full rounded-ios-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </Field>

            <Field label="Notiz">
              <textarea
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                rows={3}
                placeholder="Was wurde besprochen, zugesagt, gefordert?"
                className="w-full rounded-ios-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </Field>

            <Field label="Nächste erwartete Frist (optional)">
              <input
                type="date"
                value={naechsteFrist}
                onChange={(e) => setNaechsteFrist(e.target.value)}
                className="w-full rounded-ios-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </Field>

            {error && <p className="text-xs text-red-700">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => { setOpen(false); reset() }}
                disabled={pending}
                className="px-3 py-1.5 text-sm text-claimondo-ondo hover:text-claimondo-navy"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                className="rounded-ios-lg bg-claimondo-navy hover:bg-claimondo-navy/90 disabled:bg-claimondo-navy/40 text-white text-sm font-medium px-4 py-1.5 transition-colors"
              >
                {pending ? 'Speichert…' : 'Eintragen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-claimondo-navy block mb-1">{label}</span>
      {children}
    </label>
  )
}
