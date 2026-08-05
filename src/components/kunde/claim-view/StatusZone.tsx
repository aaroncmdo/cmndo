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
import { ShieldCheckIcon } from 'lucide-react'
import { NoticeBox } from '@/components/shared/NoticeBox'
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import ClaimStepper from '@/components/kunde/ClaimStepper'
import SelbstzahlerReparaturStepper from '@/components/kunde/SelbstzahlerReparaturStepper'
import KundeSvLiveBanner from '@/components/kunde/KundeSvLiveBanner'
import GoogleReviewPrompt from '@/components/kunde/GoogleReviewPrompt'
import KundeAbschlussCard from '@/components/kunde/KundeAbschlussCard'
import TerminVerlegungBanner from '@/components/kunde/TerminVerlegungBanner'
import KundeTerminCheckBanner from '@/components/kunde/KundeTerminCheckBanner'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import { RegulierungsVerlaufCard } from './RegulierungsVerlaufCard'

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
  // B4-slice-1b: 'abgelehnt' ergaenzt — seit dem endzustand-Write-Flip traegt operative_status
  // die einfache Ablehnung direkt. Sie ist semantisch dasselbe wie 'vs-abgelehnt' (VS hat
  // abgelehnt, nachforderbar); ohne den Eintrag bliebe der Fall 'normalfall' und der Kunde
  // bekaeme den Ablehnungs-Hinweis unten NIE zu sehen.
  else if (['vs-kuerzt', 'vs-abgelehnt', 'abgelehnt', 'nachbesichtigung-laeuft'].includes(fallStatus) && szenario === 'normalfall') {
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
        // T1: Dead-Pin/noch-kein-SV (dispatch_pending/sv_gesucht) -> "wird bestaetigt"-Badge statt Live-Status.
        pending: sv.status === 'dispatch_pending' || sv.status === 'sv_gesucht',
      }
    : null

  const fmtVerlegD = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }) : ''
  const fmtVerlegT = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) : ''

  return (
    <div className="space-y-4">
      <FallMitteilungenBanner fallId={vm.fallId} rolle="kunde" />

      {/* Phasen-Stepper — Reparatur-Route (Selbstzahler/Kasko) bekommt den reduzierten Stepper. */}
      {istWerkstattReparaturWeg(vm.flags.abrechnungsweg) ? (
        <SelbstzahlerReparaturStepper
          hatWerkstatt={vm.geld.reparaturWerkstattId != null}
          terminStatus={vm.termine.find((x) => x.art === 'reparatur')?.status ?? null}
          kvaFreigegeben={vm.flags.reparaturFreigegeben}
          abgeschlossen={lifecycle.mainPhase === 'abschluss'}
        />
      ) : (
        <ClaimStepper
          lifecycle={lifecycle}
          terminInfo={terminInfo}
          bottomSlot={
            status.verlegung ? (
              <TerminVerlegungBanner
                pendingTerminId={status.verlegung.pendingTerminId}
                alterDatum={fmtVerlegD(status.verlegung.alterStart)}
                alterUhrzeit={fmtVerlegT(status.verlegung.alterStart)}
                neuesDatum={fmtVerlegD(status.verlegung.neuesStart)}
                neuesUhrzeit={fmtVerlegT(status.verlegung.neuesStart)}
                svVorname={status.verlegung.svVorname}
                grund={status.verlegung.grund}
                embedded
              />
            ) : null
          }
        />
      )}

      {/* K7 (§249 BGB): Haftpflicht-Reassurance — bei gegnerischer Haftung traegt die Gegenseite alle
          Kosten (0 EUR Eigenanteil). Gate: Haftpflicht-Weg (nicht Selbstzahler/Kasko), bekannte Gegner-
          Versicherung, Fall noch nicht abgeschlossen. Bewusst als PRINZIP formuliert — es gibt keine
          Schuldfrage-Spalte auf claims, daher „Trifft die Schuld die andere Seite …" statt einer Zusicherung. */}
      {!istWerkstattReparaturWeg(vm.flags.abrechnungsweg) &&
        !!fall.gegner_versicherung &&
        lifecycle.mainPhase !== 'abschluss' && (
          <NoticeBox
            tone="info"
            icon={<ShieldCheckIcon className="w-5 h-5 text-info shrink-0" />}
            className="rounded-ios-xl px-4 py-3 space-y-1"
          >
            <p className="text-sm font-semibold text-info-strong">{t('haftpflichtReassurance.titel')}</p>
            <p className="text-body-xs text-info-strong">{t('haftpflichtReassurance.text')}</p>
          </NoticeBox>
        )}

      {/* „Kam dein Gutachter?"-Selbstauskunft bei ueberfaelligem, ungeklaertem nur_gutachter-Termin. */}
      {status.terminCheck && (
        <KundeTerminCheckBanner
          terminId={status.terminCheck.terminId}
          svVorname={status.terminCheck.svVorname}
          terminLabel={
            status.terminCheck.terminStart
              ? `${format.dateTime(new Date(status.terminCheck.terminStart), { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })} um ${format.dateTime(new Date(status.terminCheck.terminStart), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`
              : null
          }
        />
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
      {(fallStatus === 'vs-abgelehnt' || fallStatus === 'abgelehnt') && (
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

      {/* Item 7: Regulierungs-Verlauf (Kanzlei-/VS-Ereignisse) — unter dem Phasen-Stepper. */}
      <RegulierungsVerlaufCard vm={vm} />
    </div>
  )
}
