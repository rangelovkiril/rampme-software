import { swagger } from "@elysiajs/swagger";

export const swaggerPlugin = swagger({
  documentation: {
    info: {
      title: "Sofia Accessible Transit API",
      version: "0.1.0",
      description:
        "GTFS static + realtime данни за софийския градски транспорт, обогатени с информация за достъпност.",
      contact: { name: "HackTUES 2026" },
    },
    tags: [
      { name: "Stops", description: "Спирки — статични GTFS данни" },
      { name: "Routes", description: "Маршрути и линии" },
      { name: "Realtime", description: "GTFS-RT — alerts, trip updates, vehicle positions" },
    ],
  },
  path: "/docs",
  exclude: ["/docs", "/docs/json"],
});
