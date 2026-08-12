import { getDb } from './firebase'
import { PROGRESO_VACIO, type Apertura, type Progreso, type Sorteo } from './tipos'

const localKey = (progressId: string) => `pigiot:progress:${progressId}`

function dispositivo(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'otro'
}

export function leerLocal(progressId: string): Progreso {
  try {
    const raw = localStorage.getItem(localKey(progressId))
    return raw ? { ...PROGRESO_VACIO, ...(JSON.parse(raw) as Progreso) } : PROGRESO_VACIO
  } catch {
    return PROGRESO_VACIO
  }
}

function escribirLocal(progressId: string, progreso: Progreso) {
  try {
    localStorage.setItem(localKey(progressId), JSON.stringify(progreso))
  } catch {
    // Modo privado o almacenamiento lleno: Firestore sigue siendo la copia buena.
  }
}

/** Se queda con la fecha más antigua de cada apertura y une el resto de mapas. */
function fusionar(a: Progreso, b: Progreso): Progreso {
  const opened: Record<string, Apertura> = { ...a.opened }
  for (const [id, e] of Object.entries(b.opened ?? {})) {
    if (!opened[id] || e.at < opened[id].at) opened[id] = e
  }
  const sorteos: Record<string, Sorteo[]> = { ...a.sorteos }
  for (const [id, lista] of Object.entries(b.sorteos ?? {})) {
    const previos = sorteos[id] ?? []
    const porPlan = new Map(previos.map((s) => [s.planId, s]))
    for (const s of lista) {
      const anterior = porPlan.get(s.planId)
      porPlan.set(s.planId, anterior ? { ...anterior, ...s, hechoAt: anterior.hechoAt ?? s.hechoAt } : s)
    }
    sorteos[id] = [...porPlan.values()].sort((x, y) => (x.at < y.at ? -1 : 1))
  }
  return {
    opened,
    pruebas: { ...b.pruebas, ...a.pruebas },
    sorteos,
    visits: Math.max(a.visits ?? 0, b.visits ?? 0),
    lastSeen: (a.lastSeen ?? '') > (b.lastSeen ?? '') ? a.lastSeen : b.lastSeen,
    tutorialAt: a.tutorialAt ?? b.tutorialAt,
  }
}

/**
 * Nunca se hace await de una escritura en un camino que bloquee la interfaz:
 * con la caché persistente de Firestore, setDoc no resuelve mientras no hay red.
 */
function enviar(progressId: string, datos: Record<string, unknown>) {
  void (async () => {
    const db = await getDb()
    if (!db) return
    const { doc, setDoc } = await import('firebase/firestore')
    await setDoc(doc(db, 'progress', progressId), datos, { merge: true })
  })().catch((e) => console.warn('No se pudo guardar en la nube (se reintenta solo).', e))
}

/** Carga el progreso al entrar. Si la red tarda, se sigue con lo local. */
export async function cargarProgreso(progressId: string): Promise<Progreso> {
  const local = leerLocal(progressId)
  const db = await getDb()
  if (!db) return local

  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const snap = await Promise.race([
      getDoc(doc(db, 'progress', progressId)),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ])
    const remoto = snap?.exists() ? (snap.data() as Progreso) : PROGRESO_VACIO
    const fusionado = fusionar(local, { ...PROGRESO_VACIO, ...remoto })
    escribirLocal(progressId, fusionado)
    enviar(progressId, {
      opened: fusionado.opened,
      lastSeen: new Date().toISOString(),
    })
    return fusionado
  } catch (e) {
    console.warn('No se pudo leer el progreso remoto, se usa el local.', e)
    return local
  }
}

/** La primera apertura es la que cuenta. Recibe el progreso en memoria, no lo relee. */
export function marcarAbierta(progressId: string, actual: Progreso, cartaId: string): Progreso {
  if (actual.opened[cartaId]) return actual
  const entrada: Apertura = { at: new Date().toISOString(), device: dispositivo() }
  const next: Progreso = { ...actual, opened: { ...actual.opened, [cartaId]: entrada } }
  escribirLocal(progressId, next)
  enviar(progressId, { opened: { [cartaId]: entrada }, lastSeen: entrada.at })
  return next
}

export function guardarPrueba(
  progressId: string,
  actual: Progreso,
  cartaId: string,
  datos: { fotoId?: string; linea?: string },
): Progreso {
  if (actual.pruebas[cartaId]) return actual
  const entrada = { at: new Date().toISOString(), ...datos }
  const next: Progreso = { ...actual, pruebas: { ...actual.pruebas, [cartaId]: entrada } }
  escribirLocal(progressId, next)
  enviar(progressId, { pruebas: { [cartaId]: entrada } })
  return next
}

export function guardarSorteo(
  progressId: string,
  actual: Progreso,
  cartaId: string,
  planId: string,
): Progreso {
  const lista = actual.sorteos[cartaId] ?? []
  if (lista.some((s) => !s.hechoAt) || lista.some((s) => s.planId === planId)) return actual
  const next: Progreso = {
    ...actual,
    sorteos: { ...actual.sorteos, [cartaId]: [...lista, { planId, at: new Date().toISOString() }] },
  }
  escribirLocal(progressId, next)
  enviar(progressId, { sorteos: next.sorteos })
  return next
}

export function marcarPlanHecho(
  progressId: string,
  actual: Progreso,
  cartaId: string,
  planId: string,
): Progreso {
  const lista = actual.sorteos[cartaId] ?? []
  const next: Progreso = {
    ...actual,
    sorteos: {
      ...actual.sorteos,
      [cartaId]: lista.map((s) =>
        s.planId === planId && !s.hechoAt ? { ...s, hechoAt: new Date().toISOString() } : s,
      ),
    },
  }
  escribirLocal(progressId, next)
  enviar(progressId, { sorteos: next.sorteos })
  return next
}

export function marcarTutorial(progressId: string, actual: Progreso): Progreso {
  if (actual.tutorialAt) return actual
  const next = { ...actual, tutorialAt: new Date().toISOString() }
  escribirLocal(progressId, next)
  enviar(progressId, { tutorialAt: next.tutorialAt })
  return next
}

/** Para la trastienda: escucha los cambios en vivo. */
export async function verProgreso(
  progressId: string,
  alCambiar: (p: Progreso | null) => void,
): Promise<() => void> {
  const db = await getDb()
  if (!db) {
    alCambiar(leerLocal(progressId))
    return () => {}
  }
  const { doc, onSnapshot } = await import('firebase/firestore')
  return onSnapshot(
    doc(db, 'progress', progressId),
    (snap) => alCambiar(snap.exists() ? ({ ...PROGRESO_VACIO, ...snap.data() } as Progreso) : PROGRESO_VACIO),
    (e) => {
      console.error('Error escuchando el progreso.', e)
      alCambiar(null)
    },
  )
}
