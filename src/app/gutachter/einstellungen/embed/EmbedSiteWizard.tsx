'use client'

// AAR-939 · Monika-Embed · Stream 6 — Embed-Site-Wizard (3 Steps).
// Blaupause: admin/sachverstaendige/anlegen/BueroAnlegenWizard (STEPS + fieldErrors-Set
// statt silent-disabled). Gating: A = Branding disabled + kein Q7; B = Branding aktiv + Q7 Pflicht.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, Card, Badge } from '@/components/primitives'
import { TextField } from '@/components/shared/forms'
import { SectionCard } from '@/components/shared/SectionCard'
import EmbedSnippets from './EmbedSnippets'
import { Checkbox } from '@/components/ui/checkbox'
import {
  type EmbedSiteFormData,
  MONIKA_AGB_VERSION,
  CLAIMONDO_FLAT_THEME,
  slugify,
  validateBasis,
  validateVariante,
  validateTracking,
} from '@/lib/embed/site-write'
import { createEmbedSite, updateEmbedSite, sendTestTrackingWebhook } from './actions'
import DomainListInput from './DomainListInput'
import ThemePreview from './ThemePreview'
import { TrackingAnleitungContent } from './TrackingAnleitungContent'

const STEPS = ['Basis & Domains', 'Variante & Branding', 'Tracking', 'Zusammenfassung'] as const

type SvBrand = { brand_primary: string | null; brand_accent: string | null } | null

export default function EmbedSiteWizard({
  mode,
  siteId,
  initial,
  svBrand,
  defaultLogo,
  trackingMeta,
  svVerifiziert = false,
}: {
  mode: 'create' | 'edit'
  siteId?: string
  initial: EmbedSiteFormData
  svBrand: SvBrand
  defaultLogo: string
  trackingMeta?: {
    hasSecret: boolean
    lastStatus: string | null
    lastAt: string | null
    lastError: string | null
  }
  svVerifiziert?: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<EmbedSiteFormData>(initial)
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  function patch(p: Partial<EmbedSiteFormData>) {
    setForm((f) => ({ ...f, ...p }))
  }
  function err(field: string) {
    return fieldErrors.has(field) ? 'Pflichtfeld' : undefined
  }

  function next() {
    if (step === 0) {
      const f = validateBasis(form)
      setFieldErrors(f)
      if (f.size > 0) return
    }
    if (step === 1) {
      const f = validateVariante(form)
      setFieldErrors(f)
      if (f.size > 0) {
        setError(form.variante === 'B' ? 'Bitte die Kooperations-AGB akzeptieren.' : null)
        return
      }
    }
    if (step === 2) {
      const f = validateTracking(form)
      setFieldErrors(f)
      if (f.size > 0) {
        setError('Webhook-URL muss mit https:// beginnen.')
        return
      }
    }
    setError(null)
    setFieldErrors(new Set())
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function submit() {
    setSaving(true)
    setError(null)
    const res = mode === 'edit' && siteId ? await updateEmbedSite(siteId, form) : await createEmbedSite(form)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Fehler')
      return
    }
    if (mode === 'edit') {
      toast.success('Site gespeichert')
      router.push('/gutachter/einstellungen/embed')
      router.refresh()
      return
    }
    setCreatedSlug(form.slug.trim().toLowerCase())
    toast.success('Embed-Site angelegt')
  }

  async function runTest() {
    if (!siteId) return
    setTesting(true)
    const res = await sendTestTrackingWebhook(siteId)
    setTesting(false)
    if (res.ok) toast.success(`Test gesendet — HTTP ${res.status ?? 200}`)
    else toast.error(res.error ?? 'Test fehlgeschlagen')
  }

  // ── Erfolgs-Snippets nach Anlegen ─────────────────────────────────────────
  if (createdSlug) {
    return (
      <div className="space-y-4">
        <EmbedSnippets slug={createdSlug} />
        <Button variant="ghost" onClick={() => router.push('/gutachter/einstellungen/embed')}>
          Zu meinen Sites
        </Button>
      </div>
    )
  }

  const isB = form.variante === 'B'

  return (
    <div className="space-y-4">
      {/* Step-Indikator (inline, wie BueroAnlegenWizard) */}
      <div className="flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
                i === step
                  ? 'bg-claimondo-navy text-white'
                  : i < step
                    ? 'bg-claimondo-ondo text-white'
                    : 'bg-claimondo-bg text-claimondo-ondo border border-claimondo-border'
              }`}
            >
              {i + 1}
            </span>
            <span className={i === step ? 'text-claimondo-navy font-medium' : 'text-claimondo-ondo'}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-claimondo-border mx-1">→</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-ios-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger-strong">{error}</div>
      )}

      {/* STEP 0 — Basis & Domains */}
      {step === 0 && (
        <SectionCard title="Site-Details" bodyClassName="space-y-4">
          <TextField
            label="Name der Site"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value, slug: form.slug || slugify(e.target.value) })}
            error={err('name')}
            placeholder="z. B. Kanzlei Müller"
            required
          />
          <TextField
            label="Slug (Site-ID)"
            value={form.slug}
            onChange={(e) => patch({ slug: e.target.value })}
            error={err('slug')}
            hint="Erscheint im Snippet als data-site-id. Nur a–z, 0–9, Bindestrich."
            placeholder="kanzlei-mueller"
            required
          />
          <DomainListInput
            value={form.erlaubte_domains}
            onChange={(v) => patch({ erlaubte_domains: v })}
            error={err('erlaubte_domains')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Empfänger-Email"
              value={form.empfaenger_email}
              onChange={(e) => patch({ empfaenger_email: e.target.value })}
              error={err('empfaenger_email')}
              type="email"
              required
            />
            <TextField
              label="CC-Email (optional)"
              value={form.cc_email}
              onChange={(e) => patch({ cc_email: e.target.value })}
              error={err('cc_email')}
              type="email"
            />
          </div>
        </SectionCard>
      )}

      {/* STEP 1 — Variante & Branding */}
      {step === 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Variante" bodyClassName="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card
                onPress={() => patch({ variante: 'A' })}
                className={`cursor-pointer ${!isB ? 'ring-2 ring-claimondo-navy' : ''}`}
              >
                <p className="font-semibold text-claimondo-navy">Variante A</p>
                <p className="text-xs text-claimondo-ondo mt-1">Kostenlos. Claimondo-Standard-Theme.</p>
              </Card>
              <Card
                onPress={() => svVerifiziert && patch({ variante: 'B' })}
                className={`${svVerifiziert ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${isB ? 'ring-2 ring-claimondo-ondo' : ''}`}
              >
                <p className="font-semibold text-claimondo-navy">
                  Variante B <Badge tone="ondo">70 € / Termin</Badge>
                </p>
                <p className="text-xs text-claimondo-ondo mt-1">Eigenes Theme + Dispatch-Qualifizierung.</p>
                {!svVerifiziert && (
                  <p className="text-xs font-medium text-warning-strong mt-1.5">
                    Erst nach deiner Verifizierung durch Claimondo freigeschaltet.
                  </p>
                )}
              </Card>
            </div>

            {!isB && (
              <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-4 py-3 text-xs text-claimondo-ondo">
                Mit <strong>Variante B</strong> brandest du dein Widget mit deinem eigenen Theme und Logo.
              </div>
            )}

            {isB && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    label="Primärfarbe"
                    type="color"
                    value={form.brand_primary_override || svBrand?.brand_primary || CLAIMONDO_FLAT_THEME.primary}
                    onChange={(e) => patch({ brand_primary_override: e.target.value })}
                  />
                  <TextField
                    label="Akzentfarbe"
                    type="color"
                    value={form.brand_accent_override || svBrand?.brand_accent || CLAIMONDO_FLAT_THEME.accent}
                    onChange={(e) => patch({ brand_accent_override: e.target.value })}
                  />
                  <TextField
                    label="Textfarbe"
                    type="color"
                    value={form.brand_secondary_override || CLAIMONDO_FLAT_THEME.text}
                    onChange={(e) => patch({ brand_secondary_override: e.target.value })}
                  />
                </div>
                <TextField
                  label="Logo-URL (optional)"
                  value={form.brand_logo_url_override}
                  onChange={(e) => patch({ brand_logo_url_override: e.target.value })}
                  hint="Direkte URL zu deinem Logo (SVG/PNG). Leer = Claimondo-Logo."
                  placeholder="https://…/logo.svg"
                />

                {/* Q7-Consent */}
                <label className="flex items-start gap-2 text-sm text-claimondo-navy cursor-pointer">
                  <Checkbox
                    checked={form.agb_akzeptiert}
                    onCheckedChange={(c) => patch({ agb_akzeptiert: c === true })}
                  />
                  <span className={fieldErrors.has('agb_akzeptiert') ? 'text-danger-strong' : ''}>
                    Ich akzeptiere die Kooperations-AGB ({MONIKA_AGB_VERSION}) — 70 € pro vereinbartem Termin.
                  </span>
                </label>
              </div>
            )}
          </SectionCard>

          <ThemePreview form={form} svBrand={svBrand} defaultLogo={defaultLogo} />
        </div>
      )}

      {/* STEP 2 — Tracking (optional) */}
      {step === 2 && (
        <SectionCard title="Tracking & Conversions (optional)" bodyClassName="space-y-4">
          <p className="text-sm text-claimondo-ondo">
            Verbinde Monika mit deinem GA4 / Google Ads. <strong>Direkt</strong> (empfohlen): trag unten deine
            GA4-Measurement-ID bzw. Google-Ads Conversion-ID + Label ein — Monika feuert die Conversion bei
            erfolgreicher Anfrage direkt in dein Konto, ohne weiteres Setup. <strong>Oder per Webhook</strong>{' '}
            für eigene Pipelines (Make/Zapier): HMAC-signiert bei Anfrage, vereinbartem und durchgeführtem Termin.
            Pro Kanal nur einen Weg nutzen, sonst zählt die Conversion doppelt.
          </p>
          <TextField
            label="Webhook-URL (optional)"
            value={form.tracking_webhook_url}
            onChange={(e) => patch({ tracking_webhook_url: e.target.value })}
            error={fieldErrors.has('tracking_webhook_url') ? 'Muss mit https:// beginnen' : undefined}
            hint="Make.com / Zapier / n8n / eigener Endpoint."
            placeholder="https://hook.make.com/…"
          />
          <TextField
            label="GA4 Measurement-ID (optional)"
            value={form.tracking_ga4_measurement_id}
            onChange={(e) => patch({ tracking_ga4_measurement_id: e.target.value })}
            hint="Für client-seitiges Tracking. Format G-XXXXXXX."
            placeholder="G-XXXXXXX"
          />
          <TextField
            label="Google-Ads Conversion-ID (optional)"
            value={form.tracking_gads_conversion_id}
            onChange={(e) => patch({ tracking_gads_conversion_id: e.target.value })}
            hint="Aus Google Ads → Conversions → dein Conversion-Snippet. Format AW-XXXXXXXXX."
            placeholder="AW-XXXXXXXXX"
          />
          <TextField
            label="Google-Ads Conversion-Label (optional)"
            value={form.tracking_gads_conversion_label}
            onChange={(e) => patch({ tracking_gads_conversion_label: e.target.value })}
            hint="Das Label aus demselben Snippet (send_to = Conversion-ID/Label)."
            placeholder="AbC-D_efGhIjK"
          />

          {mode === 'edit' && trackingMeta ? (
            <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-4 py-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-claimondo-ondo">Signatur-Secret</span>
                <span className="text-claimondo-navy">
                  {trackingMeta.hasSecret ? 'gesetzt' : 'wird beim Speichern erzeugt'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-claimondo-ondo">Letzter Send</span>
                <TrackingStatus status={trackingMeta.lastStatus} at={trackingMeta.lastAt} error={trackingMeta.lastError} />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="navy"
                  size="sm"
                  loading={testing}
                  disabled={!form.tracking_webhook_url.trim()}
                  onClick={runTest}
                >
                  Test-Webhook senden
                </Button>
              </div>
              {/* W1.2: Anleitung in-place statt Routen-Absprung (alte Route -> 308 auf den Editor). */}
              <details className="pt-2">
                <summary className="cursor-pointer text-sm text-claimondo-ondo hover:text-claimondo-navy underline underline-offset-2">
                  Einrichtungs-Anleitung (GA4, Google Ads, Webhook)
                </summary>
                <div className="pt-3">
                  <TrackingAnleitungContent
                    slug={form.slug}
                    ga4={form.tracking_ga4_measurement_id.trim() || 'G-XXXXXXX'}
                  />
                </div>
              </details>
            </div>
          ) : (
            <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-4 py-3 text-xs text-claimondo-ondo">
              Signatur-Secret, Test-Button und Anleitung sind nach dem Anlegen der Site verfügbar.
            </div>
          )}
        </SectionCard>
      )}

      {/* STEP 3 — Zusammenfassung */}
      {step === 3 && (
        <SectionCard title="Zusammenfassung" bodyClassName="space-y-2 text-sm">
          <Row label="Name" value={form.name} />
          <Row label="Slug" value={form.slug} />
          <Row label="Variante" value={isB ? 'B (70 € / Termin)' : 'A (kostenlos)'} />
          <Row label="Domains" value={form.erlaubte_domains.join(', ') || '—'} />
          <Row label="Empfänger" value={form.empfaenger_email} />
          {form.cc_email && <Row label="CC" value={form.cc_email} />}
          {form.tracking_webhook_url && <Row label="Tracking-Webhook" value={form.tracking_webhook_url} />}
        </SectionCard>
      )}

      {/* Navigation.
          lg:pr-16 haelt den Primaer-Button aus der Zone des globalen Posteingang-FABs
          (GlobalPosteingangFab: fixed right-4 bottom-4, 48px -> belegt die rechten 64px,
          nur lg+ sichtbar). Prod-Smoke 11.08. bei 1280x720: "Weiter" lag exakt darunter
          und war nicht klickbar (elementFromPoint traf den FAB) — der SV konnte sein
          Widget nicht anlegen. Gleiche Bug-Klasse wie der ZB1-Footer-Befund 16.07. */}
      <div className="flex justify-between lg:pr-16">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
          Zurück
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="navy" onClick={next}>
            Weiter
          </Button>
        ) : (
          <Button variant="navy" loading={saving} onClick={submit}>
            {mode === 'edit' ? 'Speichern' : 'Site anlegen'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-claimondo-border/60 py-1.5 last:border-0">
      <span className="text-claimondo-ondo">{label}</span>
      <span className="text-claimondo-navy font-medium text-right">{value}</span>
    </div>
  )
}

function TrackingStatus({ status, at, error }: { status: string | null; at: string | null; error: string | null }) {
  if (!status) return <span className="text-claimondo-ondo">— noch kein Send</span>
  const ok = /^2\d\d$/.test(status)
  const when = at ? new Date(at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
  return (
    <span className={ok ? 'text-success' : 'text-danger'}>
      {ok ? '✓' : '✗'} {status}
      {when ? ` · ${when}` : ''}
      {!ok && error ? ` · ${error}` : ''}
    </span>
  )
}
