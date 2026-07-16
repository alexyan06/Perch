import { WebSocketServer } from "ws";
import { app } from "electron";

const WS_PORT = 8743;

export interface BrowserSignal {
  url: string;
  tabTitle: string;
  timestamp: string;
}

let latestBrowserSignal: BrowserSignal | null = null;
const browserSignalListeners = new Set<() => void>();

export function getLatestBrowserSignal(): BrowserSignal | null {
  return latestBrowserSignal;
}

// Tab events are delivered immediately by the extension. Consumers decide how
// to schedule their work, which keeps this transport module independent from
// session lifecycle and classification state.
export function onBrowserSignalChange(listener: () => void): () => void {
  browserSignalListeners.add(listener);
  return () => browserSignalListeners.delete(listener);
}

function notifyBrowserSignalChange(): void {
  for (const listener of browserSignalListeners) {
    try {
      listener();
    } catch (err) {
      console.error("[ws] browser signal listener failed:", err);
    }
  }
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
          const changed =
            latestBrowserSignal === null ||
            latestBrowserSignal.url !== url ||
            latestBrowserSignal.tabTitle !== tabTitle;
          latestBrowserSignal = { url, tabTitle, timestamp };
          if (changed) notifyBrowserSignalChange();
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
      if (latestBrowserSignal !== null) {
        latestBrowserSignal = null;
        notifyBrowserSignalChange();
      }
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
