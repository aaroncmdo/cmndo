// P1/P3 (Kunde-Detail-Rebuild): StatusZone — der Status-Strang (immer sichtbar).
// „Alles erhalten, nur umbauen" (Aaron 10.07.): wrappt die reichen Bestands-Komponenten 1:1 aus
// der Live-page.tsx — Mitteilungs-Banner + Phasen-Stepper (Claim/Selbstzahler) + realtime
// SV-Live-Banner + GoogleReview + Abschluss-Card + die VS-/Klage-/Nachbesichtigung-/Rügefall-Alerts
// (als NoticeBox). Server-Component (getTranslations/getFormatter); die interaktiven/realtime
// Kinder sind 'use client'. „Live" via FallRealtimeRefresh (page.tsx).
//
// BEWUSST DEFERRED (gated Edge-Banner, Follow-up): TerminVerlegungBanner (ClaimStepper-bottomSlot)
// + KundeTerminCheckBanner — brauchen verlegung_pending- + stale-Termin/Task-Reads; im Marker notiert.

import { getTranslations, getFormatter } from 'next-intl/server'
import Link from 'next/link'
import { NoticeBox } from '@/components/shared/NoticeBox'
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import ClaimStepper from '@/components/kunde/ClaimStepper'
import SelbstzahlerReparaturStepper from '@/components/kunde/SelbstzahlerReparaturStepper'
import KundeSvLiveBanner from '@/components/kunde/KundeSvLiveBanner'
import GoogleReviewPrompt from '@/components/kunde/GoogleReviewPrompt'
import KundeAbschlussCard from '@/components/kunde/KundeAbschlussCard'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

export async function StatusZone({ vm }: { vm: KundeClaimViewModel }) {
  const t = await getTranslations('kunde.fall')
  const format = await getFormatter()
  const { fall, status, lifecycle } = vm
  const fallStatus = (fall.status as string | null) ?? ''
  const svName = vm.team.sv?.name ?? null
  const sv = status.svTermin

  // Rügefall-Ableitung (page.tsx-Logik).
  let szenario = (fall.szenario as string | null) ?? 'normalfall'
  if (fallStatus === 'klage') szenario = 'klagefall'
  else if (['vs-kuerzt', 'vs-abgelehnt', 'nachbesichtigung-laeuft'].includes(fallStatus) && szenario === 'normalfall') {
    szenario = 'ruegefall'
  }

  const terminAdresse =
    (fall.besichtigungsort_adresse as string | null) ||
    [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') ||
    null

  // ClaimStepper-terminInfo (aus dem aktiven SV-Begutachtungstermin).
  const terminInfo = sv?.start
    ? {
        terminId: sv.id,
        status: sv.status,
        datum: format.dateTime(new Date(sv.start), {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
        }),
        uhrzeit: format.dateTime(new Date(sv.start), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }),
        adresse: terminAdresse,
        svVorname: svName ? svName.split(' ')[0] : null,
        kundeVorname: status.kundeVorname,
      }
    : null

  return (
    <div className="space-y-4">
      <FallMitteilungenBanner fallId={vm.fallId} rolle="kunde" />

      {/* Phasen-Stepper — Reparatur-Route (Selbstzahler/Kasko) bekommt den reduzierten Stepper. */}
      {istWerkstattReparaturWeg(vm.flags.abrechnungsweg) ? (
        <SelbstzahlerReparaturStepper
          hatWerkstatt={vm.geld.reparaturWerkstattId != null}
          terminStatus={vm.termine.find((x) => x.art === 'reparatur')?.status ?? null}
          abgeschlossen={lifecycle.mainPhase === 'abschluss'}
        />
      ) : (
        <ClaimStepper lifecycle={lifecycle} terminInfo={terminInfo} />
      )}

      {/* Realtime SV-Live-Banner (unterwegs/da/ETA) — nur bei aktivem SV-Termin. */}
      {sv?.id && (
        <KundeSvLiveBanner
          terminId={sv.id}
          svName={svName}
          gutachtenHochgeladen={status.svLive.gutachtenHochgeladen}
          qcFreigegeben={status.svLive.qcFreigegeben}
          inUeberarbeitung={status.svLive.inUeberarbeitung}
          initial={{
            sv_unterwegs_seit: sv.svUnterwegsSeit,
            sv_angekommen_am: sv.svAngekommenAm,
            sv_eta_minuten: sv.svEtaMinuten,
            durchgefuehrt_am: sv.durchgefuehrtAm,
          }}
        />
      )}

      {/* Google-Bewertungs-Prompt — nach durchgeführtem SV-Termin, einmalig, nur mit place_id. */}
      {status.svGooglePlaceId && svName && !!sv?.durchgefuehrtAm && !status.googleReviewGezeigtAm && (
        <GoogleReviewPrompt fallId={vm.fallId} svName={svName} googlePlaceId={status.svGooglePlaceId} />
      )}

      {/* Abschluss-Aktionen — Component rendert null wenn nicht abgeschlossen. */}
      <KundeAbschlussCard
        fallId={vm.fallId}
        fallNummer={(fall.claim_nummer as string | null) ?? null}
        abgeschlossenAm={(fall.abgeschlossen_am as string | null) ?? null}
        gutachtenUrl={status.gutachtenUrl}
        googleReviewUrl={
          status.svGooglePlaceId
            ? `https://search.google.com/local/writereview?placeid=${status.svGooglePlaceId}`
            : null
        }
      />

      {/* Alert-Zustände als kanonische NoticeBox (ersetzt die inline-Alerts). */}
      {(fallStatus === 'nachbesichtigung-laeuft' || fall.nachbesichtigung_status === 'angefordert') && (
        <NoticeBox tone="warning" className="rounded-ios-xl px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-warning-strong">{t('nachbesichtigung.titel')}</p>
          <p className="text-body-xs text-warning-strong">{t('nachbesichtigung.text')}</p>
          <Link
            href={`/kunde/nachbesichtigung/${vm.fallId}`}
            className="inline-flex items-center text-body-xs font-medium rounded-ios-md border border-warning/40 text-warning-strong px-3 py-1.5 hover:bg-warning-soft transition-colors"
          >
            {t('nachbesichtigung.termineVorschlagen')}
          </Link>
        </NoticeBox>
      )}
      {fallStatus === 'vs-kuerzt' && (
        <NoticeBox tone="warning" className="rounded-ios-xl px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-warning-strong">{t('vsKuerzt.titel')}</p>
          {typeof fall.vs_kuerzung_grund === 'string' && fall.vs_kuerzung_grund && (
            <div className="rounded-ios-md bg-white/60 border border-warning/30 p-2 text-body-xs text-warning-strong">
              <strong className="block mb-0.5">{t('vsKuerzt.begruendung')}</strong>
              {fall.vs_kuerzung_grund as string}
            </div>
          )}
          <p className="text-body-xs text-warning-strong">{t('vsKuerzt.hinweis')}</p>
        </NoticeBox>
      )}
      {fallStatus === 'vs-abgelehnt' && (
        <NoticeBox tone="danger" className="rounded-ios-xl px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-danger-strong">{t('vsAbgelehnt.titel')}</p>
          <p className="text-body-xs text-danger-strong">{t('vsAbgelehnt.text')}</p>
        </NoticeBox>
      )}
      {fallStatus === 'klage' && (
        <NoticeBox tone="danger" className="rounded-ios-xl px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-danger-strong">{t('klage.titel')}</p>
          <p className="text-body-xs text-danger-strong">{t('klage.text')}</p>
        </NoticeBox>
      )}
      {szenario === 'ruegefall' && (
        <NoticeBox tone="warning" className="rounded-ios-xl px-3 py-2">
          <p className="text-body-xs text-warning-strong font-medium">{t('ruegefall.banner')}</p>
        </NoticeBox>
      )}
    </div>
  )
}
