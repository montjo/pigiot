import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cargarBundle, derivarClave, descifrarCartas } from './crypto'
import { guardarClave, olvidarClave, recuperarClave } from './llavero'
import {
  cargarProgreso,
  guardarPrueba,
  guardarSorteo,
  leerLocal,
  marcarAbierta,
  marcarPlanHecho,
  marcarTutorial,
} from './progress'
import { planesDisponibles } from './estado'
import { SessionContext, type SessionState } from './session-context'
import { PROGRESO_VACIO, type Bundle, type Carta, type Plan, type Progreso } from './tipos'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [cartas, setCartas] = useState<Carta[]>([])
  const [clave, setClave] = useState<CryptoKey | null>(null)
  const [progreso, setProgreso] = useState<Progreso>(PROGRESO_VACIO)
  const [progresoCargado, setProgresoCargado] = useState(false)
  const [status, setStatus] = useState<SessionState['status']>('cargando')
  const [fallos, setFallos] = useState(0)
  const [error, setError] = useState<string>()

  /** El progreso vive también aquí para no leerlo de localStorage en cada acción. */
  const ref = useRef(progreso)
  const fijar = useCallback((p: Progreso) => {
    ref.current = p
    setProgreso(p)
  }, [])

  const entrar = useCallback(
    async (b: Bundle, abiertas: Carta[], k: CryptoKey) => {
      setCartas(abiertas)
      setClave(k)
      // Se pinta lo local ANTES de abrir, para que nadie vea la lista en blanco
      // ni se tome ninguna decisión con el progreso a medias.
      fijar(leerLocal(b.progressId))
      setStatus('abierto')
      fijar(await cargarProgreso(b.progressId))
      setProgresoCargado(true)
    },
    [fijar],
  )

  useEffect(() => {
    let cancelado = false

    cargarBundle()
      .then(async (b) => {
        if (cancelado) return
        setBundle(b)
        const guardada = await recuperarClave()
        const abiertas = guardada ? await descifrarCartas(guardada, b) : null
        if (cancelado) return
        if (abiertas && guardada) await entrar(b, abiertas, guardada)
        else {
          await olvidarClave()
          setStatus('bloqueado')
        }
      })
      .catch((causa: Error) => {
        if (cancelado) return
        setError(causa.message)
        setStatus('error')
      })

    return () => {
      cancelado = true
    }
  }, [entrar])

  const unlock = useCallback(
    async (password: string) => {
      if (!bundle) return false
      const k = await derivarClave(password.trim(), bundle)
      const abiertas = await descifrarCartas(k, bundle)
      if (!abiertas) {
        setFallos((n) => n + 1)
        return false
      }
      await guardarClave(k)
      await entrar(bundle, abiertas, k)
      return true
    },
    [bundle, entrar],
  )

  const lock = useCallback(() => {
    void olvidarClave()
    setCartas([])
    setClave(null)
    setFallos(0)
    setStatus('bloqueado')
  }, [])

  const id = bundle?.progressId ?? ''

  const abrir = useCallback(
    (cartaId: string) => fijar(marcarAbierta(id, ref.current, cartaId)),
    [id, fijar],
  )

  const aportarPrueba = useCallback(
    (cartaId: string, datos: { fotoId?: string; linea?: string }) =>
      fijar(guardarPrueba(id, ref.current, cartaId, datos)),
    [id, fijar],
  )

  const girarBombo = useCallback(
    (cartaId: string): Plan | null => {
      const carta = cartas.find((c) => c.id === cartaId)
      if (!carta) return null
      const quedan = planesDisponibles(carta, ref.current)
      if (!quedan.length) return null
      const elegido = quedan[Math.floor(Math.random() * quedan.length)]
      fijar(guardarSorteo(id, ref.current, cartaId, elegido.id))
      return elegido
    },
    [cartas, id, fijar],
  )

  const planHecho = useCallback(
    (cartaId: string, planId: string) => fijar(marcarPlanHecho(id, ref.current, cartaId, planId)),
    [id, fijar],
  )

  const tutorialVisto = useCallback(() => fijar(marcarTutorial(id, ref.current)), [id, fijar])

  const value = useMemo<SessionState>(
    () => ({
      status,
      progresoCargado,
      error,
      cartas,
      pista: bundle?.pista,
      progreso,
      progressId: id,
      clave,
      fallos,
      unlock,
      lock,
      abrir,
      aportarPrueba,
      girarBombo,
      planHecho,
      tutorialVisto,
    }),
    [
      status, progresoCargado, error, cartas, bundle, progreso, id, clave, fallos,
      unlock, lock, abrir, aportarPrueba, girarBombo, planHecho, tutorialVisto,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
