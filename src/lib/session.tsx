import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cargarBundle, derivarClave, descifrarCartas } from './crypto'
import { guardarClave, olvidarClave, recuperarClave } from './llavero'
import {
  cargarProgreso,
  guardarPrueba,
  guardarSorteo,
  guardarTirada,
  leerLocal,
  marcarAbierta,
  marcarDia,
  marcarPlanHecho,
  marcarTutorial,
  modoEfimero,
} from './progress'
import { planesDisponibles } from './estado'
import { ECONOMIA, casillas, casillasVivas, contar } from './economia'
import { SessionContext, type SessionState } from './session-context'
import { PROGRESO_VACIO, type Bundle, type Carta, type Plan, type Progreso, type Tirada } from './tipos'

/**
 * `?ensayo` en la dirección: la web se ve como el primer día (progreso vacío) y
 * nada de lo que se toque sale de la memoria. Se lee antes de montar nada para
 * que ni la primera lectura del progreso llegue a mirar el registro de verdad.
 */
const ENSAYO =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ensayo')

if (ENSAYO) modoEfimero(true)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [cartas, setCartas] = useState<Carta[]>([])
  const [clave, setClave] = useState<CryptoKey | null>(null)
  const [progreso, setProgreso] = useState<Progreso>(PROGRESO_VACIO)
  const [progresoCargado, setProgresoCargado] = useState(false)
  const [status, setStatus] = useState<SessionState['status']>('cargando')
  const [fallos, setFallos] = useState(0)
  const [error, setError] = useState<string>()
  const [modoRevision, setModoRevision] = useState(false)

  /** El progreso vive también aquí para no leerlo de localStorage en cada acción. */
  const ref = useRef(progreso)
  const fijar = useCallback((p: Progreso) => {
    ref.current = p
    setProgreso(p)
  }, [])

  const entrar = useCallback(
    async (b: Bundle, abiertas: Carta[], k: CryptoKey, revision = false) => {
      setCartas(abiertas)
      setClave(k)
      setModoRevision(revision)
      if (revision) {
        fijar(PROGRESO_VACIO)
        setStatus('abierto')
        setProgresoCargado(true)
        return
      }
      // Se pinta lo local ANTES de abrir, para que nadie vea la lista en blanco
      // ni se tome ninguna decisión con el progreso a medias.
      fijar(leerLocal(b.progressId))
      setStatus('abierto')
      fijar(await cargarProgreso(b.progressId))
      // El día se apunta con el progreso ya fusionado: si no, una racha vieja
      // que solo estuviera en la nube se rompería al volver de otro móvil.
      fijar(marcarDia(b.progressId, ref.current))
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
        let revision = false
        let abiertas = guardada ? await descifrarCartas(guardada, b) : null
        if (!abiertas && guardada && b.revision) {
          abiertas = await descifrarCartas(guardada, b.revision)
          revision = Boolean(abiertas)
        }
        if (cancelado) return
        if (abiertas && guardada) await entrar(b, abiertas, guardada, revision)
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
      let revision = false
      let abiertas = await descifrarCartas(k, bundle)
      if (!abiertas && bundle.revision) {
        const kr = await derivarClave(password.trim(), bundle.revision)
        const cartasRevision = await descifrarCartas(kr, bundle.revision)
        if (cartasRevision) {
          await guardarClave(kr)
          await entrar(bundle, cartasRevision, kr, true)
          return true
        }
      }
      if (!abiertas) {
        setFallos((n) => n + 1)
        return false
      }
      await guardarClave(k)
      await entrar(bundle, abiertas, k, revision)
      return true
    },
    [bundle, entrar],
  )

  const lock = useCallback(() => {
    void olvidarClave()
    setCartas([])
    setClave(null)
    setModoRevision(false)
    setFallos(0)
    setStatus('bloqueado')
  }, [])

  const id = bundle?.progressId ?? ''

  const abrir = useCallback(
    (cartaId: string) => {
      if (!modoRevision) fijar(marcarAbierta(id, ref.current, cartaId))
    },
    [id, fijar, modoRevision],
  )

  const aportarPrueba = useCallback(
    (cartaId: string, datos: { fotoId?: string; linea?: string }) => {
      if (!modoRevision) fijar(guardarPrueba(id, ref.current, cartaId, datos))
    },
    [id, fijar, modoRevision],
  )

  const girarBombo = useCallback(
    (cartaId: string): Plan | null => {
      const carta = cartas.find((c) => c.id === cartaId)
      if (!carta) return null
      const quedan = planesDisponibles(carta, ref.current)
      if (!quedan.length) return null
      const elegido = quedan[Math.floor(Math.random() * quedan.length)]
      if (!modoRevision) fijar(guardarSorteo(id, ref.current, cartaId, elegido.id))
      return elegido
    },
    [cartas, id, fijar, modoRevision],
  )

  const planHecho = useCallback(
    (cartaId: string, planId: string) => {
      if (!modoRevision) fijar(marcarPlanHecho(id, ref.current, cartaId, planId))
    },
    [id, fijar, modoRevision],
  )

  /**
   * Una tirada: cobra los créditos, elige entre las casillas que todavía tienen
   * carta y devuelve la que ha salido. null si no llega o si no queda ninguna.
   */
  const girarRuleta = useCallback((): Tirada | null => {
    // En revisión se puede girar sin pagar: es para ver cómo queda, y no se apunta.
    if (!modoRevision && contar(ref.current, cartas).saldo < ECONOMIA.tirada) return null
    const libres = casillasVivas(casillas(cartas, ref.current))
    if (!libres.length) return null
    const elegida = libres[Math.floor(Math.random() * libres.length)]
    const tirada: Tirada = {
      at: new Date().toISOString(),
      casilla: elegida.n,
      cartaId: elegida.cartaId!,
    }
    if (!modoRevision) fijar(guardarTirada(id, ref.current, tirada))
    return tirada
  }, [cartas, id, fijar, modoRevision])

  const tutorialVisto = useCallback(() => {
    if (!modoRevision) fijar(marcarTutorial(id, ref.current))
  }, [id, fijar, modoRevision])

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
      modoRevision,
      modoEnsayo: ENSAYO,
      unlock,
      lock,
      abrir,
      aportarPrueba,
      girarBombo,
      girarRuleta,
      planHecho,
      tutorialVisto,
    }),
    [
      status, progresoCargado, error, cartas, bundle, progreso, id, clave, fallos,
      unlock, lock, abrir, aportarPrueba, girarBombo, girarRuleta, planHecho, tutorialVisto,
      modoRevision,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
