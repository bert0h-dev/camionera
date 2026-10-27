import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Search, X } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './map.css'
import { Button } from '../ui/Button'
import { Input } from '../ui/Field'

// Mapas libres de OpenStreetMap; el crédito es obligatorio según su política de uso
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const MEXICO: [number, number] = [23.6, -102.5]

export interface LatLng {
  lat: number
  lng: number
}

export interface MapPoint extends LatLng {
  id: string
  title: string
  subtitle?: string
}

// Ícono propio en CSS: el ícono por defecto de Leaflet depende de imágenes que el empaquetador no resuelve
const pin = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 26] })

/** 6 decimales ≈ 10 cm, lo que acepta el servidor. */
const round = (n: number) => Math.round(n * 1e6) / 1e6

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }) })
  return null
}

function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
  }, [map, target])
  return null
}

function FitAll({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14)
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40] })
  }, [map, points])
  return null
}

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

/** Buscador de direcciones con Nominatim (OSM). Solo consulta al presionar Buscar: su límite es 1 por segundo. */
function AddressSearch({ initial, onPick }: { initial: string; onPick: (p: LatLng) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = async () => {
    // Sin texto propio se busca con el nombre y la ciudad de la terminal
    const q = query.trim() || initial
    if (q.length < 3) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'mx', limit: '5' })
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'es' },
      })
      if (!res.ok) throw new Error()
      setResults(await res.json())
    } catch {
      setError('No se pudo consultar el buscador de direcciones; marca el punto directamente en el mapa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            icon={Search}
            placeholder={initial || 'Buscar dirección o lugar…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void search()
              }
            }}
          />
        </div>
        <Button variant="secondary" loading={loading} onClick={() => void search()}>
          Buscar
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {results && (
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border text-sm">
          {results.length === 0 && (
            <li className="px-3 py-2 text-fg-muted">Sin resultados; intenta con otra dirección</li>
          )}
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-surface-muted"
                onClick={() => {
                  onPick({ lat: round(Number(r.lat)), lng: round(Number(r.lon)) })
                  setResults(null)
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ReverseResult {
  address?: Record<string, string>
}

/** Dirección corta y legible del punto: calle y número, colonia, CP, ciudad, estado. Null si no se pudo. */
async function reverseGeocode({ lat, lng }: LatLng): Promise<string | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '18' })
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'Accept-Language': 'es' },
    })
    if (!res.ok) return null
    const a = ((await res.json()) as ReverseResult).address
    if (!a) return null
    const street = [a.road ?? a.pedestrian, a.house_number].filter(Boolean).join(' ')
    const parts = [
      street,
      a.neighbourhood ?? a.suburb ?? a.quarter,
      a.postcode,
      a.city ?? a.town ?? a.village ?? a.municipality,
      a.state,
    ]
    return [...new Set(parts.filter(Boolean))].join(', ') || null
  } catch {
    return null
  }
}

/** Selector de ubicación: clic en el mapa o arrastrar el marcador; también se puede buscar una dirección. */
export function LocationPicker({
  value,
  onChange,
  onAddress,
  searchHint,
}: {
  value: LatLng | null
  onChange: (p: LatLng | null) => void
  /** Dirección del punto fijado (búsqueda inversa); no se llama si la consulta falla. */
  onAddress?: (address: string) => void
  searchHint: string
}) {
  const [target, setTarget] = useState<LatLng | null>(null)
  const [resolving, setResolving] = useState(false)
  const lastRequest = useRef(0)

  // Cada punto fijado (clic, soltar el marcador o resultado del buscador) consulta su dirección;
  // solo se usa la respuesta del último para que una lenta no pise a una más nueva
  const place = (p: LatLng) => {
    onChange(p)
    if (!onAddress) return
    const request = ++lastRequest.current
    setResolving(true)
    void reverseGeocode(p)
      .then((address) => request === lastRequest.current && address && onAddress(address))
      .finally(() => request === lastRequest.current && setResolving(false))
  }
  const pick = (p: LatLng) => {
    place(p)
    setTarget(p)
  }

  return (
    <div className="space-y-2">
      <AddressSearch initial={searchHint} onPick={pick} />
      <div className="h-72 overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={value ? [value.lat, value.lng] : MEXICO}
          zoom={value ? 16 : 5}
          className="size-full"
          scrollWheelZoom
        >
          <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} />
          <ClickToPlace onPick={place} />
          <FlyTo target={target} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pin}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = (e.target as L.Marker).getLatLng()
                  place({ lat: round(lat), lng: round(lng) })
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
        {value ? (
          <>
            <span className="flex items-center gap-2">
              <span className="font-data">
                {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
              </span>
              {resolving && <span>Buscando dirección…</span>}
            </span>
            <Button variant="ghost" size="sm" icon={X} onClick={() => onChange(null)}>
              Quitar ubicación
            </Button>
          </>
        ) : (
          <span>Haz clic en el mapa para marcar la ubicación exacta de la terminal</span>
        )}
      </div>
    </div>
  )
}

/** Mapa de solo lectura con varios puntos. */
export function PointsMap({ points, className }: { points: MapPoint[]; className?: string }) {
  return (
    <div className={className ?? 'h-[28rem] overflow-hidden rounded-xl border border-border'}>
      <MapContainer center={MEXICO} zoom={5} className="size-full" scrollWheelZoom>
        <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} />
        <FitAll points={points} />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pin}>
            <Popup>
              <div className="font-semibold">{p.title}</div>
              {p.subtitle && <div className="text-xs">{p.subtitle}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
