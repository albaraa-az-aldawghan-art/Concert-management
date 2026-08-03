"use client";


/* خريطة تحديد موقع الحفلة. */
import { useEffect, useRef } from "react";
import { MapPin, Navigation } from "lucide-react";

interface Location {
  lat: number;
  lng: number;
  address: string;
}

interface LocationViewerProps {
  location: Location;
}

const RED_PIN = `
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
    <filter id="shadow" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
    <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.059 27.941 0 18 0z" fill="#dc2626" filter="url(#shadow)"/>
    <circle cx="18" cy="18" r="9" fill="white" opacity="0.95"/>
    <circle cx="18" cy="18" r="5" fill="#dc2626"/>
  </svg>
`;

export function LocationViewer({ location }: LocationViewerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        dragging: true,
        scrollWheelZoom: true,
        maxZoom: 19,
      }).setView([location.lat, location.lng], 17);

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
        html: RED_PIN,
        iconSize: [36, 48],
        iconAnchor: [18, 48],
        className: "",
      });

      L.marker([location.lat, location.lng], { icon }).addTo(map);
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={mapRef}
        style={{ width: "100%", height: "260px" }}
        className="rounded-xl overflow-hidden shadow-md border border-slate-200"
      />
      <div className="flex items-start justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
        <p className="text-xs text-slate-600 flex items-start gap-1.5">
          <MapPin size={13} className="mt-0.5 shrink-0 text-red-500" />
          {location.address}
        </p>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 bg-[#1C2D50] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#111D35] transition-colors shrink-0 shadow-sm"
        >
          <Navigation size={12} />
          توجه بالخريطة
        </a>
      </div>
    </div>
  );
}
