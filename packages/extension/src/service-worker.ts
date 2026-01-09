export {};

const POLL_INTERVAL = 2000;

// The actual state
interface State {
  serverConnected: boolean;
  blocked: boolean;
  sessions: Array<{
    id: string;
    status: string;
    lastActivity: string;
    cwd?: string;
  }>;
  bypassUntil: number | null;
}

const state: State = {
  serverConnected: false,
  blocked: true,
  sessions: [],
  bypassUntil: null,
};

// Load bypass from storage on startup
chrome.storage.sync.get(["bypassUntil"], (result) => {
  if (result.bypassUntil && result.bypassUntil > Date.now()) {
    state.bypassUntil = result.bypassUntil;
  }
});

// Compute derived state
function getPublicState() {
  const bypassActive = state.bypassUntil !== null && state.bypassUntil > Date.now();
  const workingSessions = state.sessions.filter(s => s.status === "working").length;
  const shouldBlock = !bypassActive && (workingSessions === 0 || !state.serverConnected);

  return {
    serverConnected: state.serverConnected,
    sessions: state.sessions,
    working: workingSessions,
    blocked: shouldBlock,
    bypassActive,
    bypassUntil: state.bypassUntil,
  };
}

// Broadcast current state to all tabs
function broadcast() {
  const publicState = getPublicState();
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "STATE", ...publicState }).catch(() => {});
      }
    }
  });
}

// Fetch status through native messaging (Safari) or direct fetch (Chrome)
async function fetchStatus(): Promise<void> {
  try {
    // Try native messaging first (Safari)
    if (typeof browser !== "undefined" && browser.runtime?.sendNativeMessage) {
      const response = await browser.runtime.sendNativeMessage(
        "com.github.Claude-Blocker-Safari.Extension",
        { action: "getStatus" }
      );

      if (response && !response.error) {
        state.serverConnected = true;
        state.sessions = response.sessions || [];
        state.blocked = response.blocked ?? true;
        broadcast();
        return;
      }
    }
  } catch (e) {
    // Native messaging not available, try direct fetch
  }

  // Fallback: direct fetch (works in Chrome, might work in Safari)
  try {
    const response = await fetch("http://localhost:8765/status");
    if (response.ok) {
      const data = await response.json();
      state.serverConnected = true;
      state.sessions = data.sessions || [];
      state.blocked = data.blocked ?? true;
      broadcast();
      return;
    }
  } catch {
    // Direct fetch failed
  }

  // Both methods failed
  state.serverConnected = false;
  state.sessions = [];
  state.blocked = true;
  broadcast();
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse(getPublicState());
    return true;
  }

  if (message.type === "FETCH_STATUS") {
    fetchStatus().then(() => {
      sendResponse(getPublicState());
    });
    return true;
  }

  if (message.type === "ACTIVATE_BYPASS") {
    const today = new Date().toDateString();
    chrome.storage.sync.get(["lastBypassDate"], (result) => {
      if (result.lastBypassDate === today) {
        sendResponse({ success: false, reason: "Already used today" });
        return;
      }
      state.bypassUntil = Date.now() + 5 * 60 * 1000;
      chrome.storage.sync.set({ bypassUntil: state.bypassUntil, lastBypassDate: today });
      broadcast();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_BYPASS_STATUS") {
    const today = new Date().toDateString();
    chrome.storage.sync.get(["lastBypassDate"], (result) => {
      sendResponse({
        usedToday: result.lastBypassDate === today,
        bypassActive: state.bypassUntil !== null && state.bypassUntil > Date.now(),
        bypassUntil: state.bypassUntil,
      });
    });
    return true;
  }

  return false;
});

// Check bypass expiry
setInterval(() => {
  if (state.bypassUntil && state.bypassUntil <= Date.now()) {
    state.bypassUntil = null;
    chrome.storage.sync.remove("bypassUntil");
    broadcast();
  }
}, 5000);

// Poll for status periodically
setInterval(fetchStatus, POLL_INTERVAL);

// Initial fetch
fetchStatus();

// Declare browser for Safari
declare const browser: typeof chrome & {
  runtime: typeof chrome.runtime & {
    sendNativeMessage?: (application: string, message: any) => Promise<any>;
  };
};
