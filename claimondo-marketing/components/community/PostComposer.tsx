'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCommunityPost } from '@/lib/community/community-actions'
import { requestCommentLogin, ensureUsername } from '@/lib/community/actions'
import { B2B_TAGS } from '@/lib/community/tags'

type Stage = 'email' | 'username' | 'compose' | 'sent' | 'posted'

const input =
  'w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2.5 text-sm focus:border-claimondo-ondo focus:outline-none'
const btn =
  'rounded-ios-sm bg-claimondo-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-claimondo-shield disabled:opacity-60'

interface PostComposerProps {
  isLoggedIn: boolean
  hasUsername: boolean
}

export function PostComposer({ isLoggedIn, hasUsername }: PostComposerProps) {
  const router = useRouter()
  const initial: Stage = !isLoggedIn ? 'email' : !hasUsername ? 'username' : 'compose'
  const [stage, setStage] = useState<Stage>(initial)
  const [body, setBody] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

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

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  function submitPost() {
    if (!body.trim()) {
      setError('Bitte einen Beitragstext eingeben.')
      return
    }
    setError(null)
    start(async () => {
      const r = await createCommunityPost(body.trim(), selectedTags)
      if (r.ok) {
        setBody('')
        setSelectedTags([])
        setStage('posted')
        router.refresh()
      } else {
        setError(r.error ?? 'Fehler beim Veröffentlichen.')
      }
    })
  }

  if (stage === 'sent')
    return (
      <p className="rounded-ios-md border border-claimondo-border bg-white p-4 text-sm text-claimondo-shield">
        Wir haben dir einen Anmelde-Link per E-Mail geschickt. Bitte prüfe dein Postfach.
      </p>
    )

  if (stage === 'posted')
    return (
      <p className="rounded-ios-md border border-claimondo-border bg-white p-4 text-sm text-claimondo-shield">
        Dein Beitrag wurde veröffentlicht. Danke für deine Beteiligung!
      </p>
    )

  return (
    <div className="rounded-ios-md border border-claimondo-border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-claimondo-navy">Beitrag verfassen</h3>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (stage === 'email') {
            const fd = new FormData(e.currentTarget)
            run(requestCommentLogin, fd, () => setStage('sent'))
          } else if (stage === 'username') {
            const fd = new FormData(e.currentTarget)
            run(ensureUsername, fd, () => {
              setStage('compose')
              router.refresh()
            })
          }
        }}
      >
        {stage === 'email' && (
          <>
            <p className="text-xs text-claimondo-shield">
              Zum Verfassen eines Beitrags bitte zuerst anmelden:
            </p>
            <input
              name="email"
              type="email"
              required
              placeholder="Ihre E-Mail-Adresse"
              className={input}
            />
          </>
        )}

        {stage === 'username' && (
          <>
            <p className="text-xs text-claimondo-shield">Bitte wähle einen Nutzernamen:</p>
            <input
              name="username"
              required
              placeholder="Nutzername (3–24 Zeichen)"
              className={input}
            />
            <label className="flex items-start gap-2 text-[0.75rem] text-claimondo-shield">
              <input type="checkbox" name="consent" required className="mt-0.5" />
              <span>
                Ich bin einverstanden, dass mein Nutzername und meine Beiträge gespeichert und
                öffentlich angezeigt werden.
              </span>
            </label>
          </>
        )}

        {stage === 'compose' && (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="Was möchten Sie mit der Community teilen? (max. 5.000 Zeichen)"
              className={input}
            />
            <p className="text-[0.7rem] leading-relaxed text-claimondo-shield/75">
              Dein Beitrag erscheint <span className="font-medium">öffentlich</span> in der Community.
            </p>
            <div>
              <p className="mb-1.5 text-[0.75rem] font-medium text-claimondo-navy">Themen (optional):</p>
              <div className="flex flex-wrap gap-1.5">
                {B2B_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={[
                      'rounded-ios-sm px-2.5 py-1 text-xs font-medium transition',
                      selectedTags.includes(tag)
                        ? 'bg-claimondo-navy text-white'
                        : 'border border-claimondo-border text-claimondo-shield hover:border-claimondo-ondo hover:text-claimondo-ondo',
                    ].join(' ')}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[0.7rem] leading-relaxed text-claimondo-shield/70">
              Bitte beachte die{' '}
              <a href="/community-regeln" className="underline hover:text-claimondo-shield">
                Community-Regeln
              </a>{' '}
              – keine sensiblen Daten oder fremde personenbezogene Informationen.
            </p>
          </>
        )}

        {error && <p className="text-[0.8125rem] text-danger-strong">{error}</p>}

        {stage !== 'compose' && (
          <button type="submit" disabled={pending} className={btn}>
            {stage === 'email'
              ? 'Anmelde-Link senden'
              : stage === 'username'
                ? 'Nutzername setzen'
                : ''}
          </button>
        )}
      </form>

      {stage === 'compose' && (
        <div className="mt-3">
          <button
            type="button"
            onClick={submitPost}
            disabled={pending || !body.trim()}
            className={btn}
          >
            {pending ? 'Veröffentliche…' : 'Beitrag veröffentlichen'}
          </button>
        </div>
      )}
    </div>
  )
}
