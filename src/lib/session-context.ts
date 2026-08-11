import { createContext, useContext } from 'react'
import type { Letter } from './crypto'
import type { Progress } from './progress'

export type SessionState = {
  status: 'cargando' | 'bloqueado' | 'abierto' | 'error'
  error?: string
  letters: Letter[]
  progress: Progress
  progressId: string
  unlock: (password: string) => Promise<boolean>
  lock: () => void
  open: (letterId: string) => Promise<void>
}

export const SessionContext = createContext<SessionState | null>(null)

export function useSession(): SessionState {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession se ha usado fuera de <SessionProvider>')
  return value
}

/** Una carta con fecha futura no aparece todavía en la lista. */
export function isAvailable(letter: Letter, now = new Date()): boolean {
  if (!letter.unlockAt) return true
  return now >= new Date(`${letter.unlockAt}T00:00:00`)
}
