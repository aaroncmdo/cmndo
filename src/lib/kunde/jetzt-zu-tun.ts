// AAR-432 (Child 3 von AAR-429): Zentrale Entscheidungs-Matrix für die
// „Jetzt zu tun"-Karte im Kunden-Portal. Pure Function, testbar.
//
// Analog zu `src/lib/gutachter/jetzt-zu-tun.ts` (SV-Matrix).
// Die 11 Zustände werden nach Priority-Order ausgewertet (first match wins).
// SLA-Records aus AAR-431 (Child 2) können passende Aktionen auf „hoch" boosten.

import { istClaimGeschlossen } from '@/lib/claims/terminal-status'

export type KundeAktionsTyp =
  | 'onboarding-offen'
  | 'pflichtdokumente-offen'
  | 'polizeibericht-fehlt'
  | 'daten-an-kanzlei'
  | 'termin-vor-ort'
  | 'termin-unterwegs'
  | 'termin-bestaetigen'
  | 'nachbesichtigung-waehlen'
  | 'vollmacht-unterschreiben'
  | 'vs-antwort-abwarten'
  | 'in-bearbeitung'
  | 'fall-abgeschlossen'
  | 'kein-aktionsbedarf'

export type KundeAktionVariant = 'default' | 'live' | 'info'
export type KundeAktionPrioritaet = 'hoch' | 'mittel' | 'niedrig'
export type KundeAktionSeverity = 'neutral' | 'warning' | 'critical' | 'success'

// Portal-i18n: Diese Lib ist server-pure (kein React) und kann daher KEIN
// useTranslations aufrufen. Sie liefert deshalb zusaetzlich i18n-Key-Hinweise
// (Namespace `jetztZuTun`) + ICU-Params; der React-Consumer (KundeJetztZuTunCard
// / FallKarte-Footer) loest sie via `t.has(key) ? t(key, params) : <de-Fallback>`
// auf. Die `titel`/`beschreibung`/`cta.label`-Strings bleiben als de-Fallback
// erhalten, damit Nicht-i18n-Consumer + interne Portale (locale-source 'intern',
// deutsch-forced) unveraendert funktionieren.
export type KundeAktionI18n = {
  titelKey: string
  // beschreibungKey entfaellt, wenn `beschreibung` dynamisch ist (z.B. SLA-
  // blocker_grund) → Consumer rendert dann das rohe `beschreibung`-Feld.
  beschreibungKey?: string
  ctaLabelKey?: string
  params?: Record<string, string | number>
}

export type KundeAktion = {
  state: KundeAktionsTyp
  prioritaet: KundeAktionPrioritaet
  titel: string
  beschreibung: string
  cta?: { label: string; href: string } | null
  variant: KundeAktionVariant
  severity: KundeAktionSeverity
  deadline_am?: string | null
  /** Portal-i18n-Hinweise (Namespace `jetztZuTun`), vom Consumer aufgeloest. */
  i18n?: KundeAktionI18n
  live_data?: {
    sv_name?: string
    eta_minuten?: number | null
    angekommen_seit?: string | null
  }
}

/**
 * Eingabe-Kontext für die Kunde-JetztZuTun-Matrix. Felder die nicht
 * existieren dürfen weggelassen werden (undefined) — die Logik interpretiert
 * sie dann als „nicht gesetzt".
 */
export type KundeFallContext = {
  id: string
  onboarding_complete?: boolean | null
  sa_unterschrieben?: boolean | null
  vollmacht_status?: string | null
  vollmacht_signiert_am?: string | null
  gutachter_termin_status?: string | null
  sv_termin?: string | null
  gutachter_termin_bestaetigt_am?: string | null
  anschlussschreiben_am?: string | null
  regulierung_am?: string | null
  polizei_vor_ort?: boolean | null
  polizeibericht_uploaded?: boolean | null
  hat_offene_nachreichung?: boolean | null
  sv_unterwegs_seit?: string | null
  sv_angekommen_am?: string | null
  sv_name?: string | null
  sv_eta_minuten?: number | null
  status?: string | null
  phase?: string | null
  abgeschlossen_am?: string | null
  // AAR-558 (C11): Nachbesichtigung-Anforderung (unabhängig vom Fall-Status)
  nachbesichtigung_status?: string | null
  // CMM-32: Kanzlei-Wunsch des Kunden — bestimmt ob Vollmacht benötigt wird
  kanzlei_wunsch?: string | null
}

export type KundeSlaRecord = {
  fall_id: string
  blocker_rolle?: string | null
  status?: string | null
  breach_at?: string | null
  blocker_grund?: string | null
}

/** Permanent-Minimalisierung nach Fall-Abschluss (in Tagen). */
const FALL_ABGESCHLOSSEN_MINIMAL_NACH_TAGEN = 30
/** SV-Termin als „vor Ort": innerhalb der nächsten 60 Minuten bis +2h nach Start. */
const TERMIN_VOR_ORT_FENSTER_VOR_MS = 60 * 60 * 1000
const TERMIN_VOR_ORT_FENSTER_NACH_MS = 2 * 60 * 60 * 1000
/** SV-Termin als „unterwegs" noch 2h nach Start (Fallback wenn kein sv_unterwegs_seit). */
const TERMIN_UNTERWEGS_FENSTER_MS = 2 * 60 * 60 * 1000

function hasSlaBreachForKunde(slaRecords: KundeSlaRecord[] | undefined, fallId: string): KundeSlaRecord | null {
  if (!slaRecords) return null
  return (
    slaRecords.find(
      (s) => s.fall_id === fallId && s.blocker_rolle === 'kunde' && s.status === 'breached',
    ) ?? null
  )
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// Gap H (Reise-Modell): für die Mittelphase-Zustände (SV-/Regulierungs-Achse läuft, der Kunde
// muss nichts tun) eine „woran wir gerade arbeiten"-Erzählung aus operative_status — statt des
// uninformativen „kein Handlungsbedarf". Spiegelt die subKunde-Stepper-Labels; reine Info (kein
// CTA). Reparatur-HANDLUNGS-Zustände (Werkstatt wählen / KVA-Freigabe) bleiben bewusst aussen vor
// (eigene CTAs in der GeldZone). Bewusst ohne i18n-Key → der Consumer rendert den de-Fallback
// (titel/beschreibung); die Übersetzung ist ein Paket-3-Follow-up.
const MITTELPHASE_ERZAEHLUNG: Record<string, { titel: string; text: string }> = {
  'sv-gesucht': {
    titel: 'Wir suchen Ihren Gutachter',
    text: 'Wir finden gerade einen passenden Sachverständigen in Ihrer Nähe. Sie müssen nichts tun — wir melden uns, sobald der Termin steht.',
  },
  'sv-zugewiesen': {
    titel: 'Gutachter zugewiesen',
    text: 'Ihr Sachverständiger ist zugewiesen und meldet sich für einen Besichtigungstermin.',
  },
  'besichtigung': {
    titel: 'Begutachtung läuft',
    text: 'Ihr Gutachter erfasst gerade den Schaden an Ihrem Fahrzeug.',
  },
  'begutachtung-laeuft': {
    titel: 'Gutachten wird erstellt',
    text: 'Ihr Gutachten wird gerade erstellt — das dauert in der Regel ein bis zwei Werktage.',
  },
  'gutachten-eingegangen': {
    titel: 'Gutachten wird geprüft',
    text: 'Ihr Gutachten liegt vor und wird von uns geprüft.',
  },
  'filmcheck': {
    titel: 'Gutachten wird geprüft',
    text: 'Ihr Gutachten liegt vor und wird von uns geprüft.',
  },
  'qc-pruefung': {
    titel: 'Qualitätsprüfung läuft',
    text: 'Ihr Gutachten durchläuft unsere Qualitätsprüfung, bevor es an die Versicherung geht.',
  },
  'kanzlei-uebergeben': {
    titel: 'Akte bei der Kanzlei',
    text: 'Ihre Akte ist bei der Partnerkanzlei — sie bereitet die Forderung an die Versicherung vor.',
  },
  'zahlung-eingegangen': {
    titel: 'Auszahlung wird vorbereitet',
    text: 'Das Geld ist eingegangen — wir bereiten Ihre Auszahlung vor.',
  },
  'reparatur-laeuft': {
    titel: 'Reparatur läuft',
    text: 'Ihr Fahrzeug wird gerade in der Werkstatt repariert.',
  },
  'reparatur-erledigt': {
    titel: 'Reparatur abgeschlossen',
    text: 'Ihre Reparatur ist fertiggestellt.',
  },
}

/**
 * Liefert die EINE höchst-priorisierte Aktion für den Kunden, oder null
 * wenn keine Aktion passt. Reihenfolge = Priority.
 */
export function getKundenJetztZuTun(
  fall: KundeFallContext,
  slaRecords?: KundeSlaRecord[],
): KundeAktion | null {
  if (!fall || !fall.id) return null

  const fallHref = `/kunde/faelle/${fall.id}`
  const now = Date.now()

  // 10. Fall-Abschluss: permanent-minimalisiert nach 30 Tagen. Höchster Vorrang
  // vor allem anderen, weil ein abgeschlossener Fall nichts mehr auslöst.
  // T3-S5: fall.status (faelle-View) traegt die operative Achse -> operativeStatus-Arm.
  if (istClaimGeschlossen({ operativeStatus: fall.status, abgeschlossenAm: fall.abgeschlossen_am })) {
    const abgeschlossenAm = fall.abgeschlossen_am ? new Date(fall.abgeschlossen_am).getTime() : now
    const alterTage = (now - abgeschlossenAm) / (1000 * 60 * 60 * 24)
    if (alterTage > FALL_ABGESCHLOSSEN_MINIMAL_NACH_TAGEN) return null
    return {
      state: 'fall-abgeschlossen',
      prioritaet: 'niedrig',
      titel: 'Fall abgeschlossen',
      beschreibung: 'Ihr Schadensfall ist vollständig reguliert. Danke für Ihr Vertrauen!',
      variant: 'info',
      severity: 'success',
      cta: null,
      i18n: {
        titelKey: 'fallAbgeschlossen.titel',
        beschreibungKey: 'fallAbgeschlossen.beschreibung',
      },
    }
  }

  // Storno/geschlossen — nichts zu tun
  if (fall.status === 'storniert') return null

  // SLA-Breach gegen Kunde (aus AAR-431): wird zum „daten-an-kanzlei"-State
  // gleich in Priority 4 eingebunden. Wir cachen hier den Breach-Record für Boost.
  const kundeSlaBreach = hasSlaBreachForKunde(slaRecords, fall.id)

  // 1. Onboarding nicht durchlaufen
  if (fall.onboarding_complete === false) {
    return {
      state: 'onboarding-offen',
      prioritaet: 'hoch',
      titel: 'Onboarding abschließen',
      beschreibung:
        'Bitte vervollständigen Sie die noch offenen Angaben zu Ihrem Schadensfall. Ohne diese Daten kann Ihr Betreuer den Fall nicht weiter bearbeiten.',
      cta: { label: 'Jetzt abschließen', href: '/kunde/onboarding' },
      variant: 'default',
      severity: 'warning',
      i18n: {
        titelKey: 'onboardingOffen.titel',
        beschreibungKey: 'onboardingOffen.beschreibung',
        ctaLabelKey: 'onboardingOffen.cta',
      },
    }
  }

  // CMM-22: Branches "pflichtdokumente-offen" und "polizeibericht-fehlt"
  // entfernt — der globale OffeneDatenBanner im Kunden-Layout übernimmt das
  // mit der Smart-Filter-Logik (claim-driven, getOffeneDokumentAnforderungen).
  // Die JetztZuTunCard bleibt frei für nicht-dokumenten-Themen
  // (Bankdaten, Kanzlei-Daten, etc.).

  // 4. Daten an Kanzlei (SLA-Breach mit blocker_rolle=kunde)
  if (kundeSlaBreach) {
    return {
      state: 'daten-an-kanzlei',
      prioritaet: 'hoch',
      titel: 'Daten für die Kanzlei benötigt',
      beschreibung:
        kundeSlaBreach.blocker_grund ??
        'Die Partnerkanzlei wartet auf noch fehlende Angaben von Ihnen. Bitte öffnen Sie Ihren Fall und prüfen Sie die offenen Punkte.',
      cta: { label: 'Fall öffnen', href: fallHref },
      variant: 'default',
      severity: 'critical',
      deadline_am: kundeSlaBreach.breach_at ?? null,
      i18n: {
        titelKey: 'datenAnKanzlei.titel',
        // beschreibungKey nur ohne blocker_grund — sonst zeigt der Consumer den
        // (dynamischen, unuebersetzten) Grund-Text aus `beschreibung`.
        ...(kundeSlaBreach.blocker_grund
          ? {}
          : { beschreibungKey: 'datenAnKanzlei.beschreibung' }),
        ctaLabelKey: 'datenAnKanzlei.cta',
      },
    }
  }

  // CMM-36: 'termin-vor-ort' und 'termin-unterwegs'-States hier ausgelagert.
  // Der Live-Status wird vom KundeSvLiveBanner ganz oben auf der Seite gezeigt
  // (Realtime, navy/grün) — JetztZuTun zeigt nicht das gleiche dreimal.

  // 5b. Fallback aus sv_termin: Termin läuft gerade (±Fenster)
  if (fall.sv_termin) {
    const terminMs = new Date(fall.sv_termin).getTime()
    if (!Number.isNaN(terminMs)) {
      // vor Ort: -1h .. +2h um Termin
      if (now >= terminMs - TERMIN_VOR_ORT_FENSTER_VOR_MS && now <= terminMs + TERMIN_VOR_ORT_FENSTER_NACH_MS) {
        return {
          state: 'termin-vor-ort',
          prioritaet: 'hoch',
          titel: 'Ihr Besichtigungstermin läuft',
          beschreibung: `Termin am ${fmtDate(fall.sv_termin)}. Der Gutachter ist entweder auf dem Weg oder bereits vor Ort.`,
          variant: 'live',
          severity: 'success',
          cta: null,
          i18n: {
            titelKey: 'terminVorOrt.titel',
            beschreibungKey: 'terminVorOrt.beschreibung',
            params: { datum: fmtDate(fall.sv_termin) },
          },
        }
      }
      // unterwegs-Fenster: Termin in nächsten 2h
      if (terminMs > now && terminMs - now <= TERMIN_UNTERWEGS_FENSTER_MS) {
        return {
          state: 'termin-unterwegs',
          prioritaet: 'hoch',
          titel: 'Ihr Besichtigungstermin steht bevor',
          beschreibung: `Termin am ${fmtDate(fall.sv_termin)}. Ihr Gutachter meldet sich kurz vor Eintreffen.`,
          variant: 'live',
          severity: 'neutral',
          cta: null,
          i18n: {
            titelKey: 'terminUnterwegs.titel',
            beschreibungKey: 'terminUnterwegs.beschreibung',
            params: { datum: fmtDate(fall.sv_termin) },
          },
        }
      }
    }
  }

  // 6b. Nachbesichtigung angefordert — Kunde muss Slots vorschlagen (AAR-558 C11).
  // Greift unabhängig vom Fall-Status (VS kann das vor oder während vs-kuerzt anfordern).
  if (fall.nachbesichtigung_status === 'angefordert') {
    return {
      state: 'nachbesichtigung-waehlen',
      prioritaet: 'hoch',
      titel: 'Nachbesichtigung: Termin wählen',
      beschreibung:
        'Die Versicherung fordert eine erneute Besichtigung Ihres Fahrzeugs. Bitte schlagen Sie 2–3 passende Termine vor.',
      cta: { label: 'Termine vorschlagen', href: `/kunde/nachbesichtigung/${fall.id}` },
      variant: 'default',
      severity: 'warning',
      i18n: {
        titelKey: 'nachbesichtigungWaehlen.titel',
        beschreibungKey: 'nachbesichtigungWaehlen.beschreibung',
        ctaLabelKey: 'nachbesichtigungWaehlen.cta',
      },
    }
  }

  // 7. Termin-Vorschlag bestätigen
  const terminStatus = (fall.gutachter_termin_status ?? '').toLowerCase()
  const terminBestaetigt = !!fall.gutachter_termin_bestaetigt_am
  if (fall.sv_termin && !terminBestaetigt && (terminStatus === 'reserviert' || terminStatus === 'vorschlag')) {
    return {
      state: 'termin-bestaetigen',
      prioritaet: 'hoch',
      titel: 'Besichtigungstermin bestätigen',
      beschreibung: `Ihr Gutachter schlägt ${fmtDate(fall.sv_termin)} vor. Bitte bestätigen oder einen Gegenvorschlag machen.`,
      cta: { label: 'Termin öffnen', href: fallHref },
      variant: 'default',
      severity: 'warning',
      i18n: {
        titelKey: 'terminBestaetigen.titel',
        beschreibungKey: 'terminBestaetigen.beschreibung',
        ctaLabelKey: 'terminBestaetigen.cta',
        params: { datum: fmtDate(fall.sv_termin) },
      },
    }
  }

  // 8. Vollmacht unterschreiben — nur relevant wenn Kunde LexDrive gewählt hat.
  // sa_unterschrieben ist die Service-Vereinbarung (anderes Dokument), nicht
  // die LexDrive-Vollmacht → wird hier bewusst NICHT als Proxy genutzt.
  const brauchtVollmacht = fall.kanzlei_wunsch === 'partnerkanzlei'
  // Variante B (Aaron): LexDrive verwaltet die Vollmacht — der Kunde unterschreibt
  // sie NICHT bei uns, sondern in der WhatsApp, die LexDrive ihm schickt. "Erledigt"
  // ist sie, wenn LexDrive sie bestaetigt (vollmacht_status='bestaetigt' via
  // /api/lexdrive/vollmacht-confirm). vollmacht_signiert_am bleibt als Legacy-Pfad.
  const vollmachtErledigt =
    !!fall.vollmacht_signiert_am ||
    fall.vollmacht_status === 'unterschrieben' ||
    fall.vollmacht_status === 'bestaetigt'
  if (brauchtVollmacht && !vollmachtErledigt) {
    return {
      state: 'vollmacht-unterschreiben',
      prioritaet: 'hoch',
      titel: 'Vollmacht unterschreiben',
      beschreibung:
        'Ihre Partnerkanzlei LexDrive schickt Ihnen die Vollmacht per WhatsApp. Bitte unterschreiben Sie sie dort — danach übernimmt LexDrive die Verhandlung mit der Versicherung.',
      cta: null,
      variant: 'default',
      severity: 'warning',
      i18n: {
        titelKey: 'vollmachtUnterschreiben.titel',
        beschreibungKey: 'vollmachtUnterschreiben.beschreibung',
        ctaLabelKey: 'vollmachtUnterschreiben.cta',
      },
    }
  }

  // 9. VS-/Regulierungs-Phase (informativ — Kanzlei/wir kümmern uns, Kunde muss nichts tun).
  // Gap-B-Fix: das nackte 'abgelehnt' + 'klage'/'klage_rechtsstreit' + 'in_kommunikation_vs' haben
  // KEIN vs-Prefix und fielen früher zum Default „kein Handlungsbedarf" durch — während die Fallakte
  // eine rote Alert-Box zeigt (Widerspruch). Jetzt konsistent abgedeckt, Botschaft nach Schwere
  // differenziert. Die dynamischen Botschaften nutzen den de-Fallback (kein i18n-Key, Paket-3-Follow-up).
  const vsStatus = (fall.status ?? '').toLowerCase()
  const istAblehnung = vsStatus === 'vs-abgelehnt' || vsStatus === 'abgelehnt' || vsStatus === 'vs-kuerzt'
  const istKlage = vsStatus === 'klage' || vsStatus === 'klage_rechtsstreit'
  if (
    vsStatus.startsWith('vs-') ||
    istAblehnung ||
    istKlage ||
    vsStatus === 'in_kommunikation_vs' ||
    vsStatus === 'anschlussschreiben-versendet' ||
    (fall.anschlussschreiben_am && !fall.regulierung_am)
  ) {
    if (istKlage) {
      return {
        state: 'vs-antwort-abwarten',
        prioritaet: 'niedrig',
        titel: 'Ihr Fall ist bei Gericht',
        beschreibung:
          'Ihre Partnerkanzlei vertritt Sie vor Gericht. Sie müssen nichts tun — wir halten Sie auf dem Laufenden.',
        variant: 'info',
        severity: 'warning',
        cta: null,
      }
    }
    if (istAblehnung) {
      return {
        state: 'vs-antwort-abwarten',
        prioritaet: 'niedrig',
        titel: 'Die Versicherung hat Einwände',
        beschreibung:
          'Die Versicherung hat gekürzt oder abgelehnt. Ihre Kanzlei prüft die nächsten Schritte und legt Widerspruch ein — Sie müssen nichts tun.',
        variant: 'info',
        severity: 'warning',
        cta: null,
      }
    }
    return {
      state: 'vs-antwort-abwarten',
      prioritaet: 'niedrig',
      titel: 'Wir warten auf die Versicherung',
      beschreibung:
        'Ihr Anschlussschreiben ist raus. Die Versicherung hat jetzt eine gesetzliche Frist zur Reaktion — wir melden uns, sobald wir eine Rückmeldung haben.',
      variant: 'info',
      severity: 'neutral',
      cta: null,
      i18n: {
        titelKey: 'vsAntwortAbwarten.titel',
        beschreibungKey: 'vsAntwortAbwarten.beschreibung',
      },
    }
  }

  // 10. In Bearbeitung (Mittelphase, Gap H): der Fall läuft aktiv, aber der Kunde muss nichts tun.
  // Statt des uninformativen „kein Handlungsbedarf" eine „woran wir gerade arbeiten"-Erzählung aus
  // operative_status (Reise-Modell). Deckt sv-gesucht..zahlung-eingegangen + reparatur-läuft/-erledigt.
  const bearbeitung = MITTELPHASE_ERZAEHLUNG[vsStatus]
  if (bearbeitung) {
    return {
      state: 'in-bearbeitung',
      prioritaet: 'niedrig',
      titel: bearbeitung.titel,
      beschreibung: bearbeitung.text,
      variant: 'info',
      severity: 'neutral',
      cta: null,
    }
  }

  // 11. Default: kein Aktionsbedarf (Fall läuft, kein bekannter Mittelphase-Zustand).
  return {
    state: 'kein-aktionsbedarf',
    prioritaet: 'niedrig',
    titel: 'Kein Handlungsbedarf',
    beschreibung: 'Ihr Fall läuft planmäßig — wir melden uns, sobald etwas von Ihnen benötigt wird.',
    variant: 'info',
    severity: 'neutral',
    cta: null,
    i18n: {
      titelKey: 'keinAktionsbedarf.titel',
      beschreibungKey: 'keinAktionsbedarf.beschreibung',
    },
  }
}
