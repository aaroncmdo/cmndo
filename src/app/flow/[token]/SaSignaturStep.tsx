'use client'

// SaSignaturStep — der SA-Signatur-Block, extrahiert aus FlowWizardKfz (Approach C).
// REINER VERHALTENS-ERHALTENDER REFACTOR: identisches Verhalten wie der frühere
// `currentStep.id === 'sa'`-Signatur-Sub-Block (Volltext-Modal + Unterschrift-Canvas +
// AGB-Checkbox + optionales SV-Consent-Häkchen + Sign-Button).
//
// Wird in ZWEI Kontexten genutzt:
//  1. FlowWizardKfz (Flow-Step 'sa', nach der service_typ-Auswahl) — mit gutachterAnzeige
//     (SV-Consent-Häkchen) + onSubmittingChange (sperrt das service_typ-Feld während Submit).
//  2. WerkstattIntakeSignatur (Signatur-only-Fläche) — gutachterAnzeige={null}, kein
//     onSubmittingChange (kein Feld-Lock nötig).

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { FileTextIcon, XIcon, Trash2Icon } from 'lucide-react'
import LegalDocPopover from '@/components/legal/LegalDocPopover'
import { signSAandCreateFall, generateSAPdf } from './actions'
import { uploadFlowSignatur } from '@/lib/actions/unterschrift-upload'
import type { GutachterInfo } from './FlowWizardKfz'

interface SaSignaturStepProps {
  token: string
  leadId: string
  flowLinkId: string | null
  // Optional: nur im Flow-Kontext gesetzt (SV zugewiesen) → SV-Consent-Häkchen.
  // Im Werkstatt-Intake: undefined/null → kein SV-Consent.
  gutachterAnzeige?: GutachterInfo | null
  // Derselbe (narrow) Type wie FlowWizardKfz' legalDocs-Prop — NICHT
  // ReturnType<typeof getAllLegalDocs> (das zieht `server-only` in den Client-Bundle).
  legalDocs?: {
    datenschutz?: { titel: string; markdown: string }
    agb?: { titel: string; markdown: string }
  }
  // Aufgerufen nach erfolgreichem signSAandCreateFall. Der Consumer entscheidet,
  // was danach passiert (Flow: Step → 'account'; Intake: Account + Erfolg).
  onSigned: (fallId: string) => void
  // OPTIONAL: spiegelt den submittingSA-State nach außen, damit der Flow-Consumer
  // das service_typ-Feld während des SA-Submits sperren kann (Parität zu Z.847).
  // WerkstattIntakeSignatur hat kein Feld-Lock → lässt den Callback weg.
  onSubmittingChange?: (submitting: boolean) => void
}

export default function SaSignaturStep({
  token,
  leadId,
  flowLinkId,
  gutachterAnzeige,
  legalDocs,
  onSigned,
  onSubmittingChange,
}: SaSignaturStepProps) {
  const t = useTranslations('flow')

  // SV-Schritt: Akzeptanz Widerrufsbelehrung + Datenschutz des SVs (Pflicht bevor
  // signiert werden kann). Nur relevant wenn ein SV zugewiesen ist (gutachterAnzeige).
  const [svRechtsakzeptanz, setSvRechtsakzeptanz] = useState(false)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [saAccepted, setSaAccepted] = useState(false)
  const [saVolltextOffen, setSaVolltextOffen] = useState(false)
  const [submittingSA, setSubmittingSA] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A11y: Ref auf den SA-Volltext-Modal-Container fuer den Focus-Trap.
  const saModalRef = useRef<HTMLDivElement>(null)

  // A11y: SA-Volltext-Modal — Esc-schliessen, Focus-Trap (Tab-Wrap) + Focus-Restore
  // beim Schliessen. Backdrop-Klick-schliessen existiert separat im JSX.
  useEffect(() => {
    if (!saVolltextOffen) return
    const prevFocus = document.activeElement as HTMLElement | null
    const focusables = () =>
      saModalRef.current
        ? Array.from(
            saModalRef.current.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute('disabled'))
        : []
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSaVolltextOffen(false); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocus?.focus?.()
    }
  }, [saVolltextOffen])

  // ─── SA unterzeichnen + Fall erstellen ─────────────────────────────────────

  async function handleSignSA() {
    if (!signatureBlob) return
    // Slice 2-write-3: FENCE (Defense-in-Depth) — die Fall-Erstellung ist online-only.
    // Fängt die useOnlineStatus-Debounce-Race (Gate zeigt evtl. noch das Formular) und
    // schützt den geteilten Werkstatt-Intake-Kontext (kein Render-Gate).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Die Beauftragung benötigt eine Internetverbindung. Bitte verbinde dich und versuche es erneut.')
      return
    }
    setSubmittingSA(true)
    onSubmittingChange?.(true)
    setError(null)
    try {
      // 1. Unterschrift als PNG → DataURL → Server-Action mit service_role
      //    (Batch 4: Anon-Write auf `unterschriften` fällt mit Schritt D)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Bild-Encoding fehlgeschlagen'))
        reader.readAsDataURL(signatureBlob)
      })
      const uploadRes = await uploadFlowSignatur(token, dataUrl)
      if (!uploadRes.ok) throw new Error(uploadRes.error)
      const publicUrl = uploadRes.url

      // 2. Server Action: Fall erstellen
      // AAR-360 Follow-up: SV-Datenschutz/Widerruf-Zustimmung (nur relevant wenn ein SV zugewiesen ist).
      const result = await signSAandCreateFall(leadId, publicUrl, flowLinkId ?? null, gutachterAnzeige ? svRechtsakzeptanz : false, token)
      if (!result.ok) throw new Error(result.error ?? 'Fehler bei der Beauftragung')
      onSigned(result.fallId)

      // 3. SA-PDF generieren (Background, non-blocking)
      // Bewusst ohne Nutzer-Fehlermeldung — die Beauftragung ist an dieser Stelle durch.
      // Der Fehler wird aber nicht mehr verschluckt: die Server-Action loggt ihre Writes
      // selbst, hier bleibt der Aufruf-Fehler sichtbar.
      generateSAPdf(result.fallId, leadId, publicUrl, token).catch((err: unknown) =>
        console.error('[SaSignaturStep] SA-PDF-Erzeugung fehlgeschlagen:', err),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t('step_sa.error_fallback'))
    } finally {
      setSubmittingSA(false)
      onSubmittingChange?.(false)
    }
  }

  return (
    <>
      {/* SA-Volltext-Popover */}
      {saVolltextOffen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSaVolltextOffen(false)} />
          <div ref={saModalRef} role="dialog" aria-modal="true" aria-labelledby="sa-volltext-title" className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-ios-md shadow-claimondo-lg flex flex-col max-h-[90dvh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-claimondo-border flex-shrink-0">
              <h2 id="sa-volltext-title" className="text-sm font-semibold text-claimondo-navy">{t('step_sa.popover_titel')}</h2>
              <button type="button" aria-label="Schließen" onClick={() => setSaVolltextOffen(false)} className="p-1.5 rounded-ios-sm hover:bg-claimondo-bg">
                <XIcon className="w-4 h-4 text-claimondo-ondo" />
              </button>
            </div>
            {/* Scrollbarer Text */}
            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-claimondo-navy space-y-4 leading-relaxed">
              <h3 className="font-semibold">{t('step_sa.volltext.s1_titel')}</h3>
              <p>{t.rich('step_sa.volltext.s1_text', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>{t('step_sa.volltext.s1_li1')}</li>
                <li>{t('step_sa.volltext.s1_li2')}</li>
                <li>{t('step_sa.volltext.s1_li3')}</li>
                <li>{t('step_sa.volltext.s1_li4')}</li>
              </ul>
              <h3 className="font-semibold">{t('step_sa.volltext.s2_titel')}</h3>
              <p>{t.rich('step_sa.volltext.s2_text', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
              <h3 className="font-semibold">{t('step_sa.volltext.s3_titel')}</h3>
              <p>{t('step_sa.volltext.s3_intro')}</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>{t('step_sa.volltext.s3_li1')}</li>
                <li>{t('step_sa.volltext.s3_li2')}</li>
                <li>{t('step_sa.volltext.s3_li3')}</li>
                <li>{t('step_sa.volltext.s3_li4')}</li>
              </ul>
              <h3 className="font-semibold">{t('step_sa.volltext.s4_titel')}</h3>
              <p>{t('step_sa.volltext.s4_text')}</p>
              <h3 className="font-semibold">{t('step_sa.volltext.s5_titel')}</h3>
              <p>{t('step_sa.volltext.s5_text')}</p>
              <p className="text-xs text-claimondo-ondo pt-2 border-t border-claimondo-border">{t('step_sa.volltext.footer_note')}</p>
            </div>
            {/* Footer */}
            <div className="px-5 py-4 border-t border-claimondo-border flex-shrink-0">
              <button
                type="button"
                onClick={() => { setSaAccepted(true); setSaVolltextOffen(false) }}
                className="w-full py-3.5 rounded-ios-md bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm transition-all active:scale-[0.98]"
              >
                {t('step_sa.volltext.cta_accept')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Volltext-Link */}
      <button
        type="button"
        onClick={() => setSaVolltextOffen(true)}
        className="flex items-center gap-2 text-sm text-claimondo-ondo hover:underline mb-5"
      >
        <FileTextIcon className="w-4 h-4" />
        {t('step_sa.volltext_link')}
      </button>

      {/* Unterschrifts-Canvas */}
      <div className="mb-4">
        <p className="text-xs text-claimondo-ondo uppercase tracking-wider mb-2">{t('step_sa.unterschrift_label')}</p>
        <SignatureCanvas
          onSignature={setSignatureBlob}
          placeholder={t('step_sa.unterschrift_placeholder')}
          clearLabel={t('step_sa.unterschrift_loeschen')}
        />
      </div>

      {/* Checkbox */}
      <label className="flex items-start gap-3 cursor-pointer mb-5">
        <input
          type="checkbox"
          checked={saAccepted}
          onChange={e => setSaAccepted(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded border-claimondo-border accent-claimondo-ondo shrink-0"
        />
        <span className="text-sm text-claimondo-ondo leading-relaxed">
          {t('step_sa.checkbox_text')}{' '}
          <LegalDocPopover titel={legalDocs?.agb?.titel ?? 'AGB'} markdown={legalDocs?.agb?.markdown ?? ''}>
            {t('step_sa.agb_link')}
          </LegalDocPopover>{' '}
          {t('step_sa.widerruf_link')} <span className="text-danger">*</span>
        </span>
      </label>

      {/* AAR-360 Follow-up: separates Pflicht-Häkchen für Datenschutz + Widerrufsbelehrung
          des zugewiesenen Gutachters (entkoppelt von der SA-Signatur). Nur wenn ein SV
          zugewiesen ist. Datenschutz/Widerruf des SV als Links (falls hochgeladen). */}
      {gutachterAnzeige && (
        <label className="flex items-start gap-3 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={svRechtsakzeptanz}
            onChange={e => setSvRechtsakzeptanz(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-claimondo-border accent-claimondo-ondo shrink-0"
          />
          <span className="text-sm text-claimondo-ondo leading-relaxed">
            {t('step_sa.sv_consent_text', { firma: gutachterAnzeige.firma ?? gutachterAnzeige.vorname })}
            <span className="text-danger"> *</span>
            {(gutachterAnzeige.datenschutzUrl || gutachterAnzeige.widerrufUrl) && (
              <span className="block text-xs mt-1">
                {gutachterAnzeige.datenschutzUrl && (
                  <a href={gutachterAnzeige.datenschutzUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-claimondo-navy">
                    {t('step_sa.sv_consent_datenschutz_link')}
                  </a>
                )}
                {gutachterAnzeige.datenschutzUrl && gutachterAnzeige.widerrufUrl && ' · '}
                {gutachterAnzeige.widerrufUrl && (
                  <a href={gutachterAnzeige.widerrufUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-claimondo-navy">
                    {t('step_sa.sv_consent_widerruf_link')}
                  </a>
                )}
              </span>
            )}
          </span>
        </label>
      )}

      {error && <p className="text-sm text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-md px-4 py-3 mb-4">{error}</p>}

      <button
        onClick={handleSignSA}
        disabled={!signatureBlob || !saAccepted || (!!gutachterAnzeige && !svRechtsakzeptanz) || submittingSA}
        className="w-full inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0 transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
      >
        {submittingSA ? t('step_sa.submitting') : t('step_sa.cta_sign')}
      </button>
    </>
  )
}

// ─── Signature Canvas (using signature_pad library) ──────────────────────────

function SignatureCanvas({ onSignature, placeholder, clearLabel }: { onSignature: (blob: Blob | null) => void; placeholder?: string; clearLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const padRef = useRef<any>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pad: any = null
    import('signature_pad').then(({ default: SignaturePad }) => {
      if (!canvasRef.current) return
      const canvas = canvasRef.current
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)

      pad = new SignaturePad(canvas, {
        penColor: '#1E3A5F',
        minWidth: 1.5,
        maxWidth: 3,
        backgroundColor: 'rgb(255, 255, 255)',
      })
      pad.addEventListener('endStroke', () => {
        setIsEmpty(pad.isEmpty())
        if (!pad.isEmpty()) {
          canvas.toBlob(blob => onSignature(blob), 'image/png')
        }
      })
      padRef.current = pad
    })

    return () => { if (pad) pad.off() }
  }, [])

  function clearSignature() {
    padRef.current?.clear()
    setIsEmpty(true)
    onSignature(null)
  }

  return (
    <div>
      <div className="relative border-2 border-claimondo-border rounded-ios-md overflow-hidden bg-white">
        <canvas ref={canvasRef} className="w-full h-44 touch-none" />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-claimondo-ondo/50 text-sm">{placeholder ?? 'Hier unterschreiben'}</p>
          </div>
        )}
      </div>
      {!isEmpty && (
        <button onClick={clearSignature} className="mt-2 text-xs text-claimondo-ondo hover:text-claimondo-navy flex items-center gap-1">
          <Trash2Icon className="w-3 h-3" /> {clearLabel ?? 'Unterschrift löschen'}
        </button>
      )}
    </div>
  )
}
