import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { formatearFecha } from '../lib/estado'
import { BarraCreditos } from '../components/Creditos'
import {
  ECONOMIA,
  casillas,
  casillasVivas,
  contar,
  cartaDelRegalo,
  misteriosGanados,
  movimientos,
  opcionesDeVerde,
  premioSinReclamar,
  type Casilla,
  type Cuenta,
  type Movimiento,
} from '../lib/economia'
import type { Tirada } from '../lib/tipos'

const VUELTAS = 5
const GIRO_MS = 4200

/** Punto del borde de la rueda para un ángulo en grados, contando desde arriba. */
function borde(grados: number, radio = 96): [number, number] {
  const rad = ((grados - 90) * Math.PI) / 180
  return [100 + radio * Math.cos(rad), 100 + radio * Math.sin(rad)]
}

function sector(i: number, ancho: number): string {
  const [x1, y1] = borde(i * ancho - ancho / 2)
  const [x2, y2] = borde(i * ancho + ancho / 2)
  return `M 100 100 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 96 96 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

function Rueda({ lista, giro, girando }: { lista: Casilla[]; giro: number; girando: boolean }) {
  const ancho = 360 / lista.length
  return (
    <div className="rueda">
      <svg viewBox="0 0 200 200" role="img" aria-label="La ruleta de las cartas de misterio">
        <g
          className="rueda__disco"
          style={{
            transform: `rotate(${giro}deg)`,
            transition: girando ? `transform ${GIRO_MS}ms cubic-bezier(0.12, 0.72, 0.12, 1)` : 'none',
          }}
        >
          <circle cx="100" cy="100" r="98" className="rueda__aro" />
          {lista.map((c, i) => (
            <path
              key={c.n}
              d={sector(i, ancho)}
              className={`rueda__hueco rueda__hueco--${c.color}${c.usada ? ' es-usada' : ''}`}
            />
          ))}
          {lista.map((c, i) => (
            <g key={c.n} transform={`rotate(${i * ancho} 100 100)`}>
              <text
                x="100"
                y="26"
                className={`rueda__n${c.color === 'regalo' ? ' rueda__n--regalo' : ''}${c.usada ? ' es-usada' : ''}`}
              >
                {c.n}
              </text>
              {/* Las que ya salieron llevan su tachón: no pueden repetirse. */}
              {c.usada && <line x1="92" y1="22" x2="108" y2="22" className="rueda__tachon" />}
            </g>
          ))}
          <circle cx="100" cy="100" r="34" className="rueda__centro" />
        </g>
        <polygon points="100,18 92,0 108,0" className="rueda__aguja" />
      </svg>
    </div>
  )
}

function Premio({ tirada, casilla }: { tirada: Tirada; casilla?: Casilla }) {
  const caja = useRef<HTMLElement>(null)

  // Si la rueda se quedó fuera de pantalla, que no tenga que buscar el premio.
  useEffect(() => {
    caja.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  return (
    <section ref={caja} className={`premio premio--${casilla?.color ?? 'negro'}`}>
      <p className="premio__eti">Ha salido</p>
      <p className="premio__n">{tirada.casilla}</p>
      <p className="premio__que">
        {casilla?.color === 'regalo'
          ? 'La casilla del regalo. Solo hay una en toda la rueda.'
          : casilla?.color === 'verde'
            ? 'Verde. De estas hay dos en toda la rueda.'
            : 'Hay un premio detrás de esa casilla.'}
      </p>
      <Link to={`/carta/${tirada.cartaId}`} className="boton">
        Ver qué es
      </Link>
    </section>
  )
}

const DE_GOLPE = 12

/** Todo lo que ha ganado y gastado, y de dónde ha salido cada crédito. */
function Historial({ movimientos, cuenta }: { movimientos: Movimiento[]; cuenta: Cuenta }) {
  const [tope, setTope] = useState(DE_GOLPE)
  const quedan = movimientos.length - tope

  return (
    <section className="ruleta__cuentas">
      <h2>Tu cuenta</h2>
      <div className="cuenta-resumen">
        <p>
          <span>Ganado</span>
          <strong>{cuenta.ganado}</strong>
        </p>
        <p>
          <span>Gastado</span>
          <strong>−{cuenta.gastado}</strong>
        </p>
        <p>
          <span>Te quedan</span>
          <strong className="es-saldo">{cuenta.saldo}</strong>
        </p>
      </div>

      {movimientos.length === 0 ? (
        <p className="apagado">Todavía no hay nada apuntado. Entra mañana y ya habrá.</p>
      ) : (
        <>
          <ul className="movimientos">
            {movimientos.slice(0, tope).map((m, i) => (
              <li key={`${m.at}-${i}`} className={m.creditos < 0 ? 'es-gasto' : undefined}>
                <span className="movimientos__que">{m.concepto}</span>
                <span className="movimientos__n">
                  {m.creditos > 0 ? '+' : '−'}
                  {Math.abs(m.creditos)}
                </span>
                <span className="movimientos__cuando">
                  {m.detalle && <em>{m.detalle} · </em>}
                  {formatearFecha(m.at)}
                </span>
              </li>
            ))}
          </ul>
          {quedan > 0 && (
            <button type="button" className="enlace" onClick={() => setTope(tope + DE_GOLPE * 2)}>
              ver {quedan} {quedan === 1 ? 'movimiento anterior' : 'movimientos anteriores'}
            </button>
          )}
        </>
      )}

      <details className="tarifas">
        <summary>Cómo se ganan créditos</summary>
        <ul className="cuentas">
          <li>
            <span>Entrar cada día</span>
            <span>
              {ECONOMIA.visita} + {ECONOMIA.rachaPaso} por día de racha
            </span>
          </li>
          <li>
            <span>Obtener una carta del mazo</span>
            <span>{ECONOMIA.carta}</span>
          </li>
          <li>
            <span>Obtener una carta que pide prueba</span>
            <span>{ECONOMIA.prueba}</span>
          </li>
          <li>
            <span>Obtener una carta de misterio ganada en la ruleta</span>
            <span>{ECONOMIA.misterio}</span>
          </li>
          <li>
            <span>Cada tirada de la ruleta</span>
            <span>−{ECONOMIA.tirada}</span>
          </li>
        </ul>
      </details>
    </section>
  )
}

export default function Ruleta() {
  const { status, cartas, progreso, girarRuleta, modoRevision } = useSession()
  const [giro, setGiro] = useState(0)
  const [girando, setGirando] = useState(false)
  const [premio, setPremio] = useState<Tirada | null>(null)
  const temporizador = useRef<number>(undefined)

  const rueda = useMemo(() => casillas(cartas, progreso), [cartas, progreso])
  /**
   * Lo que se dibuja. Mientras la rueda gira NO se toca: si no, la casilla que
   * va a salir se tacharía a mitad del giro y le contaría el final antes de
   * tiempo. Se pone al día justo cuando para.
   */
  const [pintada, setPintada] = useState(rueda)

  useEffect(() => {
    if (!girando && !premio) setPintada(rueda)
  }, [rueda, girando, premio])

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  if (status === 'cargando') return <main className="pantalla pantalla--centro">…</main>
  if (status !== 'abierto') return <Navigate to="/" replace />

  const lista = pintada
  const historial = movimientos(progreso, cartas)
  const cuenta = contar(progreso, cartas, historial)
  const vivas = casillasVivas(lista)
  const verdes = Math.round(opcionesDeVerde(vivas) * 100)
  const gastadas = lista.filter((c) => c.usada).length
  const regalo = cartaDelRegalo(cartas)
  const ganados = misteriosGanados(progreso).filter((t) => t.cartaId !== regalo?.id)
  const pendiente = premioSinReclamar(progreso, cartas)
  const puede = (modoRevision || cuenta.saldo >= ECONOMIA.tirada) && vivas.length > 0 && !girando

  function girar() {
    const tirada = girarRuleta()
    if (!tirada) return
    const i = lista.findIndex((c) => c.n === tirada.casilla)
    const ancho = 360 / lista.length
    // Se para en un punto cualquiera dentro de la casilla, no siempre clavado.
    const desvio = (Math.random() - 0.5) * ancho * 0.55
    const objetivo = (360 - i * ancho + 360) % 360 + desvio
    const vuelta = ((objetivo - (giro % 360)) + 360) % 360

    setPremio(null)
    setGirando(true)
    setGiro(giro + 360 * VUELTAS + vuelta)
    temporizador.current = window.setTimeout(() => {
      setGirando(false)
      setPremio(tirada)
    }, GIRO_MS)
  }

  return (
    <main className="pantalla">
      <Link to="/" className="volver">
        ← Todas las cartas
      </Link>

      <header className="ruleta__cabecera">
        <p className="ruleta__eti">Cartas de misterio</p>
        <h1>La ruleta</h1>
        <p className="apagado">
          Ninguna de estas se abre porque tú quieras: hay que ganárselas. Cada tirada cuesta{' '}
          {ECONOMIA.tirada} créditos.
        </p>
      </header>

      <BarraCreditos cuenta={cuenta} />

      <Rueda lista={lista} giro={giro} girando={girando} />

      {gastadas > 0 && (
        <p className="apagado ruleta__gastadas">
          {gastadas === 1
            ? 'La casilla tachada ya salió: no puede repetirse.'
            : `Las ${gastadas} casillas tachadas ya salieron: no pueden repetirse.`}
        </p>
      )}

      <div className="ruleta__mando">
        {vivas.length === 0 ? (
          <p className="apagado">
            Ahora mismo no queda ninguna casilla con carta. Iremos metiendo más, y esto se
            volverá a encender.
          </p>
        ) : (
          <>
            <button type="button" className="ruleta__boton" onClick={girar} disabled={!puede}>
              {girando ? 'Girando…' : `Girar · ${ECONOMIA.tirada} créditos`}
            </button>
            {!puede && !girando && (
              <p className="apagado">Te faltan {cuenta.faltan} créditos para la siguiente.</p>
            )}
            <p className="apagado ruleta__vivas">
              {vivas.length === 1
                ? '1 casilla tiene carta ahora mismo. No sabes cuál.'
                : `${vivas.length} casillas tienen carta ahora mismo. No sabes cuáles.`}
              {verdes > 0 && ` Las verdes salen menos: hoy, ${verdes} de cada 100 tiradas.`}
            </p>
          </>
        )}
        {modoRevision && <p className="modo-revision">Modo revisión · la tirada no se guarda</p>}
      </div>

      {premio && <Premio tirada={premio} casilla={lista.find((c) => c.n === premio.casilla)} />}

      {!premio && !girando && pendiente && (
        <section className="premio premio--regalo">
          <p className="premio__eti">Te queda por reclamar</p>
          <p className="premio__n">{pendiente.casilla}</p>
          <p className="premio__que">Salió y no lo has reclamado. Sigue ahí.</p>
          <Link to={`/carta/${pendiente.cartaId}`} className="boton">
            Reclamar el premio
          </Link>
        </section>
      )}

      {/* Mientras gira no se enseña: sería contarle el final antes de tiempo. */}
      {ganados.length > 0 && !premio && !girando && (
        <section className="ruleta__pendientes">
          <p className="ruleta__eti">Las que ya te han tocado</p>
          <ul className="lista">
            {ganados.map((t) => {
              const abierta = Boolean(progreso.opened[t.cartaId])
              return (
                <li key={t.at}>
                  <Link
                    to={`/carta/${t.cartaId}`}
                    className={`carta carta--${abierta ? 'abierta' : 'cerrada'}`}
                    data-tipo="misterio"
                  >
                    <span className="carta__marca" aria-hidden="true" />
                    <span className="carta__texto">
                      <span className="carta__tipo">Casilla {t.casilla}</span>
                      <span className="carta__titulo">
                        {abierta
                          ? (cartas.find((c) => c.id === t.cartaId)?.titulo ??
                            'Una carta de misterio')
                          : 'Todavía sin abrir'}
                      </span>
                      <span className="carta__fecha">La ganaste el {formatearFecha(t.at)}</span>
                    </span>
                    <span className="carta__estado">{abierta ? 'releer' : 'obtener'}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <Historial movimientos={historial} cuenta={cuenta} />
    </main>
  )
}
