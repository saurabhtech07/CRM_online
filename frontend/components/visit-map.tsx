"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, Marker, Polyline } from "leaflet";
import type { SiteVisit } from "@/lib/types";

/**
 * Leaflet + OpenStreetMap (free, no API key). Shows the visit's start point, the
 * agent's latest position, and the path between them. Leaflet is imported
 * dynamically so it only loads in the browser.
 */
export function VisitMap({ visit }: { visit: SiteVisit | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const layersRef = useRef<(Marker | Polyline)[]>([]);

  useEffect(() => {
    let disposed = false;

    (async () => {
      const L = (await import("leaflet")).default;
      // Leaflet's default marker icons reference image files by URL; use inline
      // divIcons instead so nothing external is needed.
      if (disposed || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: false,
        }).setView([22.7196, 75.8577], 12); // default: Indore
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      // Clear old layers.
      layersRef.current.forEach((l) => l.remove());
      layersRef.current = [];

      if (!visit) return;

      const dot = (color: string, label: string) =>
        L.divIcon({
          className: "",
          html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)" title="${label}"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

      const pts: [number, number][] = visit.path.map((p) => [p.lat, p.lng]);
      const bounds: [number, number][] = [];

      // Start pin (green).
      if (visit.startLat != null && visit.startLng != null) {
        const m = L.marker([visit.startLat, visit.startLng], { icon: dot("#0ca30c", "Start") })
          .addTo(map)
          .bindPopup("Start");
        layersRef.current.push(m);
        bounds.push([visit.startLat, visit.startLng]);
      }

      // Path line.
      if (pts.length > 1) {
        const line = L.polyline(pts, { color: "#2a78d6", weight: 4, opacity: 0.8 }).addTo(map);
        layersRef.current.push(line);
        bounds.push(...pts);
      }

      // Current / last position (accent, larger) — the "agent is here" pin.
      const lat = visit.lastLat ?? visit.endLat ?? visit.startLat;
      const lng = visit.lastLng ?? visit.endLng ?? visit.startLng;
      if (lat != null && lng != null) {
        const live = visit.status === "Ongoing";
        const m = L.marker([lat, lng], {
          icon: dot(live ? "#eb6834" : "#4a3aa7", live ? "Agent (live)" : "Ended here"),
        })
          .addTo(map)
          .bindPopup(live ? `${visit.agentName} — live` : "Visit ended here");
        layersRef.current.push(m);
        bounds.push([lat, lng]);
      }

      if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
      // Leaflet needs a nudge if the container was hidden when created.
      setTimeout(() => map.invalidateSize(), 50);
    })();

    return () => {
      disposed = true;
    };
  }, [visit]);

  // Tear down on unmount.
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return (
    <div className="visit-map-wrap">
      <div ref={containerRef} className="visit-map" />
      {!visit && (
        <div className="visit-map-empty">Select a visit to see it on the map</div>
      )}
    </div>
  );
}
