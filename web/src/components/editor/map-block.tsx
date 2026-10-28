import { useEffect, useMemo, useState } from "react"
import { ExternalLink, Loader2, Map as MapIcon, Search } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Block, MapData, MapProvider } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PROVIDERS: { value: MapProvider; label: string }[] = [
  { value: "mapbox", label: "Mapbox" },
  { value: "google", label: "Google Maps" },
  { value: "amap", label: "高德地图" },
  { value: "baidu", label: "百度地图" },
  { value: "osm", label: "OpenStreetMap" },
]


// WGS84 is used by Mapbox, Google and OpenStreetMap. Amap expects GCJ-02 and
// Baidu expects BD-09, so convert only for those providers.
function outOfChina(lat: number, lng: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}
function wgs84ToGcj02(lat: number, lng: number) {
  if (outOfChina(lat, lng)) return { lat, lng }
  const a = 6378245
  const ee = 0.00669342162296594323
  const transformLat = (x: number, y: number) => -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)) + (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3 + (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3 + (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3
  const transformLng = (x: number, y: number) => 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)) + (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3 + (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3 + (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = lat / 180 * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)
  return { lat: lat + dLat, lng: lng + dLng }
}
function gcj02ToBd09(lat: number, lng: number) {
  const z = Math.sqrt(lng * lng + lat * lat) + 2e-5 * Math.sin(lat * Math.PI * 3000 / 180)
  const theta = Math.atan2(lat, lng) + 3e-6 * Math.cos(lng * Math.PI * 3000 / 180)
  return { lat: z * Math.sin(theta) + 0.006, lng: z * Math.cos(theta) + 0.0065 }
}

let mapsPromise: Promise<{ mapboxToken?: string; googleMapsKey?: string; amapKey?: string; baiduMapAK?: string }> | null = null
function loadMapKeys() {
  mapsPromise ??= api.system.maps().then((info) => info.maps ?? {}).catch(() => ({}))
  return mapsPromise
}

export function MapBlock({
  block, readOnly, onUpdate, onKeyDown, onFocus,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  onFocus: () => void
}) {
  const data: MapData = block.map ?? { lat: 37.7749, lng: -122.4194, zoom: 12, label: "San Francisco", provider: "mapbox" }
  const [keys, setKeys] = useState<Awaited<ReturnType<typeof loadMapKeys>>>({})
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [draft, setDraft] = useState({ lat: String(data.lat), lng: String(data.lng), label: data.label ?? "", zoom: String(data.zoom ?? 12) })

  useEffect(() => { void loadMapKeys().then(setKeys) }, [])
  useEffect(() => {
    setDraft({ lat: String(data.lat), lng: String(data.lng), label: data.label ?? "", zoom: String(data.zoom ?? 12) })
  }, [data.lat, data.lng, data.label, data.zoom])

  const provider = data.provider ?? "mapbox"
  const gcj = wgs84ToGcj02(data.lat, data.lng)
  const bd = gcj02ToBd09(gcj.lat, gcj.lng)
  const encodedLabel = encodeURIComponent(data.label || `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`)
  const mapbox = keys.mapboxToken?.trim()
  const src = useMemo(() => {
    if (provider === "mapbox" && mapbox) {
      return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+6c5ce7(${data.lng},${data.lat})/${data.lng},${data.lat},${data.zoom ?? 12},0/900x420?access_token=${encodeURIComponent(mapbox)}`
    }
    if (provider === "google") {
      return keys.googleMapsKey
        ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(keys.googleMapsKey)}&q=${data.lat},${data.lng}&zoom=${data.zoom ?? 12}`
        : `https://www.google.com/maps?q=${data.lat},${data.lng}&z=${data.zoom ?? 12}&output=embed`
    }
    if (provider === "amap") {
      return `https://uri.amap.com/marker?position=${gcj.lng},${gcj.lat}&name=${encodedLabel}&coordinate=gaode&callnative=0&src=motion${keys.amapKey ? `&key=${encodeURIComponent(keys.amapKey)}` : ""}`
    }
    if (provider === "baidu") {
      return `https://api.map.baidu.com/marker?location=${bd.lat},${bd.lng}&title=${encodedLabel}&content=${encodedLabel}&output=html&src=webapp.motion${keys.baiduMapAK ? `&ak=${encodeURIComponent(keys.baiduMapAK)}` : ""}`
    }
    const delta = 360 / Math.pow(2, Math.max(2, Math.min(18, data.zoom ?? 12)))
    return `https://www.openstreetmap.org/export/embed.html?bbox=${data.lng - delta},${data.lat - delta * 0.6},${data.lng + delta},${data.lat + delta * 0.6}&layer=mapnik&marker=${data.lat},${data.lng}`
  }, [provider, data.lat, data.lng, data.zoom, data.label, encodedLabel, mapbox, keys.googleMapsKey, keys.amapKey, keys.baiduMapAK, gcj.lat, gcj.lng, bd.lat, bd.lng])

  function apply() {
    const lat = Number(draft.lat)
    const lng = Number(draft.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      toast.error(tr("Enter a valid latitude and longitude."))
      return
    }
    onUpdate({ map: { ...data, lat, lng, label: draft.label.trim(), zoom: Math.max(2, Math.min(18, Number(draft.zoom) || 12)) } })
  }

  async function search() {
    if (!query.trim() || searching) return
    setSearching(true)
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query.trim())}`, { headers: { Accept: "application/json" } })
      const results = await response.json() as { lat: string; lon: string; display_name?: string }[]
      if (!results[0]) {
        toast.error(tr("Place not found"))
        return
      }
      const next = { ...data, lat: Number(results[0].lat), lng: Number(results[0].lon), label: results[0].display_name?.split(",").slice(0, 2).join(", ") || query.trim() }
      onUpdate({ map: next })
      setQuery("")
    } catch {
      toast.error(tr("Could not search for this place"))
    } finally {
      setSearching(false)
    }
  }

  const openURL = provider === "amap"
    ? `https://uri.amap.com/marker?position=${gcj.lng},${gcj.lat}&name=${encodedLabel}`
    : provider === "baidu"
      ? `https://map.baidu.com/?latlng=${bd.lat},${bd.lng}&title=${encodedLabel}`
      : `https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lng}#map=${data.zoom ?? 12}/${data.lat}/${data.lng}`

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} onKeyDown={onKeyDown} onFocus={onFocus} className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
        <MapIcon className="size-3.5 text-brand" />
        <select
          value={provider}
          disabled={readOnly}
          aria-label={tr("Map provider")}
          onChange={(event) => onUpdate({ map: { ...data, provider: event.target.value as MapProvider } })}
          className="h-7 rounded border bg-background px-1.5 text-[11px] outline-none"
        >
          {PROVIDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{data.label || tr("Untitled location")}</span>
        {provider === "mapbox" && !mapbox && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">{tr("Mapbox token not configured")}</span>}
        <a href={openURL} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
          <ExternalLink className="size-3" /> {tr("Open")}
        </a>
      </div>

      <div className="relative">
        {provider === "mapbox" && mapbox ? (
          <img src={src} alt={data.label || "Map"} className="h-[320px] w-full object-cover" loading="lazy" />
        ) : (
          <iframe src={src} title={data.label || "Map"} loading="lazy" className="h-[320px] w-full border-0" referrerPolicy="no-referrer-when-downgrade" />
        )}
      </div>

      {!readOnly && (
        <div className="space-y-2 border-t border-border/60 p-2.5">
          <div className="flex gap-1.5">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (isImeKeyEvent(event)) return
                if (event.key === "Enter") { event.preventDefault(); void search() }
              }}
              placeholder={tr("Search a place or address…")}
              className="h-8 text-xs"
            />
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void search()} disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />} {tr("Search")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[1fr_1fr_0.7fr_auto]">
            <Input aria-label={tr("Latitude")} value={draft.lat} onChange={(event) => setDraft((current) => ({ ...current, lat: event.target.value }))} placeholder={tr("Latitude")} className="h-8 text-xs" />
            <Input aria-label={tr("Longitude")} value={draft.lng} onChange={(event) => setDraft((current) => ({ ...current, lng: event.target.value }))} placeholder={tr("Longitude")} className="h-8 text-xs" />
            <Input aria-label={tr("Zoom")} type="number" min={2} max={18} value={draft.zoom} onChange={(event) => setDraft((current) => ({ ...current, zoom: event.target.value }))} className="h-8 text-xs" />
            <Button type="button" size="sm" className="h-8 text-xs" onClick={apply}>{tr("Apply")}</Button>
          </div>
          <Input aria-label={tr("Map label")} value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder={tr("Map label")} className="h-8 text-xs" />
        </div>
      )}
    </div>
  )
}
