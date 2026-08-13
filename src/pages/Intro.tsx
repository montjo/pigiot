import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { cartasDelMazo, cartasVisibles } from '../lib/estado'
import { callar, hablar, vozDisponible } from '../lib/voz'
import type { TipoCarta } from '../lib/tipos'

/** A partir de este paso aparece el atajo, para que nadie se sienta preso. */
const PASO_DEL_ATAJO = 3

type Tarjeta = { tipo: TipoCarta; emoji: string; nombre: string; frase: string }

type Paso = {
  id: string
  /** Colorea la hoja con el color del tipo del que está hablando. */
  tipo?: TipoCarta
  eti: string
  titulo: string
  /** La frase dicha por él: «Me pasó algo.» */
  frase?: string
  lineas: string[]
  tarjetas?: Tarjeta[]
  cierre?: string
}

const TARJETAS: Tarjeta[] = [
  { tipo: 'normal', emoji: '🟢', nombre: 'Normal', frase: 'Me pasó algo.' },
  { tipo: 'aparte', emoji: '📖', nombre: 'Punto y aparte', frase: 'Mi vida cambió.' },
  { tipo: 'reto', emoji: '🏔️', nombre: 'Reto', frase: 'Me puse a prueba y lo conseguí.' },
  { tipo: 'misterio', emoji: '🎁', nombre: 'Misterio', frase: 'Ni idea de lo que hay dentro.' },
]

/** Un paso = una idea. Dos frases como máximo: en cuanto son tres, se salta. */
function pasos(cuantas: number): Paso[] {
  return [
    {
      id: 'hola',
      eti: 'Empezamos',
      titulo: 'Esto es un buzón',
      lineas: [
        `Un cajón con cartas dentro. Ahora mismo hay ${cuantas}, y seguiremos metiendo más.`,
        'Un minuto y sabes cómo va. Al acabar se abre el resto.',
      ],
    },
    {
      id: 'cuando',
      eti: 'Lo primero',
      titulo: 'Tú decides cuándo',
      lineas: [
        'Nadie te avisa. Cuando te pase lo que dice un título, entras y la abres.',
        'Cada carta se abre una vez. Después se queda ahí para releerla siempre que quieras.',
      ],
    },
    {
      id: 'tipos',
      eti: 'Hay cuatro clases',
      titulo: 'Cada carta lleva su marca',
      lineas: ['Por el color y la forma sabes qué tienes delante antes de abrirla.'],
      tarjetas: TARJETAS,
      cierre: 'Ahora una por una, rápido.',
    },
    {
      id: 'normal',
      tipo: 'normal',
      eti: 'Normal',
      frase: 'Me pasó algo.',
      titulo: 'Los hitos',
      lineas: [
        'Un logro, una experiencia o una emoción que te deja marca.',
        'No hace falta que sea enorme: basta con que haya un antes y un después. Son las que hacen avanzar la historia.',
      ],
    },
    {
      id: 'aparte',
      tipo: 'aparte',
      eti: 'Punto y aparte',
      frase: 'Mi vida cambió.',
      titulo: 'Los cambios de rumbo',
      lineas: [
        'Cuando algo te cambia la forma de vivir, de pensar o de imaginarte el futuro.',
        'Estas abren capítulo. Hay pocas y pesan: no las gastes antes de tiempo.',
      ],
    },
    {
      id: 'reto',
      tipo: 'reto',
      eti: 'Reto',
      frase: 'Me puse a prueba y lo conseguí.',
      titulo: 'Las que te pones tú',
      lineas: [
        'Pruebas que piden esfuerzo, cabeza, valentía o aguante.',
        'Se abren cuando decides salir de tu zona. Primero la lees y luego cumples: aquí la prueba va después.',
      ],
    },
    {
      id: 'misterio',
      tipo: 'misterio',
      eti: 'Misterio',
      frase: 'Ni idea de lo que hay dentro.',
      titulo: 'Las que hay que ganarse',
      lineas: [
        'Dentro hay una misión firmada por uno o varios de nosotros. Pero estas no se abren porque tú quieras: viven en una ruleta aparte.',
        'Cada tirada cuesta créditos, y los créditos se ganan entrando por aquí, abriendo cartas y cumpliendo lo que te piden. Cuando junte para una, giras y te toca la que te toque.',
      ],
    },
    {
      id: 'letra-pequena',
      eti: 'Dos cosas y ya',
      titulo: 'La letra pequeña',
      lineas: [
        'Algunas te piden una foto antes de abrirse. No comprobamos nada: nos fiamos de ti.',
        'Y sí, vemos qué abres y cuándo. Es por la ilusión de enterarnos, no te vamos a preguntar por ninguna.',
      ],
    },
    {
      id: 'final',
      eti: 'Ya está',
      titulo: 'El mazo es tuyo',
      lineas: [
        'Se acaba de abrir el resto. Algunas todavía esperan su fecha, pero ya las ves en la lista.',
        'Si un día se te olvida cómo iba esto, lo tienes en «Cómo va esto», arriba a la derecha.',
      ],
    },
  ]
}

/** Lo que se lee en voz alta. Sin emojis ni comillas, que se oyen fatal. */
function paraLeer(paso: Paso): string {
  const trozos = [paso.titulo, paso.frase, ...paso.lineas]
  if (paso.tarjetas) trozos.push(...paso.tarjetas.map((t) => `${t.nombre}: ${t.frase}`))
  if (paso.cierre) trozos.push(paso.cierre)
  return trozos.filter(Boolean).join(' ').replace(/[«»]/g, '')
}

export default function Intro() {
  const { status, cartas, progreso, tutorialVisto } = useSession()
  const navigate = useNavigate()
  const [n, setN] = useState(0)
  const [voz, setVoz] = useState(false)

  const lista = pasos(cartasVisibles(cartasDelMazo(cartas, progreso), progreso).length)
  const total = lista.length
  const paso = lista[n]
  const ultimo = n === total - 1
  const enVozAlta = paraLeer(paso)

  // Al llegar al final se desbloquea el mazo: el texto de ese paso ya lo canta.
  useEffect(() => {
    if (ultimo && status === 'abierto') tutorialVisto()
  }, [ultimo, status, tutorialVisto])

  useEffect(() => {
    if (!voz) {
      callar()
      return
    }
    hablar(enVozAlta)
    return callar
  }, [voz, enVozAlta])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [n])

  const avanzar = () => setN((i) => Math.min(i + 1, total - 1))
  const retroceder = () => setN((i) => Math.max(i - 1, 0))

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setN((i) => Math.min(i + 1, total - 1))
      if (e.key === 'ArrowLeft') setN((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [total])

  if (status === 'cargando') return <main className="pantalla pantalla--centro">…</main>
  if (status !== 'abierto') return <Navigate to="/" replace />

  return (
    <main className="pantalla" data-tipo={paso.tipo}>
      <section className="intro">
        <header className="intro__barra">
          <span className="intro__cuenta">
            {n + 1} de {total}
          </span>
          <span className="intro__barrita" aria-hidden="true">
            <span style={{ transform: `scaleX(${(n + 1) / total})` }} />
          </span>
          {vozDisponible && (
            <button
              type="button"
              className="intro__voz"
              aria-pressed={voz}
              onClick={() => setVoz((v) => !v)}
            >
              <span className="intro__voz-icono" aria-hidden="true">
                🔊
              </span>
              {voz ? 'en voz alta' : 'leérmelo'}
            </button>
          )}
        </header>

        <article className="intro__hoja" key={paso.id}>
          <p className="intro__eti">{paso.eti}</p>
          <h1>{paso.titulo}</h1>
          {paso.frase && <p className="intro__frase">«{paso.frase}»</p>}
          {paso.lineas.map((linea, i) => (
            <p key={i}>{linea}</p>
          ))}

          {paso.tarjetas && (
            <ul className="intro__tipos">
              {paso.tarjetas.map((t) => (
                <li key={t.tipo} data-tipo={t.tipo}>
                  <span className="intro__emoji" aria-hidden="true">
                    {t.emoji}
                  </span>
                  <span>
                    <strong>{t.nombre}</strong>
                    <em>«{t.frase}»</em>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {paso.cierre && <p className="apagado">{paso.cierre}</p>}
        </article>

        <footer className="intro__pie">
          {n === 0 ? (
            <>
              {vozDisponible && (
                <button
                  type="button"
                  onClick={() => {
                    setVoz(true)
                    avanzar()
                  }}
                >
                  Leédmelo en voz alta
                </button>
              )}
              <button
                type="button"
                className={vozDisponible ? 'intro__secundario' : ''}
                onClick={avanzar}
              >
                {vozDisponible ? 'Lo leo yo' : 'Empezar'}
              </button>
            </>
          ) : ultimo ? (
            <button type="button" onClick={() => navigate('/')}>
              Ver las cartas
            </button>
          ) : (
            <button type="button" onClick={avanzar}>
              Siguiente
            </button>
          )}

          <div className="intro__extras">
            {n > 0 && !ultimo && (
              <button type="button" className="enlace" onClick={retroceder}>
                atrás
              </button>
            )}
            {n >= PASO_DEL_ATAJO && !ultimo && (
              <button
                type="button"
                className="enlace"
                onClick={() => setN(total - 1)}
              >
                ya lo pillo, sáltatelo
              </button>
            )}
            {ultimo && (
              <Link to="/como-va" className="enlace">
                cómo va esto, con más detalle
              </Link>
            )}
          </div>
        </footer>
      </section>
    </main>
  )
}
