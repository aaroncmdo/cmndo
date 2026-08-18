import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFailedOperation, markOperationResolved } from '@/lib/reliability/dead-letter'
import { meldePartnerZahlungsproblem, resolvePartnerFromStripe } from '@/lib/stripe/zahlungsproblem-alert'

export const dynamic = 'force-dynamic'

/**
 * KFZ-148: Stripe Webhook Endpoint.
 * Verarbeitet checkout.session.completed, payment_intent.payment_failed,
 * charge.refunded, charge.dispute.created, payment_intent.canceled.
 * Letztere drei feuern nur Admin-Alerts (kein automatischer Zugangs-/Budget-Entzug).
 */
export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  // Signatur-Verifizierung — FAIL-CLOSED.
  // Der fruehere else-Zweig (JSON.parse(body) ohne Secret ODER ohne Signatur) war
  // fail-open und schon durch WEGLASSEN des stripe-signature-Headers ausnutzbar
  // (sig='' -> Bedingung false -> ungeprueft): ein Angreifer konnte forged
  // checkout.session.completed senden und SVs/Orgs freischalten bzw. auf 'bezahlt'
  // setzen. In Prod wird ein Event OHNE gueltiges Secret+Signatur jetzt abgelehnt.
  let event: { id: string; type: string; data: { object: Record<string, unknown> } }
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      const { stripe } = await import('@/lib/stripe/client')
      const verified = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
      event = verified as unknown as typeof event
    } else if (process.env.NODE_ENV !== 'production') {
      // DEV-only: lokal ohne Secret/Stripe-CLI. NIE in Prod (s.o.).
      console.warn('[KFZ-148] Stripe Webhook UNVERIFIZIERT verarbeitet (nur non-prod).')
      event = JSON.parse(body)
    } else {
      console.error('[KFZ-148] Stripe Webhook: Secret oder Signatur fehlt in Prod — abgelehnt (fail-closed).')
      return NextResponse.json({ error: 'Signatur erforderlich' }, { status: 400 })
    }
  } catch (err) {
    console.error('[KFZ-148] Stripe Webhook Signatur-/Body-Fehler:', err)
    return NextResponse.json({ error: 'Signatur ungültig' }, { status: 400 })
  }

  const db = createAdminClient()

  // Idempotenz (SV-Onboarding-Audit): Atomarer Claim statt SELECT-dann-INSERT.
  // Der UNIQUE(stripe_event_id)-Constraint sorgt dafuer, dass bei gleichzeitiger
  // Doppel-Zustellung genau EINE Anfrage den Insert gewinnt. WICHTIG: Wir gaten
  // auf erfolgreiche VERARBEITUNG (verarbeitet=true), nicht auf blosse Existenz —
  // sonst wuerde ein Event, dessen Verarbeitung beim ersten Versuch fehlschlaegt
  // (Row liegt schon mit verarbeitet=false), bei jedem Stripe-Retry als "duplicate"
  // abgewiesen und NIE nachverarbeitet. Folge waere ein bezahlter SV ohne
  // portal_zugang_freigeschaltet -> vom Gutachter-Layout dauerhaft ausgesperrt.
  const gutachterId = (event.data.object.metadata as Record<string, string>)?.gutachter_id ?? null
  const { error: claimErr } = await db.from('stripe_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    sv_id: gutachterId,
    payload: event.data.object,
  })
  if (claimErr) {
    // Insert fehlgeschlagen: entweder Unique-Konflikt (Row existiert schon) oder
    // ein echter DB-Fehler. Unterscheiden anhand der vorhandenen Row.
    const { data: prior } = await db.from('stripe_events')
      .select('verarbeitet')
      .eq('stripe_event_id', event.id)
      .maybeSingle()
    if (prior?.verarbeitet) {
      // Bereits erfolgreich verarbeitet -> echtes Duplikat.
      return NextResponse.json({ ok: true, duplicate: true })
    }
    if (!prior) {
      // Kein Konflikt -> claimErr war ein echter DB-Fehler. 500 zurueck, damit
      // Stripe das Event erneut zustellt (statt es still durchlaufen zu lassen).
      console.error('[KFZ-148] stripe_events Claim-Insert-Fehler (kein Konflikt):', claimErr)
      return NextResponse.json({ error: 'db' }, { status: 500 })
    }
    // prior existiert mit verarbeitet=false -> vorheriger Versuch ist fehlgeschlagen
    // (oder laeuft gerade konkurrierend). Wir verarbeiten (erneut). Die Handler-
    // Operationen sind idempotent (UPDATEs setzen Absolutwerte; die Onboarding-
    // Rechnung ist per partiellem Unique-Index gegen Doppelausstellung geschuetzt).
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const meta = (session.metadata ?? {}) as Record<string, string>

        // P5 Netzwerkpartner-Abo: Subscription-Checkout abgeschlossen -> Abo-Row aktiv
        // (service-role, K1). Fruehester Entitlement-Zeitpunkt; invoice.payment_succeeded
        // bestaetigt idempotent.
        if (meta.typ === 'netzwerk_abo' && meta.sv_id) {
          const { applyNetzwerkAboEvent } = await import('@/lib/netzwerk/abo-webhook')
          await applyNetzwerkAboEvent(db, event as never)
          break
        }

        // KFZ-152: Buero-Anzahlung — Parent zahlt zentral fuer alle Sub-Standorte
        if (meta.typ === 'buero_anzahlung' && meta.organisation_id) {
          const orgId = meta.organisation_id

          // Default Payment Method aus dem Payment Intent extrahieren
          let defaultPmId: string | null = null
          try {
            const piId = session.payment_intent as string | null
            if (piId) {
              const { stripe } = await import('@/lib/stripe/client')
              const pi = await stripe.paymentIntents.retrieve(piId)
              defaultPmId = (pi.payment_method as string) ?? null
            }
          } catch (err) { console.error('[KFZ-152] PI retrieve:', err) }

          // Org aktivieren + PM speichern
          await db.from('organisationen').update({
            onboarding_status: 'aktiv',
            parent_stripe_default_pm_id: defaultPmId,
            updated_at: new Date().toISOString(),
          }).eq('id', orgId)

          // AAR-359 W2: Tier-2-Frist für alle Sub-SVs starten. 14 Tage ab
          // Anzahlung-Eingang — danach löst der Verifizierungs-Cron den
          // Banner-Countdown bzw. den frist_ueberschritten-Hard-Blocker aus.
          const verifizierungFristBis = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

          // Alle Sub-SVs (mitarbeiter) + Inhaber freischalten
          // BUG-92: vertrag_unterschrieben=true defensiv mitziehen — falls der
          // Sub-SV/Inhaber den AGB-Step nicht durchlaufen hat, ist der State
          // sonst inkonsistent (portal=true aber vertrag_unterschrieben=false).
          await db.from('sachverstaendige').update({
            onboarding_status: 'bezahlt',
            stripe_anzahlung_bezahlt_am: new Date().toISOString(),
            portal_zugang_freigeschaltet: true,
            anzahlung_status: 'bezahlt',
            ist_aktiv: true,
            vertrag_unterschrieben: true,
            vertrag_unterschrieben_am: new Date().toISOString(),
            verifizierung_status: 'ausstehend',
            verifizierung_frist_bis: verifizierungFristBis,
          }).eq('organisation_id', orgId)

          // ARCH-1 FR-5: Werbebudget pro Sub-SV mit dem jeweiligen
          // onboarding_anzahlung_betrag initialisieren (analog BUG-FOLLOW-4
          // im Solo-Branch). Der Inhaber selbst hat anzahlung=0 und bekommt
          // keine Faelle persoenlich → er bleibt bei 0 Werbebudget.
          // process-case-billing zieht 150 EUR pro Fall vom Werbebudget ab;
          // ohne diese Init wuerde der Sub-SV trotz Buero-Anzahlung sofort
          // den vollen Lead-Preis zahlen statt der Differenz.
          try {
            const { data: subs } = await db.from('sachverstaendige')
              .select('id, onboarding_anzahlung_betrag, rolle_in_organisation, ist_parent_account')
              .eq('organisation_id', orgId)
            for (const s of subs ?? []) {
              const r = (s.rolle_in_organisation ?? '').toLowerCase()
              if (r === 'inhaber' || s.ist_parent_account) continue
              const guthaben = Number(s.onboarding_anzahlung_betrag ?? 0)
              if (guthaben <= 0) continue
              await db.from('sachverstaendige').update({
                werbebudget_guthaben_netto: guthaben,
              }).eq('id', s.id)
            }
          } catch (err) {
            console.error('[ARCH-1 FR-5] Werbebudget-Init Buero-Branch:', err)
          }

          // AAR-401: Onboarding-Rechnung + KV + NB als Mail-Anhänge (ersetzt die
          // alte AnzahlungEingegangen-Mail im Buero-Branch).
          try {
            const { data: org } = await db.from('organisationen')
              .select('name, hauptansprechpartner_user_id, akademie_erst_anzahlung_eur')
              .eq('id', orgId)
              .single()
            if (org?.hauptansprechpartner_user_id) {
              const { data: p } = await db.from('profiles').select('email, vorname').eq('id', org.hauptansprechpartner_user_id).single()
              if (p?.email) {
                // Netto-Summe aller Sub-SV-Anzahlungen + Kontingent
                const { data: subs } = await db.from('sachverstaendige')
                  .select('onboarding_anzahlung_betrag, paket, paket_faelle_gesamt, ist_parent_account, rolle_in_organisation')
                  .eq('organisation_id', orgId)
                const paySubs = (subs ?? []).filter(s => {
                  const r = (s.rolle_in_organisation ?? '').toLowerCase()
                  return !s.ist_parent_account && r !== 'inhaber'
                })
                const nettoEuro = paySubs.reduce((sum, s) => sum + Number(s.onboarding_anzahlung_betrag ?? 0), 0)
                const kontingent = paySubs.reduce((sum, s) => sum + Number(s.paket_faelle_gesamt ?? 0), 0)
                const paket = paySubs[0]?.paket ?? null

                if (nettoEuro > 0) {
                  const { createOnboardingRechnung } = await import('@/lib/billing/create-onboarding-rechnung')
                  const { sendOnboardingRechnungEmail } = await import('@/lib/billing/send-onboarding-rechnung-email')
                  const rechn = await createOnboardingRechnung({
                    typ: 'buero',
                    organisation_id: orgId,
                    stripe_session_id: (session.id as string) ?? null,
                    stripe_payment_intent_id: (session.payment_intent as string) ?? null,
                    netto_euro: nettoEuro,
                    paket,
                    kontingent,
                    bezahlt_am: new Date(),
                  })
                  if (rechn.success) {
                    await sendOnboardingRechnungEmail({
                      rechnung_id: rechn.rechnung_id,
                      rechnungs_nr: rechn.rechnungs_nr,
                      rechnungs_pdf: rechn.pdf_buffer,
                      empfaenger_email: p.email,
                      vorname: p.vorname ?? null,
                      typ: 'buero',
                      orgName: org.name,
                      paket,
                      brutto_cent: rechn.brutto_cent,
                      organisation_id: orgId,
                    })
                  } else {
                    console.error('[AAR-401] Buero-Rechnung fehlgeschlagen:', rechn.error)
                  }
                }
              }
            }
          } catch (err) { console.error('[AAR-401] Buero Rechnung/Mail:', err) }

          // KFZ-151: Auto-Resolve etwaiger offener Onboarding-Tasks zur Org
          try {
            const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
            await resolveTasksForEntity('sv_onboarding', orgId, 'Buero-Anzahlung eingegangen')
          } catch (err) { console.error('[KFZ-151] resolveTasks buero:', err) }

          // BUG-92: Admin-Listing/Karte revalidieren damit die Status-Badges
          // sofort nach Webhook-Eingang frische Daten zeigen statt 'Wartet auf
          // Vertrag' aus dem stale Server-Component-Cache.
          try {
            revalidatePath('/admin/sachverstaendige', 'page')
            revalidatePath('/admin/sachverstaendige', 'page')
            revalidatePath('/admin/partner', 'page')
          } catch { /* */ }

          break
        }

        // KFZ-152 Phase 2: Akademie-Anzahlung — analog zum Buero-Branch.
        // Der Akademie-Verwalter zahlt eine individuelle Erst-Anzahlung,
        // danach sind ALLE Akademie-Mitglieder freigeschaltet.
        if (meta.typ === 'akademie_anzahlung' && meta.organisation_id) {
          const orgId = meta.organisation_id

          let defaultPmId: string | null = null
          try {
            const piId = session.payment_intent as string | null
            if (piId) {
              const { stripe } = await import('@/lib/stripe/client')
              const pi = await stripe.paymentIntents.retrieve(piId)
              defaultPmId = (pi.payment_method as string) ?? null
            }
          } catch (err) { console.error('[KFZ-152 akademie] PI retrieve:', err) }

          await db.from('organisationen').update({
            onboarding_status: 'aktiv',
            parent_stripe_default_pm_id: defaultPmId,
            updated_at: new Date().toISOString(),
          }).eq('id', orgId)

          // AAR-359 W2: Tier-2-Frist auch im Akademie-Branch.
          const verifizierungFristBisAkademie = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

          // Alle Akademie-Mitglieder + Verwalter freischalten
          await db.from('sachverstaendige').update({
            onboarding_status: 'bezahlt',
            stripe_anzahlung_bezahlt_am: new Date().toISOString(),
            portal_zugang_freigeschaltet: true,
            anzahlung_status: 'bezahlt',
            ist_aktiv: true,
            vertrag_unterschrieben: true,
            vertrag_unterschrieben_am: new Date().toISOString(),
            verifizierung_status: 'ausstehend',
            verifizierung_frist_bis: verifizierungFristBisAkademie,
          }).eq('organisation_id', orgId)

          // Werbebudget-Init pro Sub-SV (analog FR-5 Buero-Branch).
          // Akademie-Verwalter selbst (ist_parent_account=true) bekommt nichts.
          try {
            const { data: subs } = await db.from('sachverstaendige')
              .select('id, onboarding_anzahlung_betrag, rolle_in_organisation, ist_parent_account')
              .eq('organisation_id', orgId)
            for (const s of subs ?? []) {
              if (s.ist_parent_account) continue
              const guthaben = Number(s.onboarding_anzahlung_betrag ?? 0)
              if (guthaben <= 0) continue
              await db.from('sachverstaendige').update({
                werbebudget_guthaben_netto: guthaben,
              }).eq('id', s.id)
            }
          } catch (err) { console.error('[KFZ-152 akademie] Werbebudget-Init:', err) }

          // AAR-401: Onboarding-Rechnung + KV + NB als Mail-Anhänge (Akademie).
          try {
            const { data: org } = await db.from('organisationen')
              .select('name, hauptansprechpartner_user_id, akademie_erst_anzahlung_eur')
              .eq('id', orgId).single()
            if (org?.hauptansprechpartner_user_id) {
              const { data: p } = await db.from('profiles').select('email, vorname').eq('id', org.hauptansprechpartner_user_id).single()
              if (p?.email) {
                // Primär: akademie_erst_anzahlung_eur auf der Organisation
                const { data: subs } = await db.from('sachverstaendige')
                  .select('onboarding_anzahlung_betrag, paket, paket_faelle_gesamt, ist_parent_account')
                  .eq('organisation_id', orgId)
                const nettoFromSubs = (subs ?? [])
                  .filter(s => !s.ist_parent_account)
                  .reduce((sum, s) => sum + Number(s.onboarding_anzahlung_betrag ?? 0), 0)
                const nettoEuro = Number(org.akademie_erst_anzahlung_eur ?? 0) || nettoFromSubs
                const kontingent = (subs ?? []).reduce((sum, s) => sum + Number(s.paket_faelle_gesamt ?? 0), 0)
                const paket = (subs ?? [])[0]?.paket ?? null

                if (nettoEuro > 0) {
                  const { createOnboardingRechnung } = await import('@/lib/billing/create-onboarding-rechnung')
                  const { sendOnboardingRechnungEmail } = await import('@/lib/billing/send-onboarding-rechnung-email')
                  const rechn = await createOnboardingRechnung({
                    typ: 'akademie',
                    organisation_id: orgId,
                    stripe_session_id: (session.id as string) ?? null,
                    stripe_payment_intent_id: (session.payment_intent as string) ?? null,
                    netto_euro: nettoEuro,
                    paket,
                    kontingent,
                    bezahlt_am: new Date(),
                  })
                  if (rechn.success) {
                    await sendOnboardingRechnungEmail({
                      rechnung_id: rechn.rechnung_id,
                      rechnungs_nr: rechn.rechnungs_nr,
                      rechnungs_pdf: rechn.pdf_buffer,
                      empfaenger_email: p.email,
                      vorname: p.vorname ?? null,
                      typ: 'akademie',
                      orgName: org.name,
                      paket,
                      brutto_cent: rechn.brutto_cent,
                      organisation_id: orgId,
                    })
                  } else {
                    console.error('[AAR-401] Akademie-Rechnung fehlgeschlagen:', rechn.error)
                  }
                }
              }
            }
          } catch (err) { console.error('[AAR-401] Akademie Rechnung/Mail:', err) }

          try {
            const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
            await resolveTasksForEntity('sv_onboarding', orgId, 'Akademie-Anzahlung eingegangen')
          } catch (err) { console.error('[KFZ-151] resolveTasks akademie:', err) }

          try {
            revalidatePath('/admin/sachverstaendige', 'page')
            revalidatePath('/admin/sachverstaendige', 'page')
            revalidatePath('/admin/partner', 'page')
          } catch { /* */ }

          break
        }

        // KFZ-188: Kanzlei-Monatsabrechnung bezahlt
        if (meta.typ === 'kanzlei_abrechnung' && meta.kanzlei_abrechnung_id) {
          const abrId = meta.kanzlei_abrechnung_id
          const bezahltAm = new Date().toISOString()
          const piId = (session.payment_intent as string) ?? null

          // Abrechnung als bezahlt markieren
          await db.from('kanzlei_abrechnungen').update({
            status: 'bezahlt',
            bezahlt_am: bezahltAm,
            stripe_payment_intent_id: piId,
          }).eq('id', abrId)

          // Alle Faelle in den Positionen auf 'ausgezahlt' setzen.
          // CMM-61: kanzlei_provision_status/_ausgezahlt_am leben auf claims (SSoT).
          // kanzlei_abrechnung_positionen traegt nur fall_id -> claim_ids via faelle mappen.
          try {
            const { data: positionen } = await db
              .from('kanzlei_abrechnung_positionen')
              .select('fall_id')
              .eq('kanzlei_abrechnung_id', abrId)
            const fallIds = (positionen ?? []).map((p) => p.fall_id as string).filter(Boolean)
            if (fallIds.length > 0) {
              const { data: claimRows } = await db
                .from('faelle_claim_bridge')
                .select('claim_id')
                .in('fall_id', fallIds)
              const claimIds = (claimRows ?? []).map((f) => f.claim_id as string).filter(Boolean)
              if (claimIds.length > 0) {
                // Das Geld ist an dieser Stelle geflossen (Stripe-Event). Bleibt der
                // Marker aus, gelten die Provisionen weiter als offen — mit dem Risiko
                // einer zweiten Auszahlung. Das umschliessende try faengt den Write nicht.
                const { error: provisionFehler } = await db.from('claims').update({
                  kanzlei_provision_status: 'ausgezahlt',
                  kanzlei_provision_ausgezahlt_am: bezahltAm,
                }).in('id', claimIds)
                if (provisionFehler) {
                  console.error(`[stripe] Provisions-Status NICHT gesetzt (${claimIds.length} Claims) — Doppelauszahlung moeglich:`, provisionFehler.message)
                }
              }
            }
          } catch (err) {
            console.error('[KFZ-188] claims ausgezahlt update:', err)
          }

          // Bestaetigung an Kanzlei
          try {
            const { data: abr } = await db.from('kanzlei_abrechnungen')
              .select('rechnungsnummer, endbetrag_brutto, kanzlei_id')
              .eq('id', abrId).single()
            if (abr?.kanzlei_id) {
              const { data: kanzlei } = await db.from('kanzleien')
                .select('email, name, ansprechpartner')
                .eq('id', abr.kanzlei_id).single()
              if (kanzlei?.email) {
                const { render } = await import('@react-email/render')
                const { KanzleiZahlungBestaetigungEmail, subject: kanzleiSubject } = await import('@/lib/email/google/templates/KanzleiZahlungBestaetigung')
                const { sendCommunication } = await import('@/lib/communications/send')
                const props = {
                  ansprechpartner: kanzlei.ansprechpartner ?? 'Sehr geehrte Damen und Herren',
                  rechnungsnummer: abr.rechnungsnummer,
                  brutto: `${Number(abr.endbetrag_brutto).toFixed(2).replace('.', ',')} €`,
                  bezahltAm: bezahltAm,
                }
                const html = await render(KanzleiZahlungBestaetigungEmail(props))
                await sendCommunication('kanzlei_monatsabrechnung', {
                  email: kanzlei.email,
                  vorname: kanzlei.ansprechpartner ?? '',
                  subject: kanzleiSubject(props),
                  html,
                })
              }
            }
          } catch (err) {
            console.error('[KFZ-188] Bestaetigung-Email:', err)
          }

          try {
            revalidatePath('/admin/finance', 'page')
          } catch { /* */ }

          break
        }

        if (meta.typ === 'sv_anzahlung' && meta.gutachter_id) {
          const svId = meta.gutachter_id

          // BUG-FOLLOW-4: werbebudget_guthaben_netto mit Anzahlungsbetrag initialisieren.
          // KFZ-149 process-case-billing zieht 150 EUR pro Fall vom Werbebudget ab —
          // ohne diese Initialisierung waere das Guthaben 0 und der SV wuerde sofort
          // den vollen Lead-Preis zahlen statt der Differenz.
          const { data: svBefore } = await db.from('sachverstaendige')
            .select('onboarding_anzahlung_betrag')
            .eq('id', svId)
            .single()
          const initGuthaben = Number(svBefore?.onboarding_anzahlung_betrag ?? 0)

          // AAR-359 W2: Tier-2-Frist für Solo-SV starten (14 Tage ab Anzahlung).
          const verifizierungFristBisSolo = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

          // Portal freischalten
          // BUG-92: vertrag_unterschrieben=true defensiv mitziehen — falls der
          // Solo-SV den Vertrag-Step uebersprungen hat (sollte nicht vorkommen,
          // aber verhindert inkonsistenten State im Admin-Listing).
          await db.from('sachverstaendige').update({
            onboarding_status: 'bezahlt',
            stripe_anzahlung_payment_intent_id: session.payment_intent as string ?? null,
            stripe_anzahlung_bezahlt_am: new Date().toISOString(),
            portal_zugang_freigeschaltet: true,
            // AAR SV-Audit-Konsolidierung: ist_aktiv zusammen mit
            // portal_zugang_freigeschaltet aktivieren — Solo-Wizard setzt
            // jetzt ist_aktiv=false beim Anlegen, also muss der Webhook
            // beide auf true setzen (wie die anderen 2 Branches bereits).
            ist_aktiv: true,
            anzahlung_status: 'bezahlt',
            werbebudget_guthaben_netto: initGuthaben,
            vertrag_unterschrieben: true,
            vertrag_unterschrieben_am: new Date().toISOString(),
            verifizierung_status: 'ausstehend',
            verifizierung_frist_bis: verifizierungFristBisSolo,
          }).eq('id', svId)

          // KFZ-151: Auto-Resolve aller offenen Tasks zu diesem Onboarding
          try {
            const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
            await resolveTasksForEntity('sv_onboarding', svId, 'Anzahlung eingegangen')
          } catch (err) { console.error('[KFZ-151] resolveTasks sv_onboarding:', err) }

          // AAR-401: Onboarding-Rechnung + KV + NB als 3 Mail-Anhänge (Solo-SV).
          try {
            const { data: sv } = await db.from('sachverstaendige')
              .select('profile_id, paket, paket_faelle_gesamt, onboarding_anzahlung_betrag')
              .eq('id', svId).single()
            if (sv?.profile_id) {
              const { data: p } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
              if (p?.email) {
                const nettoEuro = Number(sv.onboarding_anzahlung_betrag ?? 0)
                const kontingent = Number(sv.paket_faelle_gesamt ?? 0)
                const paket = (sv.paket as string | null) ?? null

                if (nettoEuro > 0) {
                  const { createOnboardingRechnung } = await import('@/lib/billing/create-onboarding-rechnung')
                  const { sendOnboardingRechnungEmail } = await import('@/lib/billing/send-onboarding-rechnung-email')
                  const rechn = await createOnboardingRechnung({
                    typ: 'solo',
                    sv_id: svId,
                    stripe_session_id: (session.id as string) ?? null,
                    stripe_payment_intent_id: (session.payment_intent as string) ?? null,
                    netto_euro: nettoEuro,
                    paket,
                    kontingent,
                    bezahlt_am: new Date(),
                  })
                  if (rechn.success) {
                    await sendOnboardingRechnungEmail({
                      rechnung_id: rechn.rechnung_id,
                      rechnungs_nr: rechn.rechnungs_nr,
                      rechnungs_pdf: rechn.pdf_buffer,
                      empfaenger_email: p.email,
                      vorname: p.vorname ?? null,
                      typ: 'solo',
                      paket,
                      brutto_cent: rechn.brutto_cent,
                      sv_id: svId,
                    })
                  } else {
                    console.error('[AAR-401] Solo-Rechnung fehlgeschlagen:', rechn.error)
                  }
                }
              }
            }
          } catch (err) { console.error('[AAR-401] Solo Rechnung/Mail:', err) }

          // (2026-07-04, Reliability-Sweep) Der frueher hier feuernde
          // admin_einzug_failed-Alert wurde ENTFERNT: das ist ein FEHLSCHLAG-Trigger
          // (channel=email, "Stripe-Einzug fehlgeschlagen"), lief aber im Solo-ANZAHLUNG-
          // ERFOLG-Zweig UND via telefon (Kanal-Mismatch) -> Falschalarm an Admins bei
          // JEDER erfolgreichen Anzahlung. Copy-Paste-Rest (Buero/Akademie-Zweige
          // notifizieren hier bewusst gar nicht; ein echter "SV aktiviert"-Trigger existiert nicht).

          // BUG-92: Admin-Listing/Karte revalidieren — analog Buero-Branch.
          try {
            revalidatePath('/admin/sachverstaendige', 'page')
            revalidatePath('/admin/sachverstaendige', 'page')
          } catch { /* */ }
        }
        break
      }

      // P5 Netzwerkpartner-Abo: Subscription-/Invoice-Lifecycle -> Abo-Row (service-role).
      // Additiv — bestehende Handler unveraendert; payment_intent.* bleiben Einzugs-PIs.
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const { applyNetzwerkAboEvent } = await import('@/lib/netzwerk/abo-webhook')
        await applyNetzwerkAboEvent(db, event as never)
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object
        const meta = (pi.metadata ?? {}) as Record<string, string>
        if (meta.gutachter_id) {
          // Status updaten
          await db.from('sachverstaendige').update({
            onboarding_status: 'anzahlung_offen',
          }).eq('id', meta.gutachter_id)
        }
        // Einzugs-PI (SEPA-Ruecklastschrift days-later): Abrechnung auf fehlgeschlagen.
        const { handleEinzugPaymentFailed } = await import('@/lib/finance/einzug-webhook')
        const einzugFail = await handleEinzugPaymentFailed(db, pi as {
          metadata?: Record<string, string> | null; amount?: number | null; last_payment_error?: { message?: string } | null
        })
        if (einzugFail.acted) {
          try {
            const { render } = await import('@react-email/render')
            const { AdminEinzugFehlgeschlagenEmail, subject } = await import('@/lib/email/google/templates/AdminEinzugFehlgeschlagen')
            const { sendCommunication } = await import('@/lib/communications/send')
            const props = {
              abrechnungsNr: einzugFail.abrechnungsNr ?? (einzugFail.abrId ?? '').slice(0, 8),
              empfaengerName: null,
              betragBrutto: einzugFail.betragBrutto ?? 0,
              fehlerGrund: einzugFail.grund ?? 'Lastschrift fehlgeschlagen',
            }
            await sendCommunication('admin_einzug_failed', {
              email: process.env.ADMIN_ALERT_EMAIL || 'aaron@claimondo.de',
              subject: subject(props),
              html: await render(AdminEinzugFehlgeschlagenEmail(props)),
            })
          } catch (alertErr) {
            console.error('[KFZ-148] einzug-payment_failed Admin-Alert (non-fatal):', alertErr)
          }
        }
        break
      }

      case 'payment_intent.succeeded': {
        // AAR (06.07. Bug-Audit): async erfolgreiche off_session-Einzuege verbuchen.
        // Der abrechnung-einzug-Cron erstellt PIs mit confirm+off_session; bei SEPA/
        // verzoegerter Zahlung ist der Erststatus 'processing' -> der Cron labelt
        // 'fehlgeschlagen' + setzt einzug_versucht_am (Abrechnung faellt aus kuenftigen
        // Cron-Laeufen). Wird der PI spaeter async 'succeeded', kam die Zahlung bisher
        // NIE in der DB an (kein Handler) -> Abrechnung blieb dauerhaft 'fehlgeschlagen'/
        // bezahlt_am=NULL trotz Geldeingang (5 verwaiste succeeded-Events in stripe_events).
        // Jetzt: als bezahlt verbuchen (mirror von markPaid im Cron). Nur fuer Einzugs-PIs
        // (metadata.abrechnung_id) — Onboarding-Anzahlungen laufen ueber checkout.session.
        const pi = event.data.object
        const { handleEinzugPaymentSucceeded } = await import('@/lib/finance/einzug-webhook')
        await handleEinzugPaymentSucceeded(db, pi as {
          metadata?: Record<string, string> | null; amount?: number | null; amount_received?: number | null
        })
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object
        const meta = (charge.metadata ?? {}) as Record<string, string>
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
        const betragCent = Number((charge as any).amount_refunded ?? (charge as any).amount ?? 0)
        const grund = (charge as any).refunds?.data?.[0]?.reason ?? null
        const stripeRef = String((charge as any).id)
        try {
          const partner = await resolvePartnerFromStripe(db, meta, piId)
          await meldePartnerZahlungsproblem({
            art: 'refund',
            ...partner,
            betragCent,
            grund,
            stripeRef,
          })
        } catch (alertErr) {
          console.error('[KFZ-148] charge.refunded Alert-Fehler (non-fatal):', alertErr)
        }
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object
        const piId = typeof (dispute as any).payment_intent === 'string' ? (dispute as any).payment_intent : null
        const betragCent = Number((dispute as any).amount ?? 0)
        const grund = String((dispute as any).reason ?? '')
        const stripeRef = String((dispute as any).id)
        try {
          const partner = await resolvePartnerFromStripe(db, {}, piId)
          await meldePartnerZahlungsproblem({
            art: 'dispute',
            ...partner,
            betragCent,
            grund,
            stripeRef,
          })
        } catch (alertErr) {
          console.error('[KFZ-148] charge.dispute.created Alert-Fehler (non-fatal):', alertErr)
        }
        break
      }

      case 'payment_intent.canceled': {
        const pi = event.data.object
        const meta = ((pi as any).metadata ?? {}) as Record<string, string>
        const piId = String((pi as any).id)
        const betragCent = Number((pi as any).amount ?? 0)
        const grund = String((pi as any).cancellation_reason ?? '')
        const stripeRef = piId
        try {
          const partner = await resolvePartnerFromStripe(db, meta, piId)
          await meldePartnerZahlungsproblem({
            art: 'canceled',
            ...partner,
            betragCent,
            grund,
            stripeRef,
          })
        } catch (alertErr) {
          console.error('[KFZ-148] payment_intent.canceled Alert-Fehler (non-fatal):', alertErr)
        }
        break
      }
    }

    // Als verarbeitet markieren
    await db.from('stripe_events').update({ verarbeitet: true }).eq('stripe_event_id', event.id)
    // Reliability-Sweep: ein etwaiger Dead-Letter-Eintrag aus einem frueheren
    // fehlgeschlagenen Versuch dieses Events ist jetzt aufgeloest.
    await markOperationResolved(`stripe_webhook:${event.id}`)
  } catch (err) {
    console.error(`[KFZ-148] Stripe Webhook ${event.type}:`, err)
    await db.from('stripe_events').update({ fehler: String(err) }).eq('stripe_event_id', event.id)
    // Reliability-Sweep: ins zentrale Dead-Letter, damit ein nach Stripes Retry-Fenster
    // weiterhin nicht verarbeitetes Event vom recovery-monitor-Cron an einen Admin eskaliert
    // wird (statt stumm mit verarbeitet=false liegenzubleiben). Bei erfolgreicher
    // (Nach-)Verarbeitung loest markOperationResolved oben den Eintrag wieder auf.
    await recordFailedOperation({
      operationType: 'stripe_webhook',
      dedupKey: `stripe_webhook:${event.id}`,
      entityType: gutachterId ? 'sv' : null,
      entityId: gutachterId,
      payload: { event_type: event.type },
      error: String(err),
      escalateAfterMinutes: 12 * 60, // 12h Grace: Stripe retryt noch, aber ein dauerhaft
      //                                ausgesperrter bezahlter SV wird zeitnah eskaliert.
    })
    // 500 statt 200 zurueckgeben, damit Stripe das Event ERNEUT zustellt. Der Idempotenz-Block
    // oben gatet auf verarbeitet=false und verarbeitet beim Retry sauber nach (UPDATEs setzen
    // Absolutwerte, die Onboarding-Rechnung ist per Unique-Index gegen Doppelausstellung
    // geschuetzt -> Retry ist sicher). Mit 200 wuerde Stripe NIE retryen -> der Reprocess-Pfad
    // feuerte nie -> ein bezahlter SV bliebe bei einem transienten Fehler doch ausgesperrt.
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
