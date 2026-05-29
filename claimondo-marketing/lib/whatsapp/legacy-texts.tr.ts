import type { TemplateName } from './template-sids'

// Track B1 (Doc 48): Turkish translations of the WhatsApp legacy templates.
// Mirrors the de structure in legacy-texts.ts exactly; only the prose is translated.
export const TEMPLATES_TR: Partial<Record<TemplateName, (vars: Record<string, string>) => string>> = {
  fall_eroeffnet: (v) =>
    `Merhaba ${v['1'] ?? 'Müşteri'}, ${v['2'] ?? ''} numaralı dosyanız Claimondo'da açıldı. Geri kalan her şeyle biz ilgileniyoruz. Sorularınız olursa bu mesaja yanıt vermeniz yeterli.`,

  // AAR-312: Direkt nach SA — erklärt Zwei-Stufen-Zahlung + Sachverständiger kommt.
  // Variablen: 1=Vorname, 2=Portal-Link
  info_nach_sa: (v) =>
    `Kısa bir not daha, ${v['1'] ?? ''}: Hasar işlemleri için HİÇBİR ücret ödemiyorsunuz. Tüm masrafları karşı tarafın sigortası karşılıyor. Ödeme genellikle iki aşamada yapılır (ilk kısmi ödeme hızlıca, kalanı işlem tamamlandıktan sonra). Bilirkişi doğrudan size geliyor — hiçbir yere gitmenize gerek yok. Tüm güncellemeler portalınızda: ${v['2'] ?? ''}`,

  flowlink_versand: (v) =>
    // AAR-116: Template erwartet 6 Variablen (Vorname, SV-Vorname, SV-Nachname, Datum, Uhrzeit, FlowLink-URL)
    `Merhaba ${v['1'] ?? ''}, ${v['2'] ?? ''} ${v['3'] ?? ''} ile ${v['4'] ?? ''} tarihinde saat ${v['5'] ?? ''} için eksper randevunuz belirlendi. Hasar dosyanızı tamamlamak için lütfen şimdi formu doldurun: ${v['6'] ?? ''}`,

  sv_beauftragt: (v) =>
    `Güzel haberler, ${v['1'] ?? ''}! Sizin için eksper ${v['2'] ?? ''} görevlendirildi. Kısa süre içinde bir inceleme randevusu ayarlamak üzere sizinle iletişime geçecek.`,

  termin_bestaetigt: (v) =>
    `Merhaba ${v['1'] ?? ''}, ${v['2'] ?? ''} ile eksper randevunuz ${v['3'] ?? ''} için onaylandı. Bilirkişi doğrudan size geliyor. Lütfen aracın erişilebilir olduğundan emin olun.`,

  reminder_24h: (v) =>
    `Hatırlatma: Yarın saat ${v['2'] ?? ''}'de eksperiniz geliyor. Lütfen ruhsatı, kimlik kartını ve aracı hazır bulundurun, ${v['1'] ?? ''}.`,

  reminder_2h: (v) =>
    `${v['1'] ?? ''}, yaklaşık 2 saat içinde eksper randevunuz var. Bilirkişi size doğru yola çıktı.`,

  sv_tagesroute: (v) =>
    `Merhaba ${v['1'] ?? ''}, eksperiniz günlük güzergahına başladı ve yaklaşık ${v['2'] ?? ''} dakika içinde size ulaşacak.`,

  gutachten_fertig: (v) =>
    `Merhaba ${v['1'] ?? ''}, ekspertiz raporunuz hazırlandı ve şimdi hukuk bürosuna iletiliyor. Başka bir şey yapmanıza gerek yok.`,

  kanzlei_uebergabe: (v) =>
    `${v['1'] ?? ''}, dosyanız iş ortağı hukuk büromuza iletildi. Hukuk bürosu, hasar tazminatını karşı tarafın sigortası nezdinde sizin için takip edecek.`,

  as_gesendet: (v) =>
    `${v['1'] ?? ''}, sigortaya gönderilen takip yazısı iletildi. Şimdi sigortanın olağan işlem süresi başladı (4-6 hafta).`,

  regulierung_angekuendigt: (v) =>
    `Harika haberler, ${v['1'] ?? ''}! Sigorta hasar tazminatını duyurdu. Tutarı kontrol ediyor ve ayrıntılarla size geri döneceğiz.`,

  zahlung_eingegangen: (v) =>
    `${v['1'] ?? ''}, dosyanız için ${v['2'] ?? ''} EUR tutarında bir ödeme alındı. Ayrıntıları müşteri portalınızda bulabilirsiniz.`,

  fall_abgeschlossen: (v) =>
    `${v['1'] ?? ''}, hasar dosyanız başarıyla tamamlandı. Claimondo'ya duyduğunuz güven için çok teşekkür ederiz! Bir Google değerlendirmesi bırakırsanız çok memnun oluruz.`,

  eskalation_tag14: (v) =>
    `${v['1'] ?? ''}, sigorta takip yazımıza henüz yanıt vermedi (14 gün). Konuyu tekrar takibe aldık.`,

  eskalation_tag28: (v) =>
    `${v['1'] ?? ''}, sigortadan 28 gün boyunca yanıt gelmemesi üzerine resmi bir süre tanıma yazısı gönderdik.`,


  chat_fallback_kunde: (v) =>
    `Merhaba ${v['1'] ?? ''}, Claimondo portalınızda yeni bir mesajınız var. Lütfen gelen kutunuzu kontrol edin.`,

  chat_fallback_kb: (v) =>
    `${v['1'] ?? ''}'in dosyası için yeni müşteri mesajı. Lütfen portaldan yanıt verin.`,

  kuerzung_eingetragen: (v) =>
    `${v['1'] ?? ''}, sigorta bir kesinti yaptı. Ekibimiz buna itiraz edip etmeyeceğimizi inceliyor. Ayrıntılar müşteri portalında.`,

  sv_losgefahren: (v) =>
    `${v['1'] ?? ''}, eksperiniz yola çıktı ve yaklaşık ${v['2'] ?? ''} dakika içinde size ulaşacak.`,

  sv_fast_da: (v) =>
    `${v['1'] ?? ''}, eksperiniz ${v['2'] ?? ''} neredeyse size ulaştı. Lütfen aracı hazır bulundurun.`,

  sv_angekommen: (v) =>
    `${v['1'] ?? ''}, eksperiniz ${v['2'] ?? ''} geldi. İnceleme şimdi başlıyor.`,

  // ─── Neue Templates 24-27 (KFZ-181) ─────────────────────────────

  termin_storniert: (v) =>
    `Merhaba ${v['1'] ?? ''}, maalesef ${v['2'] ?? ''} ile ${v['3'] ?? ''} tarihindeki eksper randevusu iptal edilmek zorunda. Kısa süre içinde yeni bir randevuyla size geri döneceğiz.`,

  sv_verspaetet: (v) =>
    `Merhaba ${v['1'] ?? ''}, eksperiniz ${v['2'] ?? ''} yaklaşık ${v['3'] ?? ''} dakika gecikiyor. Anlayışınız için teşekkür ederiz.`,

  dokumente_nachreichen: (v) =>
    `Merhaba ${v['1'] ?? ''}, hasar dosyanız için aşağıdaki belgeler hâlâ eksik: ${v['2'] ?? ''}. Lütfen bunları buradan yükleyin: ${v['3'] ?? ''}`,

  rechnung_verfuegbar: (v) =>
    `Merhaba ${v['1'] ?? ''}, faturanız indirilmeye hazır: ${v['2'] ?? ''}`,

  // ─── KFZ-193: KB-Beratungstermin Templates ───────────────────────────────

  kb_termin_bestaetigt: (v) =>
    `Merhaba ${v['1'] ?? ''}, ${v['2'] ?? ''} tarihinde saat ${v['3'] ?? ''} için danışma randevunuz (${v['4'] === 'video' ? 'Görüntülü görüşme' : 'Telefon'}) onaylandı.${v['5'] ? ` Görüntülü görüşme bağlantısı: ${v['5']}` : ''} Claimondo ekibiniz`,

  kb_termin_reminder_24h: (v) =>
    `Hatırlatma: ${v['1'] ?? ''}, yarın ${v['2'] ?? ''} saat ${v['3'] ?? ''}'de Claimondo danışmanınızla bir danışma randevunuz var (${v['4'] === 'video' ? 'Görüntülü görüşme' : 'Telefon'}).`,

  kb_termin_reminder_1h: (v) =>
    `${v['1'] ?? ''}, yaklaşık 1 saat içinde (saat ${v['2'] ?? ''}) ${v['3'] ? `görüntülü görüşmeniz başlıyor. Bağlantı: ${v['3']}` : 'Claimondo danışmanınız sizi arayacak. Lütfen telefonunuzu hazır bulundurun.'}`,

  // KFZ-202: No-Show — CMM-39: zusaetzlich Re-Termin-FlowLink (Variable 2)
  no_show_kunde: (v) =>
    `Merhaba ${v['1'] ?? ''}, kararlaştırılan eksper randevusunda maalesef sizi bulamadık. Lütfen buradan yeni bir randevu seçin: ${v['2'] ?? ''}`,

  // KFZ-207: Eskalation Tag 21
  eskalation_tag21: (v) =>
    `Merhaba ${v['1'] ?? ''}, dosyanızı aktif olarak takip ediyoruz. Bugün sigortayla tekrar iletişime geçtik ve yakında bir yanıt bekliyoruz. Portal: ${v['2'] ?? ''}`,

  // KFZ-210: Nachbesichtigung
  nachbesichtigung_angefordert: (v) =>
    `Merhaba ${v['1'] ?? ''}, sigorta aracınızın yeniden incelenmesini talep etti. Lütfen portalınızdan bir randevu seçin: ${v['2'] ?? ''}`,
  nachbesichtigung_termin: (v) =>
    `Merhaba ${v['1'] ?? ''}, yeniden inceleme randevunuz ${v['2'] ?? ''} için onaylandı. Lütfen aracınızı hazır bulundurun. Ayrıntılar: ${v['3'] ?? ''}`,
  nachbesichtigung_abgeschlossen: (v) =>
    `Merhaba ${v['1'] ?? ''}, aracınızın yeniden incelemesi tamamlandı. Sonuç hazır olduğunda sizi bilgilendireceğiz. Portal: ${v['2'] ?? ''}`,

  // AAR-352: Multi-Slot-Upload-Anfrage — 1=Vorname, 2=Upload-Link
  dokumente_upload_anfrage: (v) =>
    `Merhaba ${v['1'] ?? ''}, lütfen talep edilen belgeleri aşağıdaki bağlantıdan yükleyin: ${v['2'] ?? ''} (bağlantı 7 gün geçerlidir). Claimondo`,

  // AAR-559 (C10): SV-Auftrag Technische Stellungnahme — 1=SV-Vorname, 2=Fall-Nr, 3=Grund-Kurzform, 4=Portal-Link
  stellungnahme_beauftragt: (v) =>
    `Merhaba ${v['1'] ?? ''}, ${v['2'] ?? ''} numaralı dosya için teknik bir görüş gerekiyor (gerekçe: ${v['3'] ?? ''}). Ayrıntılar portalda: ${v['4'] ?? ''}`,

  // AAR-561 (C12): SV-Konfrontations-Anfrage — 1=SV-Vorname, 2=Fall-Nr, 3=Termin, 4=Portal-Link
  sv_konfrontation_anfrage: (v) =>
    `Merhaba ${v['1'] ?? ''}, ${v['2'] ?? ''} numaralı dosya için ${v['3'] ?? ''} tarihinde sigortanın eksperiyle bir yüzleştirme randevusu planlandı. Lütfen portaldan onaylayın: ${v['4'] ?? ''}`,

  // AAR-561 (C12): Kunde-Zusage SV-Konfrontation — 1=Kunden-Vorname, 2=SV-Vorname, 3=Termin, 4=Portal-Link
  sv_konfrontation_bestaetigt_kunde: (v) =>
    `Merhaba ${v['1'] ?? ''}, eksperiniz ${v['2'] ?? ''} ${v['3'] ?? ''} tarihinde sigortanın eksperiyle yapılacak yeniden incelemede size eşlik edecek. Ayrıntılar: ${v['4'] ?? ''}`,

  // AAR-864 T31: SV bittet um Verlegung — 1=Vorname, 2=alterDatum, 3=alterUhrzeit,
  //   4=neuesDatum, 5=neuesUhrzeit, 6=SV-Vorname, 7=Portal-Link
  termin_verlegung_request: (v) =>
    `Merhaba ${v['1'] ?? ''}, eksperiniz ${v['6'] ?? ''} randevunun ertelenmesini rica ediyor. Randevu ${v['2'] ?? ''} saat ${v['3'] ?? ''} yerine ${v['4'] ?? ''} saat ${v['5'] ?? ''}'e taşınacak. Lütfen onaylayın veya reddedin: ${v['7'] ?? ''}`,

  // AAR-864 T32: Kunde hat Verlegung bestätigt — 1=SV-Vorname, 2=neuesDatum,
  //   3=neuesUhrzeit, 4=Kunden-Vorname
  termin_verlegung_bestaetigt: (v) =>
    `Merhaba ${v['1'] ?? ''}, ${v['4'] ?? ''} ertelemeyi onayladı. Yeni randevu: ${v['2'] ?? ''} saat ${v['3'] ?? ''}.`,

  // AAR-864 T33: Kunde hat Verlegung abgelehnt — 1=SV-Vorname, 2=Kunden-Vorname,
  //   3=Grund/leer
  termin_verlegung_abgelehnt: (v) =>
    `Merhaba ${v['1'] ?? ''}, ${v['2'] ?? ''} ertelemeyi reddetti${v['3'] ? ` (gerekçe: ${v['3']})` : ''}. Orijinal randevu geçerli kalıyor.`,

  // AAR-864 T34: KB-Eskalation 48h vor altem Termin — 1=Vorname, 2=alterDatum,
  //   3=alterUhrzeit, 4=Portal-Link
  termin_verlegung_eskalation: (v) =>
    `Önemli, ${v['1'] ?? ''}: Eksperiniz randevunun ertelenmesini talep etti, ancak ${v['2'] ?? ''} saat ${v['3'] ?? ''}'deki orijinal randevu yaklaşıyor. Lütfen ŞİMDİ karar verin, aksi takdirde eksper size boşuna gelir: ${v['4'] ?? ''}`,

  // AAR-864 T35: SV-WA — Kunde hat Termin proaktiv verschoben
  //   1=SV-Vorname, 2=alterDatum, 3=alterUhrzeit, 4=neuesDatum, 5=neuesUhrzeit
  termin_verschoben_durch_kunde: (v) =>
    `Merhaba ${v['1'] ?? ''}, bir müşteri ${v['2'] ?? ''} saat ${v['3'] ?? ''}'deki randevuyu kendi inisiyatifiyle ${v['4'] ?? ''} saat ${v['5'] ?? ''}'e taşıdı. Lütfen güzergahını buna göre güncellemeyi unutma.`,

}
