'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2Icon, XCircleIcon, PlusIcon, FileTextIcon } from 'lucide-react'
import { LoadingButton } from '@/components/ui/loading-button'
import {
  createVertragsvorlage,
  updateVertragsvorlage,
  setVertragsvorlageAktiv,
  setVertragsvorlageInaktiv,
} from './actions'

type Vorlage = {
  id: string
  typ: string
  version: string
  titel: string
  inhalt_html: string
  pflicht_unterschrift: boolean
  aktiv: boolean
  gueltig_ab: string
  created_at: string
  updated_at: string
}

export default function VertraegeEditorClient({ vorlagen }: { vorlagen: Vorlage[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // Group nach typ
  const grouped = vorlagen.reduce((acc, v) => {
    if (!acc[v.typ]) acc[v.typ] = []
    acc[v.typ].push(v)
    return acc
  }, {} as Record<string, Vorlage[]>)

  function refresh() { router.refresh() }

  function handleAktivieren(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await setVertragsvorlageAktiv(id)
      if (!r.success) setError(r.error ?? 'Fehler')
      refresh()
    })
  }

  function handleDeaktivieren(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await setVertragsvorlageInaktiv(id)
      if (!r.success) setError(r.error ?? 'Fehler')
      refresh()
    })
  }

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-claimondo-navy">Vertragsvorlagen</h1>
            <p className="text-claimondo-ondo text-sm mt-0.5">
              Pro Typ darf nur eine Vorlage aktiv sein. Aktive Vorlagen koennen nicht editiert werden — neue Version anlegen + aktivieren.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium rounded-xl transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Neue Vorlage
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Gruppen pro typ */}
        {Object.keys(grouped).length === 0 && (
          <div className="bg-white border border-dashed border-claimondo-border rounded-2xl p-12 text-center">
            <FileTextIcon className="w-10 h-10 text-claimondo-ondo/50 mx-auto mb-3" />
            <p className="text-claimondo-ondo text-sm">Noch keine Vertragsvorlagen.</p>
          </div>
        )}

        {Object.entries(grouped).map(([typ, list]) => (
          <div key={typ} className="mb-8">
            <h2 className="text-sm font-semibold text-claimondo-navy mb-3 uppercase tracking-wide">{typ}</h2>
            <div className="space-y-2">
              {list.map(v => (
                <VorlageCard
                  key={v.id}
                  vorlage={v}
                  isEditing={editingId === v.id}
                  onEdit={() => setEditingId(v.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaved={() => { setEditingId(null); refresh() }}
                  onAktivieren={() => handleAktivieren(v.id)}
                  onDeaktivieren={() => handleDeaktivieren(v.id)}
                  isPending={isPending}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Create Dialog */}
        {createOpen && (
          <CreateDialog
            onClose={() => setCreateOpen(false)}
            onCreated={() => { setCreateOpen(false); refresh() }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Vorlage Card ──────────────────────────────────────────────────────────

function VorlageCard({
  vorlage,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaved,
  onAktivieren,
  onDeaktivieren,
  isPending,
}: {
  vorlage: Vorlage
  isEditing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onAktivieren: () => void
  onDeaktivieren: () => void
  isPending: boolean
}) {
  const [titel, setTitel] = useState(vorlage.titel)
  const [version, setVersion] = useState(vorlage.version)
  const [inhalt, setInhalt] = useState(vorlage.inhalt_html)
  const [pflicht, setPflicht] = useState(vorlage.pflicht_unterschrift)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    setErr(null)
    setSaving(true)
    const r = await updateVertragsvorlage(vorlage.id, {
      titel,
      version,
      inhalt_html: inhalt,
      pflicht_unterschrift: pflicht,
    })
    setSaving(false)
    if (!r.success) { setErr(r.error ?? 'Speicher-Fehler'); return }
    onSaved()
  }

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-[#1E3A5F] rounded-2xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Field label="Titel" value={titel} onChange={setTitel} />
          <Field label="Version" value={version} onChange={setVersion} />
        </div>
        <div className="mb-3">
          <label className="text-xs text-claimondo-ondo mb-1.5 block">Inhalt (HTML)</label>
          <textarea
            value={inhalt}
            onChange={e => setInhalt(e.target.value)}
            rows={14}
            className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-xl px-3 py-2.5 text-sm font-mono text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-claimondo-navy mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={pflicht}
            onChange={e => setPflicht(e.target.checked)}
            className="rounded border-claimondo-border"
          />
          Pflicht-Unterschrift erforderlich
        </label>
        {err && <p className="text-red-600 text-sm mb-2">{err}</p>}
        <div className="flex gap-2">
          <LoadingButton
            onClick={handleSave}
            isLoading={saving}
            loadingText="Speichern..."
            className="px-4 py-2 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium disabled:opacity-40"
          >
            Speichern
          </LoadingButton>
          <button
            onClick={onCancelEdit}
            className="px-4 py-2 rounded-xl border border-claimondo-border text-claimondo-ondo text-sm hover:bg-[#f8f9fb]"
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white border rounded-2xl p-4 ${vorlage.aktiv ? 'border-green-200' : 'border-claimondo-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-claimondo-navy">{vorlage.titel}</h3>
            <span className="text-xs text-claimondo-ondo/70">v{vorlage.version}</span>
            {vorlage.aktiv ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2Icon className="w-3 h-3" />
                Aktiv
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f8f9fb] text-claimondo-ondo font-medium">
                Inaktiv
              </span>
            )}
          </div>
          <p className="text-xs text-claimondo-ondo">
            Erstellt {new Date(vorlage.created_at).toLocaleDateString('de-DE')}
            {vorlage.aktiv && ` · Aktiv seit ${new Date(vorlage.gueltig_ab).toLocaleDateString('de-DE')}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!vorlage.aktiv && (
            <>
              <button
                onClick={onEdit}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg border border-claimondo-border text-claimondo-ondo text-xs hover:bg-[#f8f9fb]"
              >
                Editieren
              </button>
              <LoadingButton
                onClick={onAktivieren}
                isLoading={isPending}
                loadingText="..."
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-40"
              >
                Aktivieren
              </LoadingButton>
            </>
          )}
          {vorlage.aktiv && (
            <LoadingButton
              onClick={onDeaktivieren}
              isLoading={isPending}
              loadingText="..."
              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-40"
            >
              <XCircleIcon className="w-3 h-3" />
              Deaktivieren
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Create Dialog ─────────────────────────────────────────────────────────

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [typ, setTyp] = useState('')
  const [titel, setTitel] = useState('')
  const [version, setVersion] = useState('1.0')
  const [inhalt, setInhalt] = useState('')
  const [pflicht, setPflicht] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleCreate() {
    setErr(null)
    if (!typ.trim() || !titel.trim() || !version.trim() || !inhalt.trim()) {
      setErr('Alle Felder ausfuellen')
      return
    }
    setSaving(true)
    const r = await createVertragsvorlage({
      typ: typ.trim(),
      titel: titel.trim(),
      version: version.trim(),
      inhalt_html: inhalt,
      pflicht_unterschrift: pflicht,
    })
    setSaving(false)
    if (!r.success) { setErr(r.error ?? 'Fehler'); return }
    onCreated()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-claimondo-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-claimondo-navy font-semibold">Neue Vertragsvorlage</h2>
            <p className="text-claimondo-ondo text-xs mt-1">Wird inaktiv angelegt — Aktivieren in der Liste.</p>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Typ (slug)" value={typ} onChange={setTyp} placeholder="z.B. nutzungsbedingungen" />
              <Field label="Titel" value={titel} onChange={setTitel} placeholder="z.B. Nutzungsbedingungen" />
              <Field label="Version" value={version} onChange={setVersion} placeholder="z.B. 1.0" />
            </div>
            <div>
              <label className="text-xs text-claimondo-ondo mb-1.5 block">Inhalt (HTML)</label>
              <textarea
                value={inhalt}
                onChange={e => setInhalt(e.target.value)}
                rows={16}
                placeholder="<p>Vertragstext...</p>"
                className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-xl px-3 py-2.5 text-sm font-mono text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-claimondo-navy cursor-pointer">
              <input
                type="checkbox"
                checked={pflicht}
                onChange={e => setPflicht(e.target.checked)}
                className="rounded border-claimondo-border"
              />
              Pflicht-Unterschrift erforderlich
            </label>
            {err && <p className="text-red-600 text-sm">{err}</p>}
          </div>
          <div className="px-5 py-4 border-t border-claimondo-border flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-claimondo-border text-claimondo-ondo text-sm hover:bg-[#f8f9fb]">
              Abbrechen
            </button>
            <LoadingButton
              onClick={handleCreate}
              isLoading={saving}
              loadingText="Wird erstellt..."
              className="px-4 py-2 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium disabled:opacity-40"
            >
              Erstellen
            </LoadingButton>
          </div>
        </div>
      </div>
    </>
  )
}

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-claimondo-ondo mb-1.5 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
    </div>
  )
}
