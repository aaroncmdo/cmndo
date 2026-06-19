-- AAR-939: Email-OTP-2FA retired (Aaron 2026-06-18). Der Code (send-email-code.ts)
-- wurde mit dem Wechsel auf Supabase-Phone-MFA in #2802 entfernt; diese Tabelle
-- war seither consumer-los. Email ist kein Supabase-MFA-Faktor (nur TOTP/Phone),
-- darum kommt der Pfad nicht zurueck. Magic-Links/Passwort-Reset per Mail bleiben.
DROP TABLE IF EXISTS public.email_otp_codes;
