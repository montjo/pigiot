import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { formatearFecha } from '../lib/estado'
import { cargarAncla, cargarFotoGrande, cargarPagina, subirFoto } from '../lib/fotos'
import type { FotoAlbum } from '../lib/tipos'

const POR_TANDA = 24

/**
 * Deja respirar al navegador. Recomprimir una foto de móvil bloquea el hilo un
 * buen rato, y sin esta pausa el «Subiendo 1 de 3…» no llega a pintarse: se
 * toca el botón y parece que no pasa nada.
 */
function respira(): Promise<void> {
  return new Promise((listo) => {
    requestAnimationFrame(() => setTimeout(listo, 0))
  })
}

/** La foto a pantalla completa. La grande se baja solo al llegar aquí. */
function Visor({
  fotos,
  i,
  alCerrar,
  alMover,
}: {
  fotos: FotoAlbum[]
  i: number
  alCerrar: () => void
  alMover: (n: number) => void
}) {
  const { clave } = useSession()
  const foto = fotos[i]
  const [grande, setGrande] = useState<string | null>(null)
  const [bajando, setBajando] = useState(true)

  useEffect(() => {
    if (!clave) return
    let vivo = true
    let suya: string | null = null
    setGrande(null)
    setBajando(true)
    cargarFotoGrande(clave, foto.id)
      .then((url) => {
        if (!vivo || !url) return
        suya = url
        setGrande(url)
      })
      .catch((e) => console.warn('No se ha podido cargar la foto grande.', e))
      // Si no llega la grande se queda la miniatura, pero sin decir «cargando»
      // para siempre: aquí se ve bien igual y no hay nada que esperar.
      .finally(() => {
        if (vivo) setBajando(false)
      })
    return () => {
      vivo = false
      if (suya) URL.revokeObjectURL(suya)
    }
  }, [clave, foto.id])

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') alCerrar()
      if (e.key === 'ArrowRight') alMover(1)
      if (e.key === 'ArrowLeft') alMover(-1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar, alMover])

  return (
    <div className="visor" role="dialog" aria-label="Foto a pantalla completa">
      <button type="button" className="visor__cerrar" onClick={alCerrar} aria-label="Cerrar">
        ✕
      </button>

      <div className="visor__marco">
        {/* Mientras baja la grande se ve la miniatura estirada: nunca un hueco negro. */}
        <img className="visor__foto" src={grande ?? foto.url} alt={foto.meta?.pie ?? ''} />
        {!grande && bajando && <p className="visor__cargando">cargando…</p>}
      </div>

      <div className="visor__pie">
        {foto.meta?.pie && <p className="visor__texto">{foto.meta.pie}</p>}
        <p className="visor__fecha">
          {formatearFecha(foto.at)}
          {foto.meta?.de && ` · la mandó ${foto.meta.de}`}
          {foto.meta?.cartaId && ' · de una carta'}
        </p>
      </div>

      {i > 0 && (
        <button
          type="button"
          className="visor__flecha visor__flecha--antes"
          onClick={() => alMover(-1)}
          aria-label="Anterior"
        >
          ‹
        </button>
      )}
      {i < fotos.length - 1 && (
        <button
          type="button"
          className="visor__flecha visor__flecha--despues"
          onClick={() => alMover(1)}
          aria-label="Siguiente"
        >
          ›
        </button>
      )}
    </div>
  )
}

export default function Album() {
  const { status, clave } = useSession()
  const [fotos, setFotos] = useState<FotoAlbum[]>([])
  const [cursor, setCursor] = useState<unknown | null>(null)
  const [hayMas, setHayMas] = useState(true)
  const [cargando, setCargando] = useState(false)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [subiendo, setSubiendo] = useState<{ va: number; de: number } | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const centinela = useRef<HTMLDivElement>(null)
  /** Todos los object URL creados, para soltarlos al salir. */
  const urls = useRef<string[]>([])

  const siguienteTanda = useCallback(
    async (desde?: unknown) => {
      if (!clave) return
      setCargando(true)
      try {
        const pagina = await cargarPagina(clave, POR_TANDA, desde)
        urls.current.push(...pagina.fotos.map((f) => f.url!))
        setFotos((antes) => {
          const vistas = new Set(antes.map((f) => f.id))
          return [...antes, ...pagina.fotos.filter((f) => !vistas.has(f.id))]
        })
        setCursor(pagina.cursor)
        setHayMas(pagina.hayMas)
      } catch (e) {
        console.warn('No se ha podido cargar el álbum.', e)
        setFallo('No se ha podido cargar el álbum. Puede ser la cobertura.')
        setHayMas(false)
      } finally {
        setCargando(false)
      }
    },
    [clave],
  )

  // Primera tanda: el ancla primero, que es la foto que abre todo esto.
  useEffect(() => {
    if (!clave) return
    let vivo = true
    cargarAncla(clave)
      .then((ancla) => {
        if (!vivo || !ancla) return
        urls.current.push(ancla.url!)
        setFotos((antes) => (antes.some((f) => f.id === ancla.id) ? antes : [ancla, ...antes]))
      })
      .catch(() => {})
    void siguienteTanda()
    return () => {
      vivo = false
    }
  }, [clave, siguienteTanda])

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  // Se va cargando al llegar al final, sin tener que pulsar nada.
  useEffect(() => {
    const marca = centinela.current
    if (!marca || !hayMas || cargando) return
    const vigia = new IntersectionObserver(
      (entradas) => {
        if (entradas[0].isIntersecting) void siguienteTanda(cursor ?? undefined)
      },
      { rootMargin: '400px' },
    )
    vigia.observe(marca)
    return () => vigia.disconnect()
  }, [hayMas, cargando, cursor, siguienteTanda])

  async function subir(lista: FileList) {
    if (!clave) return
    const archivos = [...lista]
    setFallo(null)
    setSubiendo({ va: 0, de: archivos.length })
    let fallidas = 0
    for (let n = 0; n < archivos.length; n++) {
      setSubiendo({ va: n + 1, de: archivos.length })
      await respira()
      try {
        await subirFoto(clave, archivos[n], {})
      } catch (e) {
        console.warn('No se ha podido subir una foto.', e)
        fallidas++
      }
    }
    setSubiendo(null)
    if (fallidas) setFallo(`${fallidas} de ${archivos.length} no han subido. Prueba otra vez con esas.`)
    // Se recarga desde el principio para que salgan arriba las que acaban de entrar.
    urls.current.forEach((u) => URL.revokeObjectURL(u))
    urls.current = []
    setFotos([])
    setCursor(null)
    setHayMas(true)
    void siguienteTanda()
  }

  if (status === 'cargando') return <main className="pantalla pantalla--centro">…</main>
  if (status !== 'abierto') return <Navigate to="/" replace />

  return (
    <main className="pantalla">
      <Link to="/" className="volver">
        ← Todas las cartas
      </Link>

      <header className="album__cabecera">
        <p className="album__eti">El álbum</p>
        <h1>Las fotos</h1>
        <p className="apagado">
          Lo que nos hemos ido mandando, y lo que vas dejando tú en las cartas. Se guardan
          cifradas: sin tu contraseña no hay forma de verlas.
        </p>

        <label className="album__subir">
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={Boolean(subiendo)}
            onChange={(e) => {
              if (e.target.files?.length) void subir(e.target.files)
              e.target.value = ''
            }}
          />
          <span>{subiendo ? `Subiendo ${subiendo.va} de ${subiendo.de}…` : 'Añadir fotos'}</span>
        </label>
        {fallo && <p className="error">{fallo}</p>}
      </header>

      {fotos.length > 0 ? (
        <ul className="album">
          {fotos.map((foto, n) => (
            <li key={foto.id} className={foto.ancla ? 'es-ancla' : undefined}>
              <button type="button" onClick={() => setAbierta(n)}>
                <img src={foto.url} alt={foto.meta?.pie ?? ''} loading="lazy" />
                {foto.ancla && <span className="album__ancla">la primera</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !cargando && (
          <p className="estado-vacio">
            Todavía no hay ninguna. Empieza tú: dale a «añadir fotos».
          </p>
        )
      )}

      <div ref={centinela} className="album__final">
        {cargando && <p className="apagado">cargando fotos…</p>}
        {!cargando && !hayMas && fotos.length > 0 && (
          <p className="apagado">
            {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}. Y las que queden por hacer.
          </p>
        )}
      </div>

      {abierta !== null && fotos[abierta] && (
        <Visor
          fotos={fotos}
          i={abierta}
          alCerrar={() => setAbierta(null)}
          alMover={(n) => setAbierta((i) => Math.min(fotos.length - 1, Math.max(0, (i ?? 0) + n)))}
        />
      )}
    </main>
  )
}
