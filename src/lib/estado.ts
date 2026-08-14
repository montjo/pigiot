import type { Carta, EstadoCarta, Plan, Progreso } from './tipos'
import { pruebaVaDespues } from './tipos'
import { haSalido } from './economia'

function yaLlego(carta: Carta, ahora: Date): boolean {
  if (!carta.desde) return true
  return ahora >= new Date(`${carta.desde}T00:00:00`)
}

/**
 * Al entrar solo hay una carta encima de la mesa: «La primera». El resto del
 * mazo está sellado hasta que termina la intro que sale al leerla.
 */
export function introPendiente(progreso: Progreso): boolean {
  return !progreso.tutorialAt
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
  if (carta.tipo !== 'primera' && introPendiente(progreso)) return 'sellada'
  // Las de misterio no se abren: se ganan en la ruleta.
  if (carta.tipo === 'misterio' && !haSalido(progreso, carta.id)) return 'sellada'
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

/**
 * El mazo. Las de misterio no salen mientras no le hayan tocado —esas viven en
 * la ruleta—, pero en cuanto salen en un giro entran en la lista como una más.
 * La de la casilla del regalo nunca: esa no llega a existir para el mazo.
 */
export function cartasDelMazo(cartas: Carta[], progreso: Progreso): Carta[] {
  return cartas.filter(
    (c) => c.casilla !== 'regalo' && (c.tipo !== 'misterio' || haSalido(progreso, c.id)),
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
