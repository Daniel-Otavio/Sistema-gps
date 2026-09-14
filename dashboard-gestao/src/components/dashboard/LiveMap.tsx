import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const card = "rounded-xl border border-border bg-card shadow-card";

export function LiveMap({ items = [], geojson, risks = [] }: ApiValue) {
  const host = useRef<HTMLDivElement | null>(null),
    mapRef = useRef<ApiValue>(null),
    layerRef = useRef<ApiValue>(null),
    hasInitialFitRef = useRef(false),
    routeViewRef = useRef("");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!host.current || mapRef.current) return;
      const L = await import("leaflet");
      if (!alive || !host.current) return;
      const map = L.map(host.current, {
        zoomControl: false,
        attributionControl: true,
        maxZoom: 18,
        zoomSnap: 1,
      }).setView([-19.394, -40.064], 13);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxNativeZoom: 18,
          maxZoom: 18,
          attribution:
            "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics and the GIS User Community",
          className: "operational-map__satellite",
        },
      ).addTo(map);
      L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          maxNativeZoom: 18,
          maxZoom: 18,
          pane: "overlayPane",
          attribution: "Labels © Esri",
          className: "operational-map__labels",
        },
      ).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setTimeout(() => map.invalidateSize(), 50);
    })();
    return () => {
      alive = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current,
        group = layerRef.current;
      if (!map || !group) return;
      const L = await import("leaflet");
      if (cancelled) return;
      group.clearLayers();
      const bounds: ApiValue[] = [];
      for (const x of items) {
        const lat = +x.lat,
          lon = +(x.lon ?? x.lng);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const updatedAt = new Date(x.ultima_atualizacao || 0);
        const online =
          Number.isFinite(+updatedAt) &&
          Date.now() - +updatedAt <= 5 * 60 * 1000;
        L.circleMarker([lat, lon], {
          radius: 8,
          color: "#e2e8f0",
          weight: 2,
          fillColor: online ? "#22c55e" : "#f59e0b",
          fillOpacity: 1,
        })
          .bindTooltip(
            `${String(x.placa || x.nome || "Veículo")}<br>${x.rota_nome || (x.origem && x.destino ? `${x.origem} → ${x.destino}` : "Posição atual")}<br>${online ? "GPS online" : "Última posição conhecida"}`,
            {
              direction: "top",
            },
          )
          .addTo(group);
        bounds.push([lat, lon]);
      }
      for (const risk of risks) {
        const restriction = risk.dados?.restricao || risk.restricao || risk;
        const lat = Number(restriction.lat);
        const lon = Number(restriction.lng ?? restriction.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const critical = risk.nivel === "critico";
        const color = critical ? "#ef4444" : "#f59e0b";
        L.circle([lat, lon], {
          radius: Number(restriction.raio_metros || 180),
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.14,
        }).addTo(group);
        L.circleMarker([lat, lon], {
          radius: critical ? 10 : 8,
          color: "#fff",
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindTooltip(
            String(
              restriction.nome || restriction.rodovia || "Restrição à frente",
            ),
            { direction: "top" },
          )
          .addTo(group);
      }
      let shape = geojson;
      for (let pass = 0; pass < 2 && typeof shape === "string"; pass++) {
        try {
          shape = JSON.parse(shape);
        } catch {
          shape = null;
        }
      }
      if (["LineString", "MultiLineString"].includes(shape?.type)) {
        shape = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: shape }],
        };
      } else if (shape?.type === "Feature") {
        shape = { type: "FeatureCollection", features: [shape] };
      }
      if (shape?.features?.length) {
        const routeLayer = L.geoJSON(shape, {
          style: (feature: ApiValue) => {
            const tipo = feature?.properties?.tipo;
            return {
              color:
                tipo === "trajeto_realizado"
                  ? "#22c55e"
                  : tipo === "gps_bruto"
                    ? "#94a3b8"
                    : "#38bdf8",
              weight: tipo === "gps_bruto" ? 3 : 5,
              opacity: tipo === "gps_bruto" ? 0.55 : 0.95,
              dashArray: tipo === "gps_bruto" ? "6 7" : undefined,
              lineCap: "round",
              lineJoin: "round",
            };
          },
          onEachFeature: (feature: ApiValue, layer: ApiValue) => {
            const label =
              feature?.properties?.rota_nome || feature?.properties?.placa;
            if (label)
              layer.bindTooltip(
                `${label}${feature?.properties?.placa ? ` · ${feature.properties.placa}` : ""}`,
                { sticky: true },
              );
          },
        }).addTo(group);
        const b = routeLayer.getBounds();
        if (b.isValid()) {
          const routeView = JSON.stringify(shape);
          if (routeViewRef.current !== routeView) {
            map.fitBounds(b, { padding: [45, 45] });
            routeViewRef.current = routeView;
            hasInitialFitRef.current = true;
          }
          for (const feature of shape.features || []) {
            const geometry = feature?.geometry;
            let coordinates: ApiValue[] = geometry?.coordinates || [];
            if (geometry?.type === "MultiLineString")
              coordinates = coordinates.flat();
            const first = coordinates[0],
              last = coordinates[coordinates.length - 1];
            if (!Array.isArray(first) || !Array.isArray(last)) continue;
            L.circleMarker([first[1], first[0]], {
              radius: 7,
              color: "#fff",
              weight: 2,
              fillColor: "#22c55e",
              fillOpacity: 1,
            })
              .bindTooltip(
                `Início · ${feature?.properties?.placa || feature?.properties?.rota_nome || "rota"}`,
                { direction: "top" },
              )
              .addTo(group);
            L.circleMarker([last[1], last[0]], {
              radius: 7,
              color: "#fff",
              weight: 2,
              fillColor: "#ef4444",
              fillOpacity: 1,
            })
              .bindTooltip(
                `Destino · ${feature?.properties?.placa || feature?.properties?.rota_nome || "rota"}`,
                { direction: "top" },
              )
              .addTo(group);
          }
        }
      } else {
        routeViewRef.current = "";
        if (bounds.length && !hasInitialFitRef.current) {
          map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
          hasInitialFitRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, geojson, risks]);
  return (
    <section
      className={
        card +
        " operational-map relative h-[520px] min-h-[520px] overflow-hidden"
      }
    >
      <div ref={host} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 shadow-xl backdrop-blur">
        <b className="text-xs">Mapa operacional</b>
        <p className="text-[10px] text-slate-400">
          Cidades, bairros, rodovias e ruas
        </p>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[500] flex -translate-x-1/2 gap-3 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-[10px] shadow-xl backdrop-blur">
        <span className="text-status-normal">● Veículo / início</span>
        <span className="text-sky-400">━ Rota</span>
        <span className="text-status-critico">● Destino</span>
      </div>
    </section>
  );
}
