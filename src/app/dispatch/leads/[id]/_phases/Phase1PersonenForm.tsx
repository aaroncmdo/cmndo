'use client'

// AAR-358: Dynamische Personen-Liste für Phase 1 Qualifizierung. Wird
// gerendert wenn personenschaden_flag=true. Dispatcher kann beliebig viele
// verletzte Personen (Fahrzeuginsasse / Fußgänger / Gegner) mit Personalien
// + Verletzungsart erfassen. Jede Person wird direkt in
// personenschaden_personen persistiert (lead_id, fall_id wird beim
// signSAandCreateFall nachgezogen).

import { useEffect, useState, useTransition } from 'react'
import {
  listPersonenForLead,
  upsertPersonForLead,
  deletePersonForLead,
  type PersonenschadenPerson,
} from '../actions'
import { PlusIcon, Trash2Icon, UserIcon } from 'lucide-react'

type Draft = {
  id?: string
  vorname: string
  nachname: string
  geburtsdatum: string
  verletzungsart: string
  ist_fahrzeuginsasse: boolean
  notizen: string
  // leer = noch nicht in DB (vorläufige Zeile bis „Speichern"-Klick)
  persisted: boolean
}

const EMPTY_DRAFT = (): Draft => ({
  vorname: '',
  nachname: '',
  geburtsdatum: '',
  verletzungsart: '',
  ist_fahrzeuginsasse: true,
  notizen: '',
  persisted: false,
})

function fromPerson(p: PersonenschadenPerson): Draft {
  return {
    id: p.id,
    vorname: p.vorname ?? '',
    nachname: p.nachname ?? '',
    geburtsdatum: p.geburtsdatum ?? '',
    verletzungsart: p.verletzungsart ?? '',
    ist_fahrzeuginsasse: p.ist_fahrzeuginsasse,
    notizen: p.notizen ?? '',
    persisted: true,
  }
}

export default function Phase1PersonenForm({ leadId }: { leadId: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await listPersonenForLead(leadId)
      if (cancelled) return
      setLoading(false)
      if (r.success && r.personen) {
        setDrafts(r.personen.length > 0 ? r.personen.map(fromPerson) : [EMPTY_DRAFT()])
      } else {
        setDrafts([EMPTY_DRAFT()])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [leadId])

  function updateDraft(idx: number, patch: Partial<Draft>) {
    setDrafts((d) => d.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
  }

  function addRow() {
    setDrafts((d) => [...d, EMPTY_DRAFT()])
  }

  async function saveRow(idx: number) {
    const draft = drafts[idx]
    if (!draft) return
    startTransition(async () => {
      const r = await upsertPersonForLead(leadId, {
        id: draft.id,
        vorname: draft.vorname.trim() || null,
        nachname: draft.nachname.trim() || null,
        geburtsdatum: draft.geburtsdatum || null,
        verletzungsart: draft.verletzungsart.trim() || null,
        ist_fahrzeuginsasse: draft.ist_fahrzeuginsasse,
        notizen: draft.notizen.trim() || null,
      })
      if (r.success && r.person) {
        updateDraft(idx, { id: r.person.id, persisted: true })
        setToast('Gespeichert')
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(''), 2500)
    })
  }

  async function removeRow(idx: number) {
    const draft = drafts[idx]
    if (!draft) return
    if (draft.persisted && draft.id) {
      startTransition(async () => {
        const r = await deletePersonForLead(leadId, draft.id!)
        if (r.success) {
          setDrafts((d) => d.filter((_, i) => i !== idx))
          setToast('Gelöscht')
        } else {
          setToast(r.error ?? 'Fehler')
        }
        setTimeout(() => setToast(''), 2500)
      })
    } else {
      setDrafts((d) => d.filter((_, i) => i !== idx))
    }
  }

  if (loading) {
    return <p className="text-[11px] text-claimondo-ondo">Lade Personen …</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-claimondo-ondo">
          {drafts.length} {drafts.length === 1 ? 'Person' : 'Personen'} erfasst
        </p>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[#4573A2] text-white hover:bg-[#0D1B3E]"
        >
          <PlusIcon className="w-3 h-3" />
          Weitere Person
        </button>
      </div>

      {drafts.map((d, idx) => (
        <div
          key={d.id ?? `new-${idx}`}
          className="bg-white border border-rose-200 rounded-lg p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <UserIcon className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-[11px] font-semibold text-rose-900">
              Person {idx + 1}
              {!d.persisted && (
                <span className="ml-1 text-[10px] text-amber-700">(ungespeichert)</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="ml-auto p-1 rounded hover:bg-red-50 text-red-600"
              title="Person entfernen"
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={d.vorname}
              onChange={(e) => updateDraft(idx, { vorname: e.target.value })}
              placeholder="Vorname"
              className="px-2 py-1 border border-claimondo-border rounded text-[11px]"
            />
            <input
              type="text"
              value={d.nachname}
              onChange={(e) => updateDraft(idx, { nachname: e.target.value })}
              placeholder="Nachname"
              className="px-2 py-1 border border-claimondo-border rounded text-[11px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={d.geburtsdatum}
              onChange={(e) => updateDraft(idx, { geburtsdatum: e.target.value })}
              className="px-2 py-1 border border-claimondo-border rounded text-[11px]"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-claimondo-navy px-2 py-1 border border-claimondo-border rounded cursor-pointer">
              <input
                type="checkbox"
                checked={d.ist_fahrzeuginsasse}
                onChange={(e) =>
                  updateDraft(idx, { ist_fahrzeuginsasse: e.target.checked })
                }
                className="w-3.5 h-3.5"
              />
              Fahrzeuginsasse
            </label>
          </div>

          <input
            type="text"
            value={d.verletzungsart}
            onChange={(e) => updateDraft(idx, { verletzungsart: e.target.value })}
            placeholder="Verletzungsart (z.B. Schleudertrauma, Prellung, Platzwunde)"
            className="w-full px-2 py-1 border border-claimondo-border rounded text-[11px]"
          />

          <textarea
            value={d.notizen}
            onChange={(e) => updateDraft(idx, { notizen: e.target.value })}
            placeholder="Notizen (optional)"
            className="w-full px-2 py-1 border border-claimondo-border rounded text-[11px] h-14 resize-none"
          />

          <button
            type="button"
            onClick={() => saveRow(idx)}
            disabled={pending}
            className="w-full px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#0D1B3E] text-white hover:bg-[#1E3A5F] disabled:opacity-50"
          >
            {d.persisted ? 'Aktualisieren' : 'Speichern'}
          </button>
        </div>
      ))}

      {toast && (
        <div
          className={`text-[11px] px-2 py-1 rounded ${
            toast === 'Gespeichert' || toast === 'Gelöscht'
              ? 'bg-green-50 text-green-700'
              : 'bg-amber-50 text-amber-800'
          }`}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
