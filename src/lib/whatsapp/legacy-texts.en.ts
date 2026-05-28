import type { TemplateName } from './template-sids'

// Track B1 (Doc 48): English translations of the WhatsApp legacy templates.
// Mirrors the de structure in legacy-texts.ts exactly; only the prose is translated.
export const TEMPLATES_EN: Partial<Record<TemplateName, (vars: Record<string, string>) => string>> = {
  fall_eroeffnet: (v) =>
    `Hello ${v['1'] ?? 'Customer'}, your case ${v['2'] ?? ''} has been opened at Claimondo. We will take care of everything else. If you have any questions, simply reply to this message.`,

  // AAR-312: Right after the SA — explains the two-stage payment + the appraiser is coming.
  // Variables: 1=first name, 2=portal link
  info_nach_sa: (v) =>
    `Just a quick note, ${v['1'] ?? ''}: you pay NOTHING for the claim settlement. The other party's insurer covers all costs. The payout is often made in two steps (a first partial payment quickly, the rest after completion). The appraiser comes directly to you — you don't have to go anywhere. All updates are in your portal: ${v['2'] ?? ''}`,

  flowlink_versand: (v) =>
    // AAR-116: Template expects 6 variables (first name, appraiser first name, appraiser last name, date, time, FlowLink URL)
    `Hello ${v['1'] ?? ''}, your appraisal appointment with ${v['2'] ?? ''} ${v['3'] ?? ''} on ${v['4'] ?? ''} at ${v['5'] ?? ''} is confirmed. Please fill out the form now to complete your claim: ${v['6'] ?? ''}`,

  sv_beauftragt: (v) =>
    `Good news, ${v['1'] ?? ''}! We have commissioned the appraiser ${v['2'] ?? ''} for you. He will contact you shortly to arrange an inspection appointment.`,

  termin_bestaetigt: (v) =>
    `Hello ${v['1'] ?? ''}, your appraisal appointment with ${v['2'] ?? ''} is confirmed for ${v['3'] ?? ''}. The appraiser comes directly to you. Please make sure the vehicle is accessible.`,

  reminder_24h: (v) =>
    `Reminder: tomorrow at ${v['2'] ?? ''} your appraiser will arrive. Please have your vehicle registration, ID card and the vehicle ready, ${v['1'] ?? ''}.`,

  reminder_2h: (v) =>
    `${v['1'] ?? ''}, your appraisal appointment is in about 2 hours. The appraiser is on the way to you.`,

  sv_tagesroute: (v) =>
    `Hello ${v['1'] ?? ''}, your appraiser has started his daily route and will arrive at your location in about ${v['2'] ?? ''} minutes.`,

  gutachten_fertig: (v) =>
    `Hello ${v['1'] ?? ''}, your appraisal report is complete and is now being handed over to the law firm. You don't need to do anything else.`,

  kanzlei_uebergabe: (v) =>
    `${v['1'] ?? ''}, your case has been handed over to our partner law firm. The law firm will pursue the claim settlement with the other party's insurer for you.`,

  as_gesendet: (v) =>
    `${v['1'] ?? ''}, the follow-up letter to the insurer has been sent. The insurer's regular processing period (4-6 weeks) is now running.`,

  regulierung_angekuendigt: (v) =>
    `Great news, ${v['1'] ?? ''}! The insurer has announced the claim settlement. We are reviewing the amount and will get back to you with details.`,

  zahlung_eingegangen: (v) =>
    `${v['1'] ?? ''}, a payment of ${v['2'] ?? ''} EUR has been received for your case. You can find the details in your customer portal.`,

  fall_abgeschlossen: (v) =>
    `${v['1'] ?? ''}, your claim has been successfully closed. Thank you for trusting Claimondo! We would be delighted with a Google review.`,

  eskalation_tag14: (v) =>
    `${v['1'] ?? ''}, the insurer has not yet responded to our follow-up letter (14 days). We have followed up.`,

  eskalation_tag28: (v) =>
    `${v['1'] ?? ''}, after 28 days without a response from the insurer, we have sent a formal deadline notice.`,


  chat_fallback_kunde: (v) =>
    `Hello ${v['1'] ?? ''}, you have a new message in your Claimondo portal. Please check your inbox.`,

  chat_fallback_kb: (v) =>
    `New customer message for case from ${v['1'] ?? ''}. Please reply in the portal.`,

  kuerzung_eingetragen: (v) =>
    `${v['1'] ?? ''}, the insurer has made a reduction. Our team is reviewing whether to contest it. Details in the customer portal.`,

  sv_losgefahren: (v) =>
    `${v['1'] ?? ''}, your appraiser has set off and will arrive at your location in about ${v['2'] ?? ''} minutes.`,

  sv_fast_da: (v) =>
    `${v['1'] ?? ''}, your appraiser ${v['2'] ?? ''} is almost at your location. Please have the vehicle ready.`,

  sv_angekommen: (v) =>
    `${v['1'] ?? ''}, your appraiser ${v['2'] ?? ''} has arrived. The inspection is starting now.`,

  // ─── New templates 24-27 (KFZ-181) ─────────────────────────────

  termin_storniert: (v) =>
    `Hello ${v['1'] ?? ''}, unfortunately the appraisal appointment with ${v['2'] ?? ''} on ${v['3'] ?? ''} has to be cancelled. We will contact you shortly with a replacement appointment.`,

  sv_verspaetet: (v) =>
    `Hello ${v['1'] ?? ''}, your appraiser ${v['2'] ?? ''} is delayed by about ${v['3'] ?? ''} minutes. We appreciate your understanding.`,

  dokumente_nachreichen: (v) =>
    `Hello ${v['1'] ?? ''}, the following documents are still missing for your claim: ${v['2'] ?? ''}. Please upload them here: ${v['3'] ?? ''}`,

  rechnung_verfuegbar: (v) =>
    `Hello ${v['1'] ?? ''}, your invoice is available for download: ${v['2'] ?? ''}`,

  // ─── KFZ-193: KB consultation appointment templates ───────────────────────────────

  kb_termin_bestaetigt: (v) =>
    `Hello ${v['1'] ?? ''}, your consultation appointment on ${v['2'] ?? ''} at ${v['3'] ?? ''} (${v['4'] === 'video' ? 'video call' : 'phone'}) is confirmed.${v['5'] ? ` Video link: ${v['5']}` : ''} Your Claimondo team`,

  kb_termin_reminder_24h: (v) =>
    `Reminder: ${v['1'] ?? ''}, tomorrow ${v['2'] ?? ''} at ${v['3'] ?? ''} you have a consultation appointment with your Claimondo advisor (${v['4'] === 'video' ? 'video call' : 'phone'}).`,

  kb_termin_reminder_1h: (v) =>
    `${v['1'] ?? ''}, in about 1 hour (${v['2'] ?? ''}) ${v['3'] ? `your video call starts. Link: ${v['3']}` : 'your Claimondo advisor will call you. Please have your phone ready.'}`,

  // KFZ-202: No-Show — CMM-39: additionally re-appointment FlowLink (variable 2)
  no_show_kunde: (v) =>
    `Hello ${v['1'] ?? ''}, unfortunately we did not find you at the arranged appraisal appointment. Please choose a new appointment here: ${v['2'] ?? ''}`,

  // KFZ-207: Escalation day 21
  eskalation_tag21: (v) =>
    `Hello ${v['1'] ?? ''}, we are actively tracking your case. We contacted the insurer again today and expect a response soon. Portal: ${v['2'] ?? ''}`,

  // KFZ-210: Re-inspection
  nachbesichtigung_angefordert: (v) =>
    `Hello ${v['1'] ?? ''}, the insurer has requested a re-inspection of your vehicle. Please choose an appointment in your portal: ${v['2'] ?? ''}`,
  nachbesichtigung_termin: (v) =>
    `Hello ${v['1'] ?? ''}, your re-inspection appointment is confirmed for ${v['2'] ?? ''}. Please have your vehicle ready. Details: ${v['3'] ?? ''}`,
  nachbesichtigung_abgeschlossen: (v) =>
    `Hello ${v['1'] ?? ''}, the re-inspection of your vehicle is complete. We will inform you as soon as the result is available. Portal: ${v['2'] ?? ''}`,

  // AAR-352: Multi-slot upload request — 1=first name, 2=upload link
  dokumente_upload_anfrage: (v) =>
    `Hello ${v['1'] ?? ''}, please upload the requested documents via the following link: ${v['2'] ?? ''} (link valid for 7 days). Claimondo`,

  // AAR-559 (C10): SV order technical statement — 1=appraiser first name, 2=case no., 3=reason short form, 4=portal link
  stellungnahme_beauftragt: (v) =>
    `Hello ${v['1'] ?? ''}, a technical statement is required for case ${v['2'] ?? ''} (reason: ${v['3'] ?? ''}). Details in the portal: ${v['4'] ?? ''}`,

  // AAR-561 (C12): SV confrontation request — 1=appraiser first name, 2=case no., 3=appointment, 4=portal link
  sv_konfrontation_anfrage: (v) =>
    `Hello ${v['1'] ?? ''}, a confrontation appointment with the insurer's appraiser is planned for case ${v['2'] ?? ''} on ${v['3'] ?? ''}. Please confirm in the portal: ${v['4'] ?? ''}`,

  // AAR-561 (C12): Customer confirmation SV confrontation — 1=customer first name, 2=appraiser first name, 3=appointment, 4=portal link
  sv_konfrontation_bestaetigt_kunde: (v) =>
    `Hello ${v['1'] ?? ''}, your appraiser ${v['2'] ?? ''} will accompany you on ${v['3'] ?? ''} to the re-inspection with the insurer's appraiser. Details: ${v['4'] ?? ''}`,

  // AAR-864 T31: SV requests rescheduling — 1=first name, 2=old date, 3=old time,
  //   4=new date, 5=new time, 6=appraiser first name, 7=portal link
  termin_verlegung_request: (v) =>
    `Hello ${v['1'] ?? ''}, your appraiser ${v['6'] ?? ''} is requesting an appointment rescheduling. Instead of ${v['2'] ?? ''} at ${v['3'] ?? ''}, the appointment should be moved to ${v['4'] ?? ''} at ${v['5'] ?? ''}. Please confirm or decline: ${v['7'] ?? ''}`,

  // AAR-864 T32: Customer has confirmed rescheduling — 1=appraiser first name, 2=new date,
  //   3=new time, 4=customer first name
  termin_verlegung_bestaetigt: (v) =>
    `Hello ${v['1'] ?? ''}, ${v['4'] ?? ''} has confirmed the rescheduling. New appointment: ${v['2'] ?? ''} at ${v['3'] ?? ''}.`,

  // AAR-864 T33: Customer has declined rescheduling — 1=appraiser first name, 2=customer first name,
  //   3=reason/empty
  termin_verlegung_abgelehnt: (v) =>
    `Hello ${v['1'] ?? ''}, ${v['2'] ?? ''} has declined the rescheduling${v['3'] ? ` (reason: ${v['3']})` : ''}. The original appointment remains in place.`,

  // AAR-864 T34: KB escalation 48h before old appointment — 1=first name, 2=old date,
  //   3=old time, 4=portal link
  termin_verlegung_eskalation: (v) =>
    `Important, ${v['1'] ?? ''}: your appraiser has requested an appointment rescheduling, but the original appointment on ${v['2'] ?? ''} at ${v['3'] ?? ''} is coming up. Please decide NOW, otherwise the appraiser will travel to you in vain: ${v['4'] ?? ''}`,

  // AAR-864 T35: SV-WA — Customer has proactively rescheduled the appointment
  //   1=appraiser first name, 2=old date, 3=old time, 4=new date, 5=new time
  termin_verschoben_durch_kunde: (v) =>
    `Hello ${v['1'] ?? ''}, a customer has independently moved the appointment from ${v['2'] ?? ''} at ${v['3'] ?? ''} to ${v['4'] ?? ''} at ${v['5'] ?? ''}. Please remember to adjust your route.`,

}
