const WS_PORT = 8743;
const KEEPALIVE_ALARM_NAME = "perch-keepalive";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  // Guards against a duplicate socket: this can get called twice in a row
  // right after the service worker wakes from suspension — once from the
  // top-level connect() call below (Chrome re-runs the whole script on
  // every wake) and once from the keepalive alarm listener that woke it.
  if (
    ws !== null &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  ws = new WebSocket(`ws://localhost:${WS_PORT}`);

  ws.onopen = () => {
    console.log("[perch] connected to Electron app");
    ws?.send(
      JSON.stringify({
        type: "connection:hello",
        extensionVersion: chrome.runtime.getManifest().version,
      }),
    );
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as { type: string };
      if (msg.type === "connection:ack") {
        console.log("[perch] connection acknowledged by server");
      }
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    ws = null;
    reconnectTimer = setTimeout(connect, 5000);
  };

  ws.onerror = () => {
    // error fires before close; close handler schedules reconnect
  };
}

function sendTabUpdate(tab: chrome.tabs.Tab): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  if (!tab.url || !tab.title) return;

  ws.send(
    JSON.stringify({
      type: "tab:update",
      url: tab.url,
      tabTitle: tab.title,
      timestamp: new Date().toISOString(),
    }),
  );
}

connect();

// Manifest V3 background scripts are non-persistent service workers —
// Chrome suspends them after ~30s of inactivity, which silently drops the
// WebSocket *and* orphans the 5s reconnect timer above (the whole script
// context is gone, not just the socket — a plain setTimeout can't survive
// that). Alarms are the documented way around this: unlike setTimeout, an
// alarm survives service-worker termination and Chrome will wake the
// worker specifically to fire it, which re-runs this whole script (so the
// top-level connect() above already covers most of it) and, via this
// listener, explicitly retries too. Caught a real bug this way: a
// dropped/suspended connection used to go unnoticed because the app kept
// showing the last cached tab data — once that stale-data fallback was
// fixed on the app side, a silently-dead connection here started showing
// up as classification falling back to the bare "Google Chrome" native
// signal with no tab title, instead of quietly going stale.
chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM_NAME) connect();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    sendTabUpdate(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    sendTabUpdate(tab);
  }
});
