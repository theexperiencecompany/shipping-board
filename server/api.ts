import type { Plugin } from "vite-plus";
import { jobErrors, jobLog, loadBoard, rateStatus, rerun } from "./board";

function handler(request: { url?: string; method?: string }, response: any, next: () => void) {
  if (!request.url?.startsWith("/api/")) {
    next();
    return;
  }

  void (async () => {
    try {
      if (request.url!.startsWith("/api/failure")) {
        const id = Number(new URL(request.url!, "http://x").searchParams.get("job"));
        if (!Number.isFinite(id) || id <= 0) {
          response.statusCode = 400;
          response.end("missing job");
          return;
        }
        const full = new URL(request.url!, "http://x").searchParams.get("full") === "1";
        const log = await jobLog(id, full);
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end(log);
        return;
      }

      const url = new URL(request.url!, "http://x");

      if (url.pathname === "/api/errors") {
        const ids = url.searchParams
          .getAll("job")
          .map(Number)
          .filter((id) => Number.isFinite(id) && id > 0);
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(await jobErrors(ids)));
        return;
      }

      if (url.pathname === "/api/rerun") {
        const run = Number(url.searchParams.get("run"));
        if (request.method !== "POST" || !Number.isFinite(run) || run <= 0) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: "POST /api/rerun?run=<id>" }));
          return;
        }
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ message: await rerun(run) }));
        return;
      }

      const board = await loadBoard();
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
}

export function boardApi(): Plugin {
  return {
    name: "board-api",
    configureServer(server) {
      // Vitest boots a Vite server too. Tests must not call GitHub.
      if (server.config.mode === "test") return;
      void loadBoard().catch(() => {});
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      void loadBoard().catch(() => {});
      server.middlewares.use(handler);
    },
  };
}
