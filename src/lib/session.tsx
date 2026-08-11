import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { decryptLetters, loadBundle, type Letter, type LetterBundle } from './crypto'
import { loadProgress, markOpened, type Progress } from './progress'
import { SessionContext, type SessionState } from './session-context'

const PASSWORD_KEY = 'pigiot:key'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<LetterBundle | null>(null)
  const [letters, setLetters] = useState<Letter[]>([])
  const [progress, setProgress] = useState<Progress>({ opened: {} })
  const [status, setStatus] = useState<SessionState['status']>('cargando')
  const [error, setError] = useState<string>()

  const enter = useCallback(async (loaded: LetterBundle, unlocked: Letter[]) => {
    setLetters(unlocked)
    setStatus('abierto')
    setProgress(await loadProgress(loaded.progressId))
  }, [])

  useEffect(() => {
    let cancelled = false

    loadBundle()
      .then(async (loaded) => {
        if (cancelled) return
        setBundle(loaded)

        const saved = localStorage.getItem(PASSWORD_KEY)
        const unlocked = saved ? await decryptLetters(saved, loaded) : null
        if (cancelled) return

        if (unlocked) {
          await enter(loaded, unlocked)
        } else {
          localStorage.removeItem(PASSWORD_KEY)
          setStatus('bloqueado')
        }
      })
      .catch((cause: Error) => {
        if (cancelled) return
        setError(cause.message)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [enter])

  const unlock = useCallback(
    async (password: string) => {
      if (!bundle) return false
      const unlocked = await decryptLetters(password.trim(), bundle)
      if (!unlocked) return false
      localStorage.setItem(PASSWORD_KEY, password.trim())
      await enter(bundle, unlocked)
      return true
    },
    [bundle, enter],
  )

  const lock = useCallback(() => {
    localStorage.removeItem(PASSWORD_KEY)
    setLetters([])
    setStatus('bloqueado')
  }, [])

  const open = useCallback(
    async (letterId: string) => {
      if (!bundle) return
      setProgress(await markOpened(bundle.progressId, letterId))
    },
    [bundle],
  )

  const value = useMemo<SessionState>(
    () => ({
      status,
      error,
      letters,
      progress,
      progressId: bundle?.progressId ?? '',
      unlock,
      lock,
      open,
    }),
    [status, error, letters, progress, bundle, unlock, lock, open],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
