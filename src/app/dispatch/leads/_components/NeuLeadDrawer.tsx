'use client'

// AAR-110: Lead manuell anlegen Drawer
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, XIcon } from 'lucide-react'
import { createManualLead, type CreateManualLeadInput } from '../actions'

// AAR-216: schadens_fall_typ aus dem Initial-State entfernt — der MA kennt den
// Schadentyp beim Lead-Anlegen noch nicht (Kunde wurde noch nicht gesprochen).
// Der echte Schadentyp wird in Phase 2 via SchadentypPicker erfasst (in das
// neue Feld leads.schadentyp). Der alte SF-Wert (schadens_fall_typ) ist Legacy.
const INITIAL: CreateManualLeadInput = {
  vorname: '',
  nachname: '',
  telefon: '',
  email: '',
  plz: '',
  service_typ: 'komplett',
  source_channel: 'manuell',
  notizen: '',
}

export default function NeuLeadDrawer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CreateManualLeadInput>(INITIAL)

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await createManualLead(data)
      if (!result.success || !result.leadId) {
        setError(result.error ?? 'Fehler')
        return
      }
      setData(INITIAL)
      setOpen(false)
      router.push(`/dispatch/leads/${result.leadId}`)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#1E3A5F] hover:bg-[#4573A2] text-white transition-colors"
      >
        <PlusIcon className="w-4 h-4" />
        Neuer Lead
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={() => setOpen(false)} />

      <div className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-[#0D1B3E]">Neuer Lead</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Vorname" value={data.vorname} onChange={v => setData({ ...data, vorname: v })} />
            <InputField label="Nachname" value={data.nachname} onChange={v => setData({ ...data, nachname: v })} />
          </div>
          <InputField label="Telefon *" value={data.telefon} onChange={v => setData({ ...data, telefon: v })} type="tel" placeholder="+49..." />
          <InputField label="E-Mail" value={data.email} onChange={v => setData({ ...data, email: v })} type="email" />
          <InputField label="PLZ" value={data.plz} onChange={v => setData({ ...data, plz: v })} />

          {/* AAR-216: Schadentyp-Dropdown entfernt — wird in Phase 2 erfasst,
              wenn der MA den Kunden tatsächlich spricht. */}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Service-Typ</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setData({ ...data, service_typ: 'komplett' })}
                className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  data.service_typ === 'komplett' ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Komplett (SV + Kanzlei)
              </button>
              <button
                type="button"
                onClick={() => setData({ ...data, service_typ: 'nur_gutachter' })}
                className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  data.service_typ === 'nur_gutachter' ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Nur Gutachter
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Quelle</label>
            <select
              value={data.source_channel}
              onChange={e => setData({ ...data, source_channel: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#4573A2]"
            >
              <option value="manuell">Manuell angelegt</option>
              <option value="telefon">Telefon (kein Aircall)</option>
              <option value="email">E-Mail</option>
              <option value="empfehlung">Empfehlung</option>
              <option value="google-ads">Google Ads</option>
              <option value="website">Website</option>
              <option value="test">Test-Lead</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Notizen</label>
            <textarea
              value={data.notizen}
              onChange={e => setData({ ...data, notizen: e.target.value })}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#4573A2]"
              placeholder="Optionale Notizen zum Lead..."
            />
          </div>

          {error && <p className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="flex-1 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              disabled={pending || !data.telefon}
              className="flex-1 py-2.5 text-sm font-semibold bg-[#1E3A5F] hover:bg-[#4573A2] text-white rounded-xl disabled:opacity-40"
            >
              {pending ? 'Erstelle...' : 'Lead anlegen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#4573A2]"
      />
    </div>
  )
}
