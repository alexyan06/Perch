import { WebSocketServer } from "ws";
import { app } from "electron";

const WS_PORT = 8743;

export interface BrowserSignal {
  url: string;
  tabTitle: string;
  timestamp: string;
}

let latestBrowserSignal: BrowserSignal | null = null;

export function getLatestBrowserSignal(): BrowserSignal | null {
  return latestBrowserSignal;
}

export function startWsServer(): void {
  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on("listening", () => {
    console.log(`[ws] server listening on :${WS_PORT}`);
  });

  wss.on("connection", (socket) => {
    console.log("[ws] client connected");

    socket.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        console.warn("[ws] received non-JSON message");
        return;
      }

      if (typeof msg === "object" && msg !== null && "type" in msg) {
        const { type } = msg as { type: string };

        if (type === "connection:hello") {
          socket.send(
            JSON.stringify({
              type: "connection:ack",
              serverVersion: app.getVersion(),
            }),
          );
          console.log("[ws] connection:hello →", msg);
        } else if (type === "tab:update") {
          const { url, tabTitle, timestamp } = msg as {
            type: string;
            url: string;
            tabTitle: string;
            timestamp: string;
          };
          latestBrowserSignal = { url, tabTitle, timestamp };
          console.log("[ws] tab:update →", msg);
        }
      }
    });

    socket.on("close", () => {
      console.log("[ws] client disconnected");
      // Once disconnected, the last-known tab is no longer trustworthy — a
      // frozen signal here was silently feeding stale titles into both
      // classification and vision-escalation's screenshot matching (the
      // real window had moved on by the time a capture was attempted, so
      // desktopCapturer found nothing and it looked like a permissions
      // problem). Clearing it lets poller.ts's existing native-signal
      // fallback take over honestly until a fresh tab:update arrives.
      latestBrowserSignal = null;
    });

    socket.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") {
        console.error("[ws] socket error:", err);
      }
    });
  });

  wss.on("error", (err) => {
    console.error("[ws] server error:", err);
  });
}

export { WS_PORT };
