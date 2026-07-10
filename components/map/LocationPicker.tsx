"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapPin, Pencil, Search, Loader2 } from "lucide-react";

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

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // Al-Hofuf city center — Al-Ahsa governorate
      const defaultLat = value?.lat ?? 25.3660;
      const defaultLng = value?.lng ?? 49.5870;

      const map = L.map(mapRef.current, {
        maxZoom: 19,
        zoomControl: true,
      }).setView([defaultLat, defaultLng], 15);
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

      const icon = L.divIcon({
        html: BLUE_PIN,
        iconSize: [36, 48],
        iconAnchor: [18, 48],
        className: "",
      });

      if (value) {
        const marker = L.marker([value.lat, value.lng], { icon }).addTo(map);
        markerRef.current = marker;
      }

      map.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;

        if (markerRef.current) {
          (markerRef.current as { setLatLng: (latlng: [number, number]) => void }).setLatLng([lat, lng]);
        } else {
          const m = L.marker([lat, lng], { icon }).addTo(map);
          markerRef.current = m;
        }

        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`
          );
          const data = await res.json();
          if (data.display_name) address = data.display_name;
        } catch {}

        onChange({ lat, lng, address });
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setShowResults(false);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ar`
      );
      const data: SearchResult[] = await res.json();
      if (data.length === 0) {
        setResults([]);
        setShowResults(true);
        return;
      }
      await selectResult(data[0]);
      if (data.length > 1) {
        setResults(data.slice(1));
        setShowResults(true);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function selectResult(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setShowResults(false);
    setQuery(result.display_name.split(",")[0]);

    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current as import("leaflet").Map;
    map.setView([lat, lng], 17);

    if (markerRef.current) {
      (markerRef.current as { setLatLng: (latlng: [number, number]) => void }).setLatLng([lat, lng]);
    } else {
      const L = await import("leaflet");
      const icon = L.divIcon({
        html: BLUE_PIN,
        iconSize: [36, 48],
        iconAnchor: [18, 48],
        className: "",
      });
      const m = L.marker([lat, lng], { icon }).addTo(map);
      markerRef.current = m;
    }

    onChange({ lat, lng, address: result.display_name });
  }

  function handleClear() {
    if (markerRef.current) {
      (markerRef.current as { remove: () => void }).remove();
      markerRef.current = null;
    }
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowResults(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
            placeholder="ابحث عن منطقة أو عنوان..."
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1C2D50] focus:border-transparent"
          />
          {showResults && results.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
              <p className="px-4 py-2 text-xs font-semibold text-slate-400 border-b border-slate-100">نتائج أخرى</p>
              {results.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectResult(r)}
                  className="w-full text-right px-4 py-2.5 text-sm text-slate-700 hover:bg-[#EEF1F7] hover:text-[#1C2D50] border-b border-slate-100 last:border-0 transition-colors"
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
          {showResults && results.length === 0 && (
            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-50 px-4 py-3 text-sm text-slate-400">
              لا توجد نتائج
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="flex items-center gap-1.5 bg-[#1C2D50] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#111D35] transition-colors disabled:opacity-60"
        >
          {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          بحث
        </button>
      </div>

      <div style={{ position: "relative", zIndex: 0 }}>
        <div
          ref={mapRef}
          style={{ width: "100%", height: "300px" }}
          className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
        />
      </div>

      {value ? (
        <div className="flex items-start justify-between gap-2 bg-[#EEF1F7] border border-[#EEF1F7] rounded-xl px-3 py-2">
          <p className="text-xs text-slate-600 flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0 text-[#1C2D50]" />
            {value.address}
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-[#1C2D50] hover:text-[#111D35] shrink-0 font-semibold whitespace-nowrap"
          >
            <Pencil size={11} />
            تعديل
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-1">
          🔍 ابحث عن منطقة أو اضغط على الخريطة لتحديد الموقع
        </p>
      )}
    </div>
  );
}
