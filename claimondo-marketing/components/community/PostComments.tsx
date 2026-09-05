'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CommentRow } from '@/lib/community/community-queries'
import { createCommunityComment, reportCommunityTarget } from '@/lib/community/community-actions'
import { requestCommentLogin, ensureUsername } from '@/lib/community/actions'
import { loadThread } from '@/lib/community/thread-loader'
import { PartnerRangPille } from './PartnerRangPille'

// ---------------------------------------------------------------------------
// Magic-Link-Auth helper (identisch mit CommentForm-Pattern)
// ---------------------------------------------------------------------------
type Stage = 'email' | 'username' | 'comment' | 'sent'

function MagicLinkGate({
  startStage,
  onAuthenticated,
}: {
  startStage: Stage
  onAuthenticated: () => void
}) {
  const [stage, setStage] = useState<Stage>(startStage)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const input =
    'w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none'
  const btn =
    'rounded-ios-sm bg-claimondo-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-claimondo-shield disabled:opacity-60'

  function run(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    onOk: () => void,
  ) {
    setError(null)
    start(async () => {
      const r = await action(fd)
      if (r.ok) onOk()
      else setError(r.error ?? 'Fehler')
    })
  }

  if (stage === 'sent')
    return (
      <p className="text-xs text-claimondo-shield">
        Wir haben dir einen Anmelde-Link per E-Mail geschickt. Bitte prüfe dein Postfach.
      </p>
    )

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        if (stage === 'email')
          run(requestCommentLogin, fd, () => {
            setStage('sent')
            // After magic-link auth user returns; for now just show 'sent'
          })
        else if (stage === 'username')
          run(ensureUsername, fd, () => {
            onAuthenticated()
          })
      }}
    >
      {stage === 'email' && (
        <input
          name="email"
          type="email"
          required
          placeholder="E-Mail für den Anmelde-Link"
          className={input}
        />
      )}
      {stage === 'username' && (
        <>
          <input name="username" required placeholder="Nutzername (3–24 Zeichen)" className={input} />
          <label className="flex items-start gap-2 text-[0.7rem] text-claimondo-shield">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            <span>
              Ich bin einverstanden, dass mein Nutzername und Kommentar gespeichert und öffentlich
              angezeigt werden.
            </span>
          </label>
        </>
      )}
      {error && <p className="text-[0.75rem] text-danger-strong">{error}</p>}
      <button type="submit" disabled={pending} className={btn}>
        {stage === 'email' ? 'Anmelde-Link senden' : 'Nutzername setzen'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Single comment row with optional reply form
// ---------------------------------------------------------------------------
function CommentItem({
  comment,
  replies,
  isLoggedIn,
  hasUsername,
  targetId,
  targetKind,
  onAfterSubmit,
}: {
  comment: CommentRow
  replies: CommentRow[]
  isLoggedIn: boolean
  hasUsername: boolean
  targetId: string
  targetKind: 'post' | 'wissen'
  onAfterSubmit: () => void
}) {
  const [showReply, setShowReply] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [reported, setReported] = useState(false)

  function submitReply() {
    if (!replyBody.trim()) return
    setError(null)
    start(async () => {
      const r = await createCommunityComment(targetKind, targetId, replyBody.trim(), comment.id)
      if (!r.ok) {
        setError(r.error ?? 'Fehler beim Antworten.')
      } else {
        setReplyBody('')
        setShowReply(false)
        await onAfterSubmit()
      }
    })
  }

  function reportItem() {
    start(async () => {
      const r = await reportCommunityTarget('comment', comment.id)
      if (r.ok) setReported(true)
      else setError(r.error ?? 'Melden fehlgeschlagen.')
    })
  }

  const input =
    'w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none'
  const btn =
    'rounded-ios-sm bg-claimondo-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-claimondo-shield disabled:opacity-60'

  return (
    <li className="space-y-2">
      <div className="rounded-ios-sm border border-claimondo-border bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-claimondo-navy">{comment.authorDisplay}</span>
            {comment.rang && <PartnerRangPille tier={comment.rang} />}
          </span>
          <span className="shrink-0 text-[0.65rem] text-claimondo-shield/75">
            {new Date(comment.createdAt).toLocaleDateString('de-DE')}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-claimondo-shield">
          {comment.body}
        </p>
        <div className="mt-2 flex items-center gap-3">
          {isLoggedIn && hasUsername && !showReply && (
            <button
              type="button"
              onClick={() => setShowReply(true)}
              className="text-[0.7rem] text-claimondo-shield/75 underline-offset-2 hover:text-claimondo-shield hover:underline"
            >
              Antworten
            </button>
          )}
          {reported ? (
            <span className="text-[0.7rem] text-claimondo-shield/75">Gemeldet – danke.</span>
          ) : (
            <button
              type="button"
              onClick={reportItem}
              disabled={pending}
              className="text-[0.7rem] text-claimondo-shield/75 underline-offset-2 hover:text-claimondo-shield hover:underline disabled:opacity-50"
            >
              Melden
            </button>
          )}
        </div>
        {showReply && (
          <div className="mt-2 space-y-2">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Antwort schreiben …"
              className={input}
            />
            {error && <p className="text-[0.75rem] text-danger-strong">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={submitReply} disabled={pending} className={btn}>
                {pending ? 'Sende…' : 'Antwort abschicken'}
              </button>
              <button
                type="button"
                onClick={() => setShowReply(false)}
                className="rounded-ios-sm px-3 py-2 text-xs text-claimondo-shield transition hover:bg-claimondo-bg"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Replies – 1 Ebene */}
      {replies.length > 0 && (
        <ul className="ml-6 space-y-1.5">
          {replies.map((r) => (
            <li
              key={r.id}
              className="rounded-ios-sm border border-claimondo-border/60 bg-claimondo-bg p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-claimondo-navy">{r.authorDisplay}</span>
                  {r.rang && <PartnerRangPille tier={r.rang} />}
                </span>
                <span className="shrink-0 text-[0.65rem] text-claimondo-shield/75">
                  {new Date(r.createdAt).toLocaleDateString('de-DE')}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-claimondo-shield">
                {r.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// PostComments — Haupt-Export
// ---------------------------------------------------------------------------
interface PostCommentsProps {
  targetId: string
  targetKind: 'post' | 'wissen'
  initialThread: { top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }
  isLoggedIn: boolean
  hasUsername: boolean
}

export function PostComments({
  targetId,
  targetKind,
  initialThread,
  isLoggedIn,
  hasUsername,
}: PostCommentsProps) {
  const router = useRouter()
  const [top, setTop] = useState<CommentRow[]>(initialThread.top)
  const [repliesByParent, setRepliesByParent] = useState<Record<string, CommentRow[]>>(
    initialThread.repliesByParent,
  )
  const [newBody, setNewBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  async function refreshThread() {
    const t = await loadThread(targetKind, targetId)
    setTop(t.top)
    setRepliesByParent(t.repliesByParent)
    router.refresh()
  }

  function submitTopLevel() {
    if (!newBody.trim()) return
    setError(null)
    start(async () => {
      const r = await createCommunityComment(targetKind, targetId, newBody.trim())
      if (!r.ok) {
        setError(r.error ?? 'Fehler beim Kommentieren.')
      } else {
        setNewBody('')
        await refreshThread()
      }
    })
  }

  const input =
    'w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none'
  const btn =
    'rounded-ios-sm bg-claimondo-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-claimondo-shield disabled:opacity-60'

  return (
    <div className="mt-3 border-t border-claimondo-border/50 pt-3">
      {/* Comment form – Magic-Link for non-logged-in */}
      {!isLoggedIn ? (
        <MagicLinkGate startStage="email" onAuthenticated={() => router.refresh()} />
      ) : !hasUsername ? (
        <MagicLinkGate startStage="username" onAuthenticated={() => router.refresh()} />
      ) : (
        <div className="mb-3 space-y-2">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Kommentar schreiben …"
            className={input}
          />
          <p className="text-[0.7rem] leading-relaxed text-claimondo-shield/75">
            Dein Kommentar erscheint <span className="font-medium">öffentlich</span> in der Community.
          </p>
          {error && <p className="text-[0.75rem] text-danger-strong">{error}</p>}
          <button type="button" onClick={submitTopLevel} disabled={pending} className={btn}>
            {pending ? 'Sende…' : 'Kommentar abschicken'}
          </button>
        </div>
      )}

      {/* Thread */}
      {top.length === 0 ? (
        <p className="text-xs text-claimondo-shield/75">Noch keine Kommentare – schreib den ersten.</p>
      ) : (
        <ul className="space-y-2">
          {top.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesByParent[c.id] ?? []}
              isLoggedIn={isLoggedIn}
              hasUsername={hasUsername}
              targetId={targetId}
              targetKind={targetKind}
              onAfterSubmit={refreshThread}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
