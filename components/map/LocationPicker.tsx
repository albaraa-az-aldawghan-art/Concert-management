"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapPin, Pencil, Search, Loader2, LocateFixed, ExternalLink } from "lucide-react";

interface Location {
  lat: number;
  lng: number;
  address: string;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface LocationPickerProps {
  value: Location | null;
  onChange: (location: Location | null) => void;
}

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LeafletCircle = import("leaflet").Circle;
type LeafletCircleMarker = import("leaflet").CircleMarker;

const BLUE_PIN = `
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
    <filter id="shadow" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
    <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.059 27.941 0 18 0z" fill="#1e40af" filter="url(#shadow)"/>
    <circle cx="18" cy="18" r="9" fill="white" opacity="0.95"/>
    <circle cx="18" cy="18" r="5" fill="#1e40af"/>
  </svg>
`;

// Bias results toward Al-Ahsa (Hofuf / Mubarraz) while still allowing the rest
// of Saudi Arabia: viewbox = left,top,right,bottom (lng,lat)
const AHSA_VIEWBOX = "48.9,25.9,49.9,25.0";

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const LRef = useRef<LeafletModule | null>(null);
  const geoDotRef = useRef<LeafletCircleMarker | null>(null);
  const geoCircleRef = useRef<LeafletCircle | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [locating, setLocating] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Suppress the autocomplete that would fire when we set the query programmatically
  const skipNextSearchRef = useRef(false);

  function makeIcon(L: LeafletModule) {
    return L.divIcon({ html: BLUE_PIN, iconSize: [36, 48], iconAnchor: [18, 48], className: "" });
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`
      );
      const data = await res.json();
      if (data.display_name) return data.display_name as string;
    } catch {}
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  // Place (or move) the selection pin. The pin is draggable like Google Maps —
  // dragging re-resolves the address automatically.
  function placeMarker(lat: number, lng: number) {
    const L = LRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { icon: makeIcon(L), draggable: true }).addTo(map);
      m.on("dragend", async () => {
        const p = m.getLatLng();
        const address = await reverseGeocode(p.lat, p.lng);
        onChange({ lat: p.lat, lng: p.lng, address });
      });
      markerRef.current = m;
    }
  }

  // Google-Maps-style blue dot + accuracy halo for the user's current position
  function showGeoDot(lat: number, lng: number, accuracy: number) {
    const L = LRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    if (geoDotRef.current) {
      geoDotRef.current.setLatLng([lat, lng]);
      geoCircleRef.current?.setLatLng([lat, lng]);
      geoCircleRef.current?.setRadius(accuracy);
    } else {
      geoCircleRef.current = L.circle([lat, lng], {
        radius: accuracy,
        color: "#4285F4",
        weight: 1,
        opacity: 0.4,
        fillColor: "#4285F4",
        fillOpacity: 0.12,
      }).addTo(map);
      geoDotRef.current = L.circleMarker([lat, lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2.5,
        fillColor: "#4285F4",
        fillOpacity: 1,
      }).addTo(map);
    }
  }

  function locateMe(selectAsLocation: boolean) {
    if (!navigator.geolocation) {
      if (selectAsLocation) alert("المتصفح لا يدعم تحديد الموقع");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        showGeoDot(lat, lng, accuracy);
        mapInstanceRef.current?.setView([lat, lng], 16);
        if (selectAsLocation) {
          placeMarker(lat, lng);
          const address = await reverseGeocode(lat, lng);
          onChange({ lat, lng, address });
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        if (selectAsLocation) alert("تعذر تحديد موقعك — تأكد من السماح للمتصفح بالوصول إلى الموقع");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;
      LRef.current = L;

      // Al-Hofuf city center — Al-Ahsa governorate
      const defaultLat = value?.lat ?? 25.366;
      const defaultLng = value?.lng ?? 49.587;

      const map = L.map(mapRef.current, { maxZoom: 19, zoomControl: true }).setView(
        [defaultLat, defaultLng],
        15
      );
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

      requestAnimationFrame(() => {
        map.invalidateSize();
        setTimeout(() => map.invalidateSize(), 200);
        setTimeout(() => map.invalidateSize(), 500);
      });

      if (value) {
        placeMarker(value.lat, value.lng);
      } else {
        // No location picked yet — center the map on the user's position
        locateMe(false);
      }

      map.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;
        placeMarker(lat, lng); // instant visual feedback
        const address = await reverseGeocode(lat, lng);
        onChange({ lat, lng, address });
      });
    });

    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        geoDotRef.current = null;
        geoCircleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live autocomplete (debounced 350ms, Google-Maps-style) ──
  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runSearch(q: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
        `&format=json&limit=6&accept-language=ar&countrycodes=sa&viewbox=${AHSA_VIEWBOX}`;
      const res = await fetch(url, { signal: ctrl.signal });
      const data: SearchResult[] = await res.json();
      setResults(data);
      setHighlight(data.length ? 0 : -1);
      setOpen(true);
    } catch {
      if (!ctrl.signal.aborted) {
        setResults([]);
        setOpen(true);
      }
    } finally {
      if (!ctrl.signal.aborted) setSearching(false);
    }
  }

  function selectResult(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setOpen(false);
    skipNextSearchRef.current = true;
    setQuery(result.display_name.split(",")[0]);

    const map = mapInstanceRef.current;
    if (map) {
      map.setView([lat, lng], 17);
      placeMarker(lat, lng);
    }
    onChange({ lat, lng, address: result.display_name });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlight >= 0 && results[highlight]) {
        selectResult(results[highlight]);
      } else if (query.trim().length >= 2) {
        runSearch(query.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleClear() {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search with live suggestions — the map sits in its own zIndex:0
          stacking context, so a small z-index is enough for the dropdown to
          cover it without floating above the sidebar/header */}
      <div className="relative z-10">
        <div className="relative">
          <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            placeholder="ابحث عن مكان... (مثال: سنابل الفضول، مطعم في الهفوف)"
            className="w-full border border-slate-200 rounded-xl pr-10 pl-10 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1C2D50] focus:border-transparent"
          />
          {searching && (
            <Loader2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
          )}
        </div>

        {open && (
          <div className="absolute top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            {results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">لا توجد نتائج — جرّب اسماً أدق أو أضف اسم المدينة</div>
            ) : (
              results.map((r, i) => {
                const [main, ...rest] = r.display_name.split(",");
                return (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} /* keep input focus so onBlur doesn't kill the click */
                    onClick={() => selectResult(r)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-right px-4 py-2.5 border-b border-slate-50 last:border-0 transition-colors flex items-start gap-2.5 ${
                      i === highlight ? "bg-[#EEF1F7]" : "bg-white"
                    }`}
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{main}</span>
                      {rest.length > 0 && (
                        <span className="block text-xs text-slate-400 truncate">{rest.join(",").trim()}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Map with floating "my location" button */}
      <div style={{ position: "relative", zIndex: 0 }}>
        <div
          ref={mapRef}
          style={{ width: "100%", height: "300px" }}
          className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
        />
        <button
          type="button"
          onClick={() => locateMe(true)}
          disabled={locating}
          title="موقعي الحالي"
          aria-label="تحديد موقعي الحالي"
          className="absolute bottom-3 right-3 z-[1000] bg-white hover:bg-slate-50 active:scale-95 border border-slate-200 rounded-full w-11 h-11 flex items-center justify-center shadow-lg transition-all disabled:opacity-60"
        >
          {locating ? (
            <Loader2 size={19} className="animate-spin text-[#1C2D50]" />
          ) : (
            <LocateFixed size={19} className="text-[#1C2D50]" />
          )}
        </button>
      </div>

      {value ? (
        <div className="flex items-start justify-between gap-2 bg-[#EEF1F7] border border-[#EEF1F7] rounded-xl px-3 py-2">
          <p className="text-xs text-slate-600 flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0 text-[#1C2D50]" />
            {value.address}
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${value.lat},${value.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold whitespace-nowrap"
            >
              <ExternalLink size={11} />
              خرائط Google
            </a>
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-xs text-[#1C2D50] hover:text-[#111D35] font-semibold whitespace-nowrap"
            >
              <Pencil size={11} />
              تعديل
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-1">
          🔍 ابحث عن مكان، أو اضغط على الخريطة، أو استخدم زر موقعي الحالي — ويمكنك سحب الدبوس لضبط الموقع بدقة
        </p>
      )}
    </div>
  );
}
