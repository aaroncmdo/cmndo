'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { SelectField } from '@/components/shared/forms/SelectField'
import type { ContentScript } from '@/lib/marketing/schema'
import { speichereSkript, freigebenUndRendern, regeneriereSkript } from './actions'

// Editor-Formmodell: Listen (hashtags/queries/tags) als Komma-Strings, damit das Tippen
// nicht bei jedem Zeichen an Array-Grenzen zerfaellt. toScript() baut daraus den ContentScript;
// die Server-Action validiert final via ContentScriptSchema.
type SegForm = {
  text: string
  on_screen_text: string
  typ: 'stock' | 'marke' | 'grafik'
  queriesStr: string
  tagsStr: string
}
type Form = {
  hook: string
  caption: string
  hashtagsStr: string
  musik_stimmung: string
  disclaimer: string
  segmente: SegForm[]
}

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

function fromScript(s: ContentScript): Form {
  return {
    hook: s.hook,
    caption: s.caption,
    hashtagsStr: s.hashtags.join(', '),
    musik_stimmung: s.musik_stimmung ?? '',
    disclaimer: s.disclaimer ?? '',
    segmente: s.segmente.map((seg) => ({
      text: seg.text,
      on_screen_text: seg.on_screen_text ?? '',
      typ: seg.visual.typ,
      queriesStr: (seg.visual.queries ?? []).join(', '),
      tagsStr: (seg.visual.tags ?? []).join(', '),
    })),
  }
}

function toScript(f: Form): unknown {
  return {
    hook: f.hook.trim(),
    caption: f.caption.trim(),
    hashtags: splitList(f.hashtagsStr),
    ...(f.musik_stimmung ? { musik_stimmung: f.musik_stimmung } : {}),
    ...(f.disclaimer.trim() ? { disclaimer: f.disclaimer.trim() } : {}),
    segmente: f.segmente.map((s) => ({
      text: s.text.trim(),
      ...(s.on_screen_text.trim() ? { on_screen_text: s.on_screen_text.trim() } : {}),
      visual: {
        typ: s.typ,
        ...(s.typ === 'stock' ? { queries: splitList(s.queriesStr) } : {}),
        ...(s.typ === 'marke' ? { tags: splitList(s.tagsStr) } : {}),
      },
    })),
  }
}

function Area({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-claimondo-shield">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30"
      />
    </label>
  )
}

const MOOD_OPTIONS = [
  { value: '', label: '— keine —' },
  { value: 'ruhig', label: 'Ruhig / informativ' },
  { value: 'dringlich', label: 'Dringlich / Warnung' },
  { value: 'aufbauend', label: 'Aufbauend / Lösung' },
  { value: 'serioes', label: 'Seriös / sachlich' },
]
const TYP_OPTIONS = [
  { value: 'stock', label: 'Stock-Video (Pexels)' },
  { value: 'marke', label: 'Marken-Grafik' },
  { value: 'grafik', label: 'Generische Grafik' },
]

export function ScriptEditor({ jobId, skript }: { jobId: string; skript: ContentScript }) {
  const router = useRouter()
  const [form, setForm] = useState<Form>(() => fromScript(skript))
  const [busy, setBusy] = useState<null | 'save' | 'render' | 'regen'>(null)
  const [error, setError] = useState<string | null>(null)

  const setSeg = (i: number, patch: Partial<SegForm>) =>
    setForm((f) => ({ ...f, segmente: f.segmente.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const addSeg = () =>
    setForm((f) => ({
      ...f,
      segmente: [...f.segmente, { text: '', on_screen_text: '', typ: 'stock', queriesStr: '', tagsStr: '' }],
    }))
  const removeSeg = (i: number) =>
    setForm((f) => ({ ...f, segmente: f.segmente.filter((_, j) => j !== i) }))

  async function persist(): Promise<boolean> {
    const r = await speichereSkript(jobId, toScript(form))
    if (!r.ok) {
      setError(r.error ?? 'Speichern fehlgeschlagen.')
      return false
    }
    return true
  }

  function save() {
    setError(null)
    setBusy('save')
    void persist().then((ok) => {
      setBusy(null)
      if (ok) router.refresh()
    })
  }

  function freigeben() {
    setError(null)
    setBusy('render')
    void persist().then(async (ok) => {
      if (!ok) {
        setBusy(null)
        return
      }
      const r = await freigebenUndRendern(jobId)
      setBusy(null)
      if (!r.ok) setError(r.error ?? 'Freigabe fehlgeschlagen.')
      else router.refresh()
    })
  }

  function regen() {
    setError(null)
    setBusy('regen')
    void regeneriereSkript(jobId).then((r) => {
      setBusy(null)
      if (!r.ok) setError(r.error ?? 'Neu-Generierung fehlgeschlagen.')
      else router.refresh()
    })
  }

  const anyBusy = busy !== null

  return (
    <div className="space-y-4">
      <TextField
        label="Hook (1. Segment — Scroll-Stopper, wird zuerst gesprochen)"
        value={form.hook}
        onChange={(e) => setForm((f) => ({ ...f, hook: e.target.value }))}
      />

      <div className="space-y-3">
        {form.segmente.map((s, i) => (
          <div key={i} className="rounded-ios-md border border-claimondo-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-body-xs font-semibold text-claimondo-ondo">Segment {i + 1}</span>
              <Button variant="bare" onClick={() => removeSeg(i)} disabled={anyBusy || form.segmente.length <= 1}>
                Entfernen
              </Button>
            </div>
            <div className="space-y-2">
              <Area label="Gesprochener Text (Voiceover)" value={s.text} onChange={(v) => setSeg(i, { text: v })} />
              <TextField
                label="Overlay-Text (max 5 Wörter)"
                value={s.on_screen_text}
                onChange={(e) => setSeg(i, { on_screen_text: e.target.value })}
              />
              <SelectField
                label="Visual"
                value={s.typ}
                onChange={(e) => setSeg(i, { typ: e.target.value as SegForm['typ'] })}
                options={TYP_OPTIONS}
              />
              {s.typ === 'stock' ? (
                <TextField
                  label="Pexels-Suchbegriffe (englisch, Komma-getrennt)"
                  value={s.queriesStr}
                  onChange={(e) => setSeg(i, { queriesStr: e.target.value })}
                />
              ) : null}
              {s.typ === 'marke' ? (
                <TextField
                  label="Marken-Tags (Komma-getrennt)"
                  value={s.tagsStr}
                  onChange={(e) => setSeg(i, { tagsStr: e.target.value })}
                />
              ) : null}
            </div>
          </div>
        ))}
        <Button variant="bare" onClick={addSeg} disabled={anyBusy}>
          + Segment hinzufügen
        </Button>
      </div>

      <Area label="Caption (Post-Text)" value={form.caption} onChange={(v) => setForm((f) => ({ ...f, caption: v }))} rows={3} />
      <TextField
        label="Hashtags (Komma-getrennt, ohne #)"
        value={form.hashtagsStr}
        onChange={(e) => setForm((f) => ({ ...f, hashtagsStr: e.target.value }))}
      />
      <SelectField
        label="Musik-Stimmung (Hintergrund-Bett)"
        value={form.musik_stimmung}
        onChange={(e) => setForm((f) => ({ ...f, musik_stimmung: e.target.value }))}
        options={MOOD_OPTIONS}
      />

      {error ? <p className="text-body-sm text-danger-strong">{error}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="navy" onClick={freigeben} loading={busy === 'render'} disabled={anyBusy}>
          Freigeben &amp; Rendern
        </Button>
        <Button variant="ondo" onClick={save} loading={busy === 'save'} disabled={anyBusy}>
          Speichern
        </Button>
        <Button variant="ghost" onClick={regen} loading={busy === 'regen'} disabled={anyBusy}>
          Neues Skript generieren
        </Button>
      </div>
    </div>
  )
}
