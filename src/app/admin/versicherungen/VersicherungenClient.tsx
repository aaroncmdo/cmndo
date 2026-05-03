'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon, PhoneIcon, MailIcon, GlobeIcon, PlusIcon, XIcon } from 'lucide-react'
import PhoneButton from '@/components/shared/PhoneButton'
import PageHeader from '@/components/shared/PageHeader'
import { Modal } from '@/components/primitives/Modal'
import { StatusBadge } from '@/components/shared/StatusBadge'

type Versicherung = {
  id: string
  name: string
  schaden_telefon: string | null
  schaden_email: string | null
  hotline_telefon: string | null
  webseite: string | null
  adresse: string | null
  plz: string | null
  stadt: string | null
  bafin_nummer: string | null
  ist_aktiv: boolean
}

export default function VersicherungenClient({ versicherungen }: { versicherungen: Versicherung[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Versicherung | null>(null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<Partial<Versicherung>>({})
  const [saving, setSaving] = useState(false)

  const filtered = versicherungen.filter(v => {
    const q = search.toLowerCase()
    return v.name.toLowerCase().includes(q) || (v.stadt ?? '').toLowerCase().includes(q)
  })

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('versicherungen').update(form).eq('id', selected.id)
    setSaving(false)
    setEditing(false)
    setSelected(null)
    router.refresh()
  }

  async function handleCreate() {
    if (!form.name?.trim()) return
    setSaving(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('versicherungen').insert({
      name: form.name.trim(),
      schaden_telefon: form.schaden_telefon || null,
      schaden_email: form.schaden_email || null,
      hotline_telefon: form.hotline_telefon || null,
      webseite: form.webseite || null,
      adresse: form.adresse || null,
      plz: form.plz || null,
      stadt: form.stadt || null,
      bafin_nummer: form.bafin_nummer || null,
    })
    setSaving(false)
    setCreating(false)
    setForm({})
    router.refresh()
  }

  async function handleToggleActive(v: Versicherung) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('versicherungen').update({ ist_aktiv: !v.ist_aktiv }).eq('id', v.id)
    router.refresh()
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-claimondo-border shrink-0">
        <PageHeader
          title="Versicherer"
          description={`${filtered.length} von ${versicherungen.length}`}
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo/70" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
                  className="pl-8 pr-3 py-1.5 bg-white border border-claimondo-border rounded-lg text-xs text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#4573A2] w-48" />
              </div>
              <button onClick={() => { setCreating(true); setForm({}) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4573A2] text-white rounded-lg text-xs font-medium hover:bg-[#1E3A5F] transition-colors">
                <PlusIcon className="w-3.5 h-3.5" /> Neue Versicherung
              </button>
            </div>
          }
        />
      </div>

      {/* Tabelle */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b border-claimondo-border z-10">
            <tr>
              <th className="text-left px-4 py-2 text-claimondo-ondo font-medium text-xs">Name</th>
              <th className="text-left px-4 py-2 text-claimondo-ondo font-medium text-xs">Schadentelefon</th>
              <th className="text-left px-4 py-2 text-claimondo-ondo font-medium text-xs">Schaden-Email</th>
              <th className="text-left px-4 py-2 text-claimondo-ondo font-medium text-xs">Stadt</th>
              <th className="text-left px-4 py-2 text-claimondo-ondo font-medium text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id} onClick={() => { setSelected(v); setForm(v); setEditing(false) }}
                className={`border-b border-claimondo-border hover:bg-[#f8f9fb] cursor-pointer transition-colors ${!v.ist_aktiv ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2.5 font-medium text-claimondo-navy text-xs">{v.name}</td>
                <td className="px-4 py-2.5 text-xs">
                  {v.schaden_telefon ? (
                    <PhoneButton nummer={v.schaden_telefon} variant="inline" label={v.schaden_telefon} stopPropagation />
                  ) : <span className="text-claimondo-ondo/50">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {v.schaden_email ? (
                    <a href={`mailto:${v.schaden_email}`} className="text-[#4573A2] hover:underline flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <MailIcon className="w-3 h-3" /> {v.schaden_email}
                    </a>
                  ) : <span className="text-claimondo-ondo/50">—</span>}
                </td>
                <td className="px-4 py-2.5 text-claimondo-ondo text-xs">{v.stadt ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge tone={v.ist_aktiv ? 'success' : 'danger'}>
                    {v.ist_aktiv ? 'Aktiv' : 'Deaktiviert'}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create-Modal */}
      <Modal open={creating} onClose={() => setCreating(false)} noPadding hideCloseButton maxWidth={512} ariaLabel="Neue Versicherung">
        <div className="max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-base font-semibold text-claimondo-navy">Neue Versicherung</h2>
            <button onClick={() => setCreating(false)} className="p-1 text-claimondo-ondo/70 hover:text-claimondo-ondo"><XIcon className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-3">
            {(['name', 'schaden_telefon', 'schaden_email', 'hotline_telefon', 'webseite', 'adresse', 'plz', 'stadt', 'bafin_nummer'] as const).map(key => (
              <div key={key}>
                <label className="text-xs text-claimondo-ondo mb-0.5 block">{key === 'name' ? 'Name *' : key.replace(/_/g, ' ')}</label>
                <input value={(form as Record<string, string | null>)[key] ?? ''} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <button onClick={handleCreate} disabled={saving || !form.name?.trim()}
                className="flex-1 py-2 bg-[#4573A2] text-white rounded-lg text-sm font-medium hover:bg-[#1E3A5F] disabled:opacity-50">
                {saving ? 'Speichert...' : 'Erstellen'}
              </button>
              <button onClick={() => setCreating(false)} className="px-4 py-2 bg-[#f8f9fb] text-claimondo-navy rounded-lg text-sm">Abbrechen</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Detail-Panel */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} noPadding hideCloseButton maxWidth={512} ariaLabel="Versicherer-Detail">
        {selected && (
          <div className="max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border">
              <h2 className="text-base font-semibold text-claimondo-navy">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="p-1 text-claimondo-ondo/70 hover:text-claimondo-ondo"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {editing ? (
                <>
                  {(['name', 'schaden_telefon', 'schaden_email', 'hotline_telefon', 'webseite', 'adresse', 'plz', 'stadt', 'bafin_nummer'] as const).map(key => (
                    <div key={key}>
                      <label className="text-xs text-claimondo-ondo mb-0.5 block">{key.replace(/_/g, ' ')}</label>
                      <input value={(form as Record<string, string | null>)[key] ?? ''} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value || null }))}
                        className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} disabled={saving}
                      className="flex-1 py-2 bg-[#4573A2] text-white rounded-lg text-sm font-medium hover:bg-[#1E3A5F] disabled:opacity-50">
                      {saving ? 'Speichert...' : 'Speichern'}
                    </button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 bg-[#f8f9fb] text-claimondo-navy rounded-lg text-sm">Abbrechen</button>
                  </div>
                </>
              ) : (
                <>
                  <Row label="Schadentelefon" value={selected.schaden_telefon} type="tel" />
                  <Row label="Schaden-Email" value={selected.schaden_email} type="email" />
                  <Row label="Hotline" value={selected.hotline_telefon} type="tel" />
                  <Row label="Webseite" value={selected.webseite} type="link" />
                  <Row label="Adresse" value={selected.adresse} />
                  <Row label="PLZ / Stadt" value={[selected.plz, selected.stadt].filter(Boolean).join(' ')} />
                  <Row label="BaFin-Nr." value={selected.bafin_nummer} />
                  <div className="flex gap-2 pt-3">
                    <button onClick={() => setEditing(true)} className="flex-1 py-2 bg-[#0D1B3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3A5F]">Bearbeiten</button>
                    <button onClick={() => handleToggleActive(selected)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${selected.ist_aktiv ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                      {selected.ist_aktiv ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Row({ label, value, type }: { label: string; value: string | null; type?: 'tel' | 'email' | 'link' }) {
  if (!value) return (
    <div className="flex justify-between py-1.5 border-b border-claimondo-border">
      <span className="text-xs text-claimondo-ondo/70">{label}</span>
      <span className="text-xs text-claimondo-ondo/50">—</span>
    </div>
  )

  return (
    <div className="flex justify-between items-center py-1.5 border-b border-claimondo-border">
      <span className="text-xs text-claimondo-ondo/70">{label}</span>
      {type === 'tel' ? (
        <PhoneButton nummer={value} variant="inline" label={value} className="text-xs" />
      ) : type === 'email' ? (
        <a href={`mailto:${value}`} className="text-xs text-[#4573A2] hover:underline flex items-center gap-1">
          <MailIcon className="w-3 h-3" /> {value}
        </a>
      ) : type === 'link' ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4573A2] hover:underline flex items-center gap-1">
          <GlobeIcon className="w-3 h-3" /> Webseite
        </a>
      ) : (
        <span className="text-xs text-claimondo-navy">{value}</span>
      )}
    </div>
  )
}
