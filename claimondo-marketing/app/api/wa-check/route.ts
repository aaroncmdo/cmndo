import { NextResponse } from 'next/server'
import { isOnWhatsApp } from '@/lib/whatsapp/baileys-client'

// Lebendprüfung, ob eine eingetippte Nummer bei WhatsApp erreichbar ist.
//
// Aaron am 06.09.2026 zur Referenz bundesmann-invest: „die whatsapp prüfung ist
// auch gut". Deren Regel, wörtlich aus ihrer README: „Sie antwortet **immer mit
// 200** — der Zustand steht im Rumpf. Eine Prüfung darf das Formular nie
// aufhalten."
//
// ⭐ DAS IST DER GANZE PUNKT. Wenn der Baileys-Dienst hängt, der Token fehlt
// oder WhatsApp langsam ist, darf das NIEMALS dazu führen, dass jemand seinen
// Guide nicht bekommt. Deshalb gibt es hier keinen Fehlerpfad nach aussen:
// alles, was nicht eindeutig „ja" oder „nein" ist, heisst `unbekannt`, und
// `unbekannt` zeigt das Formular gar nicht erst an.
//
// Warum überhaupt: der Guide geht als Datei per WhatsApp raus. Ein Zahlendreher
// fiel bisher erst auf, wenn niemand antwortete — und dann sah es aus, als
// hätte der Kunde kein Interesse.

export const runtime = 'nodejs'
// Keine Zwischenspeicherung: die Antwort hängt an der eingegebenen Nummer.
export const dynamic = 'force-dynamic'

type Zustand = 'ja' | 'nein' | 'unbekannt'

export async function POST(req: Request) {
  const antwort = (status: Zustand) => NextResponse.json({ status })

  let phone = ''
  try {
    const body = (await req.json()) as { phone?: unknown }
    phone = String(body?.phone ?? '').trim()
  } catch {
    return antwort('unbekannt')
  }

  // Vorfilter, bevor irgendein Dienst angefasst wird: das Feld wird beim Tippen
  // geprüft, und die halbfertige Nummer ist der Normalfall, kein Fehler.
  const ziffern = phone.replace(/\D/g, '')
  if (ziffern.length < 8 || ziffern.length > 20) {
    return antwort('unbekannt')
  }

  try {
    const r = await isOnWhatsApp(phone)
    if (!r.ok) return antwort('unbekannt')
    return antwort(r.onWhatsApp ? 'ja' : 'nein')
  } catch {
    // Dienst weg, Zeitüberschreitung, was auch immer: das ist unsere Sache,
    // nicht die des Nutzers.
    return antwort('unbekannt')
  }
}
