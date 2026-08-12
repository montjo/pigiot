import type { Carta, EstadoCarta, Plan, Progreso } from './tipos'
import { pruebaVaDespues } from './tipos'

function yaLlego(carta: Carta, ahora: Date): boolean {
  if (!carta.desde) return true
  return ahora >= new Date(`${carta.desde}T00:00:00`)
}

/**
 * Una carta que ya está abierta lo está para siempre: si más adelante se le
 * añade una fecha o una prueba, no puede volverse inaccesible.
 */
export function estadoDeCarta(carta: Carta, progreso: Progreso, ahora = new Date(), revision = false): EstadoCarta {
  if (revision) return 'cerrada'
  const abierta = Boolean(progreso.opened[carta.id])
  const conPrueba = Boolean(progreso.pruebas[carta.id])

  if (abierta) {
    return carta.prueba && pruebaVaDespues(carta) && !conPrueba ? 'a-medias' : 'abierta'
  }
  if (!yaLlego(carta, ahora)) return 'futura'
  if (carta.prueba && !pruebaVaDespues(carta) && !conPrueba) return 'pide-prueba'
  return 'cerrada'
}

/** Las ocultas no aparecen hasta que llega su fecha. Las abiertas siempre aparecen. */
export function cartasVisibles(cartas: Carta[], progreso: Progreso, ahora = new Date(), revision = false): Carta[] {
  if (revision) return cartas
  return cartas.filter(
    (c) => Boolean(progreso.opened[c.id]) || !c.oculta || yaLlego(c, ahora),
  )
}

/** El plan que le tocó y todavía no han hecho, si lo hay. */
export function planPendiente(carta: Carta, progreso: Progreso): Plan | null {
  const sorteos = progreso.sorteos[carta.id]
  if (!sorteos?.length || !carta.bombo) return null
  const ultimo = sorteos[sorteos.length - 1]
  if (ultimo.hechoAt) return null
  return carta.bombo.find((p) => p.id === ultimo.planId) ?? null
}

/** Planes que aún no han salido nunca. */
export function planesDisponibles(carta: Carta, progreso: Progreso): Plan[] {
  const salidos = new Set((progreso.sorteos[carta.id] ?? []).map((s) => s.planId))
  return (carta.bombo ?? []).filter((p) => !salidos.has(p.id))
}

export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
