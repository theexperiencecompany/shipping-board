import type { Plugin } from "vite-plus";
import { loadBoard, rateStatus } from "./board";

export function boardApi(): Plugin {
  return {
    name: "board-api",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/api/board")) {
          next();
          return;
        }

        void (async () => {
          try {
            const demo = request.url.includes("demo=1");
            const board = await loadBoard(demo);
            response.setHeader("content-type", "application/json");
            response.setHeader("cache-control", "no-store");
            response.end(JSON.stringify({ board, rate: rateStatus() }));
          } catch (error) {
            response.statusCode = 502;
            response.setHeader("content-type", "application/json");
            response.end(
              JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            );
          }
        })();
      });
    },
  };
}
