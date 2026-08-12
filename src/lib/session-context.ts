import { createContext, useContext } from 'react'
import type { Carta, Plan, Progreso, Tirada } from './tipos'

export type SessionState = {
  status: 'cargando' | 'bloqueado' | 'abierto' | 'error'
  /** Hasta que no es true, no se puede decidir nada a partir del progreso. */
  progresoCargado: boolean
  error?: string
  cartas: Carta[]
  pista?: string
  progreso: Progreso
  progressId: string
  clave: CryptoKey | null
  /** Cuántas veces ha fallado la contraseña en esta pantalla. */
  fallos: number
  modoRevision: boolean
  /** Ensayo: se ve la web desde cero y nada se guarda en ningún sitio. */
  modoEnsayo: boolean
  unlock: (password: string) => Promise<boolean>
  lock: () => void
  abrir: (cartaId: string) => void
  aportarPrueba: (cartaId: string, datos: { fotoId?: string; linea?: string }) => void
  girarBombo: (cartaId: string) => Plan | null
  /** Cobra una tirada y devuelve la casilla que ha salido. */
  girarRuleta: () => Tirada | null
  planHecho: (cartaId: string, planId: string) => void
  tutorialVisto: () => void
}

export const SessionContext = createContext<SessionState | null>(null)

export function useSession(): SessionState {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession se ha usado fuera de <SessionProvider>')
  return value
}
