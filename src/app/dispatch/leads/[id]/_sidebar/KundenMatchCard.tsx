'use client'

// Sidebar-Card "Bestehender Kunde?" — Dispatcher-Hinweis wenn der Lead-
// Kontakt schon mal einen Fall hatte. Klick öffnet Modal mit Kandidaten-
// Liste (Fahrzeug, Kennzeichen, Fallnummer, KB).

import { useEffect, useState, useTransition } from 'react'
import { UserCheckIcon, UsersIcon, XIcon, CheckIcon, FileTextIcon, CarIcon, UserIcon, WrenchIcon } from 'lucide-react'
import {
  findKundenMatches,
  linkLeadToExistingKunde,
  unlinkLeadKunde,
  type KundenMatch,
} from '../_actions/kunden-match'

type Props = {
  leadId: string
  /** Vom Dispatcher bereits gewaehlter Kunde (lead.kunde_id). NULL = neu. */
  initialMatchedKundeId: string | null
}

export default function KundenMatchCard({ leadId, initialMatchedKundeId }: Props) {
  const [matches, setMatches] = useState<KundenMatch[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [matchedId, setMatchedId] = useState<string | null>(initialMatchedKundeId)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void findKundenMatches(leadId).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setMatches(res.matches)
        setLoaded(true)
      } else {
        setError(res.error)
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [leadId])

  function handleSelect(kundeUserId: string) {
    startTransition(async () => {
      const res = await linkLeadToExistingKunde(leadId, kundeUserId)
      if (res.ok) {
        setMatchedId(kundeUserId)
        setOpen(false)
      } else {
        setError(res.error ?? 'Verknüpfen fehlgeschlagen')
      }
    })
  }

  function handleUnlink() {
    startTransition(async () => {
      const res = await unlinkLeadKunde(leadId)
      if (res.ok) {
        setMatchedId(null)
      } else {
        setError(res.error ?? 'Trennen fehlgeschlagen')
      }
    })
  }

  if (!loaded) {
    return (
      <div className="bg-white border border-claimondo-border rounded-xl px-3 py-2.5 text-xs text-claimondo-ondo">
        Bestehender Kunde wird geprüft …
      </div>
    )
  }

  // Kein Match — nichts anzeigen (sauber halten, Default-Annahme: neuer Kunde)
  if (matches.length === 0 && !matchedId) return null

  const matchedCandidate = matches.find((m) => m.kunde_user_id === matchedId)

  return (
    <>
      <div className={`rounded-xl px-3 py-3 ${matchedId ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
        <div className="flex items-center gap-2 mb-2">
          {matchedId ? (
            <UserCheckIcon className="w-4 h-4 text-emerald-700" />
          ) : (
            <UsersIcon className="w-4 h-4 text-amber-700" />
          )}
          <p className={`text-xs font-semibold ${matchedId ? 'text-emerald-800' : 'text-amber-800'}`}>
            {matchedId ? 'Bestehender Kunde verknüpft' : `Bestehender Kunde gefunden (${matches.length})`}
          </p>
        </div>
        {matchedCandidate ? (
          <div className="space-y-1.5">
            <p className="text-xs text-emerald-900">
              <strong>{[matchedCandidate.vorname, matchedCandidate.nachname].filter(Boolean).join(' ') || matchedCandidate.email}</strong>
              {matchedCandidate.faelle.length > 0 && (
                <span className="text-emerald-700"> · {matchedCandidate.faelle.length} bisheriger Fall</span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={pending}
                className="text-[11px] text-emerald-700 hover:text-emerald-900 underline disabled:opacity-50"
              >
                Anders zuordnen
              </button>
              <button
                type="button"
                onClick={handleUnlink}
                disabled={pending}
                className="text-[11px] text-emerald-700 hover:text-emerald-900 underline disabled:opacity-50"
              >
                Verknüpfung lösen
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-amber-900 mb-2 leading-snug">
              E-Mail oder Telefonnummer treffen mit bestehenden Kunden zusammen.
              Ist es derselbe Kunde?
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold py-1.5 disabled:opacity-50"
            >
              <UsersIcon className="w-3.5 h-3.5" />
              Kandidaten ansehen
            </button>
          </>
        )}
        {error && <p className="text-[10px] text-rose-700 mt-1">{error}</p>}
      </div>

      {open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center px-4 py-6">
          <div
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-claimondo-navy/40 backdrop-blur-md"
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bestehenden Kunden zuordnen"
            className="relative w-full max-w-2xl max-h-[calc(100vh-3rem)] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-claimondo-border">
              <div className="flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-claimondo-navy" />
                <h2 className="text-sm font-semibold text-claimondo-navy">
                  Bestehende Kunden ({matches.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="text-claimondo-ondo hover:text-claimondo-navy p-1 rounded hover:bg-[#f8f9fb]"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8f9fb]">
              <p className="text-xs text-claimondo-ondo mb-2">
                Wähle den Kunden, mit dem dieser Lead verknüpft werden soll. Wenn keiner passt,
                bleibt es ein neuer Kunde.
              </p>
              {matches.map((m) => (
                <KandidatCard
                  key={m.kunde_user_id}
                  match={m}
                  isSelected={matchedId === m.kunde_user_id}
                  pending={pending}
                  onSelect={() => handleSelect(m.kunde_user_id)}
                />
              ))}
            </div>
            <div className="px-5 py-3 border-t border-claimondo-border bg-white flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy"
              >
                Abbrechen — neuer Kunde
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function KandidatCard({
  match,
  isSelected,
  pending,
  onSelect,
}: {
  match: KundenMatch
  isSelected: boolean
  pending: boolean
  onSelect: () => void
}) {
  const name = [match.vorname, match.nachname].filter(Boolean).join(' ') || '(Name unbekannt)'
  const matchLabel: Record<string, string> = {
    email: 'E-Mail',
    telefon: 'Telefon',
    name_geburtsdatum: 'Name + Geburtsdatum',
  }

  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3 ${
        isSelected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-claimondo-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-claimondo-navy text-white flex items-center justify-center text-xs font-bold shrink-0">
          {(match.vorname?.[0] ?? '') + (match.nachname?.[0] ?? '')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-sm font-semibold text-claimondo-navy">{name}</p>
            {match.match_basis.map((b) => (
              <span
                key={b}
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold"
              >
                Treffer: {matchLabel[b]}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-claimondo-ondo">
            {match.email ?? '—'} · {match.telefon ?? '—'}
          </p>

          {match.faelle.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {match.faelle.map((f) => (
                <div
                  key={f.fall_id}
                  className="flex items-center gap-2 rounded-lg bg-[#f8f9fb] border border-claimondo-border px-2.5 py-1.5"
                >
                  <FileTextIcon className="w-3 h-3 text-claimondo-ondo shrink-0" />
                  <span className="text-[11px] font-mono font-semibold text-claimondo-navy">
                    {f.fall_nummer ?? f.fall_id.slice(0, 8)}
                  </span>
                  {f.kennzeichen && (
                    <span className="text-[11px] font-mono text-claimondo-navy">
                      · {f.kennzeichen}
                    </span>
                  )}
                  {f.fahrzeug && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-claimondo-ondo truncate">
                      <CarIcon className="w-3 h-3" />
                      {f.fahrzeug}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {f.kb_name && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-claimondo-ondo">
                        <UserIcon className="w-3 h-3" />
                        KB: {f.kb_name}
                      </span>
                    )}
                    {f.sv_name && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-claimondo-ondo">
                        <WrenchIcon className="w-3 h-3" />
                        SV: {f.sv_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-claimondo-ondo italic mt-1">Bisher noch kein Fall</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSelect}
          disabled={pending || isSelected}
          className={`inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold px-3 py-1.5 disabled:opacity-50 ${
            isSelected
              ? 'bg-emerald-600 text-white cursor-default'
              : 'bg-claimondo-navy hover:bg-claimondo-navy/90 text-white'
          }`}
        >
          <CheckIcon className="w-3.5 h-3.5" />
          {isSelected ? 'Verknüpft' : 'Diesem Kunden zuordnen'}
        </button>
      </div>
    </div>
  )
}
