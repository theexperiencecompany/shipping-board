import type { Plugin } from "vite-plus";
import { jobLog, loadBoard, rateStatus } from "./board";

function handler(request: { url?: string }, response: any, next: () => void) {
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
        const log = await jobLog(id);
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end(log);
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
      void loadBoard().catch(() => {});
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      void loadBoard().catch(() => {});
      server.middlewares.use(handler);
    },
  };
}
