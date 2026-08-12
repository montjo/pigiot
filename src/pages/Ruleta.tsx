import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { formatearFecha } from '../lib/estado'
import { BarraCreditos } from '../components/Creditos'
import {
  ECONOMIA,
  casillas,
  casillasVivas,
  contar,
  misteriosGanados,
  type Casilla,
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
            <text
              key={c.n}
              x="100"
              y="26"
              className="rueda__n"
              transform={`rotate(${i * ancho} 100 100)`}
            >
              {c.n}
            </text>
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
        {casilla?.color === 'verde'
          ? 'Verde. De estas hay dos en toda la rueda.'
          : 'Hay una carta detrás de esa casilla.'}
      </p>
      <Link to={`/carta/${tirada.cartaId}`} className="boton">
        Ver qué es
      </Link>
    </section>
  )
}

export default function Ruleta() {
  const { status, cartas, progreso, girarRuleta, modoRevision } = useSession()
  const [giro, setGiro] = useState(0)
  const [girando, setGirando] = useState(false)
  const [premio, setPremio] = useState<Tirada | null>(null)
  const temporizador = useRef<number>(undefined)

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  if (status === 'cargando') return <main className="pantalla pantalla--centro">…</main>
  if (status !== 'abierto') return <Navigate to="/" replace />

  const lista = casillas(cartas, progreso)
  const cuenta = contar(progreso, cartas)
  const vivas = casillasVivas(lista)
  const ganados = misteriosGanados(progreso)
  const sinAbrir = ganados.filter((t) => !progreso.opened[t.cartaId])
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
            </p>
          </>
        )}
        {modoRevision && <p className="modo-revision">Modo revisión · la tirada no se guarda</p>}
      </div>

      {premio && <Premio tirada={premio} casilla={lista.find((c) => c.n === premio.casilla)} />}

      {/* Mientras gira no se enseña: sería contarle el final antes de tiempo. */}
      {sinAbrir.length > 0 && !premio && !girando && (
        <section className="ruleta__pendientes">
          <p className="ruleta__eti">Te tocó y no la has abierto</p>
          <ul className="lista">
            {sinAbrir.map((t) => (
              <li key={t.at}>
                <Link to={`/carta/${t.cartaId}`} className="carta carta--cerrada" data-tipo="misterio">
                  <span className="carta__marca" aria-hidden="true" />
                  <span className="carta__texto">
                    <span className="carta__tipo">Casilla {t.casilla}</span>
                    <span className="carta__titulo">
                      {cartas.find((c) => c.id === t.cartaId)?.titulo ?? 'Una carta de misterio'}
                    </span>
                  </span>
                  <span className="carta__estado">abrir</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ruleta__cuentas">
        <h2>De dónde salen los créditos</h2>
        <ul className="cuentas">
          <li>
            <span>Entrar cada día</span>
            <span>
              {ECONOMIA.visita} + {ECONOMIA.rachaPaso} por día de racha
            </span>
          </li>
          <li>
            <span>Abrir una carta del mazo</span>
            <span>{ECONOMIA.carta}</span>
          </li>
          <li>
            <span>Cumplir lo que pide una carta</span>
            <span>{ECONOMIA.prueba}</span>
          </li>
          <li>
            <span>Hacer un plan del bombo</span>
            <span>{ECONOMIA.plan}</span>
          </li>
        </ul>
        {cuenta.racha > 0 && (
          <p className="apagado">
            Llevas {cuenta.racha} {cuenta.racha === 1 ? 'día' : 'días'} seguidos. Hoy te ha dado{' '}
            {cuenta.hoy}.
          </p>
        )}
        {ganados.length > 0 && (
          <p className="apagado">
            Has girado {ganados.length} {ganados.length === 1 ? 'vez' : 'veces'}; la última, el{' '}
            {formatearFecha(ganados[0].at)}.
          </p>
        )}
      </section>
    </main>
  )
}
