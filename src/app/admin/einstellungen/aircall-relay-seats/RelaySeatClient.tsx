'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PlusIcon, Trash2Icon, PhoneIcon } from 'lucide-react'

type Seat = {
  id: string; aircall_user_id: number; aircall_user_email: string; aircall_number_id: number
  bezeichnung: string; aktiv: boolean; belegt: boolean; belegt_seit: string | null; notiz: string | null
}

export default function RelaySeatClient({ seats: initialSeats }: { seats: Seat[] }) {
  const router = useRouter()
  const [seats, setSeats] = useState(initialSeats)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ aircall_user_id: '', aircall_user_email: '', aircall_number_id: '', bezeichnung: '' })
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!form.aircall_user_id || !form.bezeichnung) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('aircall_relay_seats').insert({
      aircall_user_id: Number(form.aircall_user_id),
      aircall_user_email: form.aircall_user_email,
      aircall_number_id: Number(form.aircall_number_id),
      bezeichnung: form.bezeichnung,
    })
    if (!error) {
      setShowAdd(false)
      setForm({ aircall_user_id: '', aircall_user_email: '', aircall_number_id: '', bezeichnung: '' })
      router.refresh()
    }
    setSaving(false)
  }

  async function toggleAktiv(id: string, aktiv: boolean) {
    const supabase = createClient()
    await supabase.from('aircall_relay_seats').update({ aktiv: !aktiv }).eq('id', id)
    setSeats(prev => prev.map(s => s.id === id ? { ...s, aktiv: !aktiv } : s))
  }

  async function handleDelete(id: string) {
    if (!confirm('Relay-Seat wirklich löschen?')) return
    const supabase = createClient()
    await supabase.from('aircall_relay_seats').delete().eq('id', id)
    setSeats(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Aircall Relay-Seats</h1>
            <p className="text-sm text-gray-500">Dedizierte Aircall-User für Bridge-Vermittlung (Kunde ↔ SV)</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#4573A2] text-white text-xs font-medium rounded-lg hover:bg-[#1E3A5F] transition-colors">
            <PlusIcon className="w-3.5 h-3.5" /> Seat hinzufügen
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-amber-700">Ein Relay-Seat kann immer nur EINEN aktiven Bridge-Call haben. Für parallele Bridge-Calls müssen mehrere Seats angelegt sein.</p>
        </div>

        <div className="space-y-3">
          {seats.map(seat => (
            <div key={seat.id} className={`bg-white border rounded-xl p-4 ${seat.belegt ? 'border-red-200' : seat.aktiv ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${seat.belegt ? 'bg-red-100' : seat.aktiv ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <PhoneIcon className={`w-4 h-4 ${seat.belegt ? 'text-red-500' : seat.aktiv ? 'text-green-500' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{seat.bezeichnung}</p>
                    <p className="text-xs text-gray-500">{seat.aircall_user_email} · User {seat.aircall_user_id} · Nummer {seat.aircall_number_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    seat.belegt ? 'bg-red-50 text-red-600' : seat.aktiv ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {seat.belegt ? 'Belegt' : seat.aktiv ? 'Frei' : 'Inaktiv'}
                  </span>
                  <button onClick={() => toggleAktiv(seat.id, seat.aktiv)}
                    className="text-xs text-[#4573A2] hover:underline">
                    {seat.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  <button onClick={() => handleDelete(seat.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {seats.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">Noch keine Relay-Seats konfiguriert.</p>
          )}
        </div>

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Relay-Seat hinzufügen</h3>
              <div className="space-y-3">
                <input value={form.bezeichnung} onChange={e => setForm(p => ({ ...p, bezeichnung: e.target.value }))} placeholder="Bezeichnung (z.B. Bridge 1)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />
                <input value={form.aircall_user_email} onChange={e => setForm(p => ({ ...p, aircall_user_email: e.target.value }))} placeholder="Aircall User Email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.aircall_user_id} onChange={e => setForm(p => ({ ...p, aircall_user_id: e.target.value }))} placeholder="Aircall User ID" type="number"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />
                  <input value={form.aircall_number_id} onChange={e => setForm(p => ({ ...p, aircall_number_id: e.target.value }))} placeholder="Aircall Number ID" type="number"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Abbrechen</button>
                <button onClick={handleAdd} disabled={saving || !form.bezeichnung || !form.aircall_user_id}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-[#4573A2] rounded-lg hover:bg-[#1E3A5F] disabled:opacity-50">
                  {saving ? '...' : 'Hinzufügen'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
