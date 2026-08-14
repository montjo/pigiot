/**
 * Los créditos de la ruleta.
 *
 * El saldo NO se guarda en ningún sitio: se recalcula siempre a partir de lo
 * que ya había en el progreso (días que ha entrado, cartas abiertas, pruebas
 * cumplidas) menos lo que se ha gastado en tiradas. Así el registro sigue
 * siendo de solo añadir, dos dispositivos no se pisan el saldo, y no hay ningún
 * número que pueda quedarse a medias entre el móvil y la nube.
 *
 * Todos los números están aquí arriba para poder recalibrarlos de una pasada.
 */
import type { Carta, ColorCasilla, Progreso, Tirada } from './tipos'

export const ECONOMIA = {
  /** Lo que cuesta un giro. */
  tirada: 200,
  /** Por entrar un día cualquiera. */
  visita: 10,
  /** Extra por cada día seguido encadenado… */
  rachaPaso: 4,
  /** …hasta este día de racha (a partir de ahí ya no sube: 10 + 5×4 = 30). */
  rachaTope: 5,
  /** Por abrir una carta del mazo (las de misterio no cuentan: son el premio). */
  carta: 25,
  /** Por cumplir lo que pedía una carta (la foto, o contárnoslo). */
  prueba: 50,
  /** Por abrir una carta de misterio de las que se ganan en la ruleta. */
  misterio: 30,
  /** Al terminar la intro, para que la primera tirada sea inmediata. */
  bienvenida: 200,
  /**
   * Lo que pesa una casilla verde en el sorteo frente a una de color, que pesa
   * 1. Con 0,35 y tres cartas de color más una verde, la verde sale un 10 % de
   * las veces; cuantas más cartas de color haya, más rara se vuelve, hasta
   * acercarse al 5 % de una ruleta de verdad. Nunca es imposible.
   */
  pesoVerde: 0.35,
}

// Con estos números: una semana entrando cada día son 150 créditos
// (10+14+18+22+26+30+30), o sea una tirada cada nueve o diez días si no hace
// nada más. Cumplir un reto adelanta media semana. La bienvenida regala la
// primera tirada nada más acabar la intro.

/** 'AAAA-MM-DD' en la hora del aparato, que es la que él vive. */
export function hoy(ahora = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`
}

function esElDiaSiguiente(dia: string, siguiente: string): boolean {
  const d = new Date(`${dia}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return hoy(d) === siguiente
}

/** Lo que vale entrar cuando llevas `racha` días seguidos. */
export function valorDelDia(racha: number): number {
  return ECONOMIA.visita + Math.min(Math.max(racha, 1) - 1, ECONOMIA.rachaTope) * ECONOMIA.rachaPaso
}

/** Una línea del historial: lo que dio o lo que costó, y cuándo. */
export type Movimiento = {
  /** ISO, solo para ordenar. Los días no tienen hora: se les pone la de apertura. */
  at: string
  concepto: string
  /** El título de la carta, el plan, la casilla que salió… */
  detalle?: string
  /** Positivo si gana, negativo si gasta. */
  creditos: number
}

/**
 * Todo lo que ha movido créditos, de lo más nuevo a lo más viejo. De aquí sale
 * también el saldo: si el historial y el saldo se calcularan por separado,
 * antes o después dejarían de cuadrar.
 */
export function movimientos(progreso: Progreso, cartas: Carta[]): Movimiento[] {
  const carta = (id: string) => cartas.find((c) => c.id === id)
  const titulo = (id: string) => carta(id)?.titulo ?? 'una carta'
  const esMisterio = (id: string) => carta(id)?.tipo === 'misterio'
  const lista: Movimiento[] = []

  if (progreso.tutorialAt) {
    lista.push({
      at: progreso.tutorialAt,
      concepto: 'De bienvenida',
      detalle: 'por enterarte de cómo va esto',
      creditos: ECONOMIA.bienvenida,
    })
  }

  const dias = Object.keys(progreso.dias ?? {}).sort()
  let racha = 0
  dias.forEach((dia, i) => {
    racha = i > 0 && esElDiaSiguiente(dias[i - 1], dia) ? racha + 1 : 1
    lista.push({
      at: `${dia}T00:00:00`,
      concepto: 'Entraste',
      detalle: racha > 1 ? `${racha} días seguidos` : undefined,
      creditos: valorDelDia(racha),
    })
  })

  for (const [id, apertura] of Object.entries(progreso.opened)) {
    const misterio = esMisterio(id)
    lista.push({
      at: apertura.at,
      concepto: misterio ? 'Obtuviste una carta de misterio' : 'Obtuviste una carta',
      detalle: titulo(id),
      creditos: misterio ? ECONOMIA.misterio : ECONOMIA.carta,
    })
  }

  for (const [id, prueba] of Object.entries(progreso.pruebas)) {
    // Abrirla con la salida de emergencia no cuenta como haber cumplido.
    if (prueba.saltada) continue
    lista.push({
      at: prueba.at,
      concepto: 'Obtuviste una carta que pedía prueba',
      detalle: titulo(id),
      creditos: ECONOMIA.prueba,
    })
  }

  for (const tirada of Object.values(progreso.tiradas ?? {})) {
    lista.push({
      at: tirada.at,
      concepto: 'Tirada de la ruleta',
      detalle: `salió la ${tirada.casilla}`,
      creditos: -ECONOMIA.tirada,
    })
  }

  return lista.sort((a, b) => (a.at < b.at ? 1 : -1))
}

export type Cuenta = {
  /** Lo que puede gastar ahora mismo. */
  saldo: number
  ganado: number
  gastado: number
  /** Días seguidos contando hasta el último día que entró. */
  racha: number
  /** Lo que le ha dado entrar hoy, para poder enseñárselo. */
  hoy: number
  tiradasListas: number
  /** Cuánto le falta para la siguiente tirada (0 si ya puede). */
  faltan: number
}

export function contar(progreso: Progreso, cartas: Carta[], historial?: Movimiento[]): Cuenta {
  const lista = historial ?? movimientos(progreso, cartas)
  const ganado = lista.filter((m) => m.creditos > 0).reduce((t, m) => t + m.creditos, 0)
  const gastado = -lista.filter((m) => m.creditos < 0).reduce((t, m) => t + m.creditos, 0)
  const saldo = Math.max(0, ganado - gastado)

  const dias = Object.keys(progreso.dias ?? {}).sort()
  let racha = 0
  for (let i = 0; i < dias.length; i++) {
    racha = i > 0 && esElDiaSiguiente(dias[i - 1], dias[i]) ? racha + 1 : 1
  }
  const hoyEsta = dias.length > 0 && dias[dias.length - 1] === hoy()

  return {
    saldo,
    ganado,
    gastado,
    racha: hoyEsta ? racha : 0,
    hoy: hoyEsta ? valorDelDia(racha) : 0,
    tiradasListas: Math.floor(saldo / ECONOMIA.tirada),
    faltan: saldo >= ECONOMIA.tirada ? 0 : ECONOMIA.tirada - saldo,
  }
}

// --- La rueda ---------------------------------------------------------------

export type Casilla = {
  /** Lo que se lee en la rueda: '0', '00', '7'… */
  n: string
  color: ColorCasilla
  /** La carta que hay detrás, si ya hay una escrita para esta casilla. */
  cartaId?: string
  /** Ya salió: esa casilla está gastada. */
  usada?: boolean
}

/**
 * Una casilla por carta de misterio: ocho de color (cuatro rojas y cuatro
 * negras) y las dos verdes enfrentadas, como en la de verdad. Si algún día hay
 * más cartas que casillas, se alargan las dos mitades por igual para que las
 * verdes sigan cayendo una frente a la otra.
 */
const RUEDA: { n: string; color: ColorCasilla }[] = [
  { n: '0', color: 'verde' },
  { n: '1', color: 'rojo' },
  { n: '2', color: 'negro' },
  { n: '3', color: 'rojo' },
  { n: '4', color: 'negro' },
  { n: '00', color: 'verde' },
  { n: '5', color: 'rojo' },
  { n: '6', color: 'negro' },
  { n: '7', color: 'rojo' },
  { n: '8', color: 'negro' },
]

/**
 * Reparte las cartas de misterio por la rueda. El orden es el de sus ids, para
 * que una carta no cambie de casilla al añadir otra más adelante.
 */
export function casillas(cartas: Carta[], progreso: Progreso): Casilla[] {
  const misterios = cartas.filter((c) => c.tipo === 'misterio').sort((a, b) => (a.id < b.id ? -1 : 1))
  const verdes = misterios.filter((c) => c.casilla === 'verde')
  const resto = misterios.filter((c) => c.casilla !== 'verde')
  const usadas = new Set(Object.values(progreso.tiradas ?? {}).map((t) => t.cartaId))

  return RUEDA.map((hueco) => {
    const carta = hueco.color === 'verde' ? verdes.shift() : resto.shift()
    return {
      ...hueco,
      cartaId: carta?.id,
      usada: carta ? usadas.has(carta.id) : false,
    }
  })
}

/** Las que pueden salir: tienen carta detrás y todavía no han salido. */
export function casillasVivas(lista: Casilla[]): Casilla[] {
  return lista.filter((c) => c.cartaId && !c.usada)
}

/** Lo que pesa una casilla en el sorteo. Las verdes, menos: son las raras. */
export function peso(casilla: Casilla): number {
  return casilla.color === 'verde' ? ECONOMIA.pesoVerde : 1
}

/**
 * Elige una casilla al azar entre las que quedan, con la verde pesando menos
 * que las de color pero sin llegar a ser imposible.
 */
export function elegirCasilla(vivas: Casilla[]): Casilla | null {
  if (!vivas.length) return null
  const total = vivas.reduce((t, c) => t + peso(c), 0)
  let dado = Math.random() * total
  for (const casilla of vivas) {
    dado -= peso(casilla)
    if (dado <= 0) return casilla
  }
  return vivas[vivas.length - 1]
}

/** Lo que sale la verde ahora mismo, en tanto por uno, para poder contarlo. */
export function opcionesDeVerde(vivas: Casilla[]): number {
  const total = vivas.reduce((t, c) => t + peso(c), 0)
  if (!total) return 0
  return vivas.filter((c) => c.color === 'verde').reduce((t, c) => t + peso(c), 0) / total
}

/** Las cartas de misterio que ya le han tocado, de la más nueva a la más vieja. */
export function misteriosGanados(progreso: Progreso): Tirada[] {
  return Object.values(progreso.tiradas ?? {}).sort((a, b) => (a.at < b.at ? 1 : -1))
}

export function haSalido(progreso: Progreso, cartaId: string): boolean {
  return Object.values(progreso.tiradas ?? {}).some((t) => t.cartaId === cartaId)
}
