export {};

const MODAL_ID = "claude-blocker-modal";
const DEFAULT_DOMAINS = ["x.com", "youtube.com"];

interface ServerState {
  serverConnected: boolean;
  blocked: boolean;
  working: number;
  sessions: Array<{
    id: string;
    status: string;
    lastActivity: string;
    cwd?: string;
  }>;
}

let shouldBeBlocked = false;
let blockedDomains: string[] = DEFAULT_DOMAINS;
let lastState: ServerState | null = null;

// Load domains from storage
function loadDomains(): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(["blockedDomains"], (result) => {
        if (result.blockedDomains && Array.isArray(result.blockedDomains)) {
          resolve(result.blockedDomains);
        } else {
          resolve(DEFAULT_DOMAINS);
        }
      });
    } catch {
      resolve(DEFAULT_DOMAINS);
    }
  });
}

function isBlockedDomain(): boolean {
  const hostname = window.location.hostname.replace(/^www\./, "");
  return blockedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

function getModal(): HTMLElement | null {
  return document.getElementById(MODAL_ID);
}

function getShadow(): ShadowRoot | null {
  return getModal()?.shadowRoot ?? null;
}

function createModal(): void {
  if (getModal()) return;

  const container = document.createElement("div");
  container.id = MODAL_ID;
  const shadow = container.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <div style="all:initial;position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;z-index:2147483647;-webkit-font-smoothing:antialiased;">
      <div style="all:initial;background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:40px;max-width:480px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;">
        <svg style="width:64px;height:64px;margin-bottom:24px;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="11" width="18" height="11" rx="2" fill="#FFD700" stroke="#B8860B" stroke-width="1"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#888" stroke-width="2" fill="none"/>
        </svg>
        <div style="color:#fff;font-size:24px;font-weight:bold;margin:0 0 16px;line-height:1.2;">Time to Work</div>
        <div id="message" style="color:#888;font-size:16px;line-height:1.5;margin:0 0 24px;font-weight:normal;">Checking Claude status...</div>
        <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#2a2a2a;border-radius:20px;font-size:14px;color:#666;line-height:1;">
          <span id="dot" style="width:8px;height:8px;border-radius:50%;background:#666;flex-shrink:0;"></span>
          <span id="status" style="color:#666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">Connecting...</span>
        </div>
        <div id="hint" style="margin-top:24px;font-size:13px;color:#555;line-height:1.4;font-family:Arial,Helvetica,sans-serif;"></div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(container);
}

function removeModal(): void {
  getModal()?.remove();
}

function setDotColor(dot: HTMLElement, color: "green" | "red" | "gray" | "yellow" | "orange"): void {
  const colors = {
    green: "background:#22c55e;box-shadow:0 0 8px #22c55e;",
    red: "background:#ef4444;box-shadow:0 0 8px #ef4444;",
    yellow: "background:#ffd60a;box-shadow:0 0 8px #ffd60a;",
    orange: "background:#ff9500;box-shadow:0 0 8px #ff9500;",
    gray: "background:#666;box-shadow:none;",
  };
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;${colors[color]}`;
}

function getProjectName(cwd?: string): string {
  if (!cwd) return "Unknown";
  const parts = cwd.split("/");
  return parts[parts.length - 1] || "Unknown";
}

function renderStatus(state: ServerState | null): void {
  const shadow = getShadow();
  if (!shadow) return;

  const message = shadow.getElementById("message");
  const dot = shadow.getElementById("dot");
  const statusEl = shadow.getElementById("status");
  const hint = shadow.getElementById("hint");
  if (!message || !dot || !statusEl || !hint) return;

  if (!state || !state.serverConnected) {
    message.textContent = "Server offline. Start the blocker server.";
    setDotColor(dot, "red");
    statusEl.textContent = "Server Offline";
    hint.innerHTML = `Run <span style="background:#2a2a2a;padding:2px 8px;border-radius:4px;font-family:ui-monospace,monospace;font-size:12px;">herd</span> to start`;
    return;
  }

  const totalSessions = state.sessions.length;
  const workingSessions = state.working;
  const askingSessions = state.sessions.filter(s => s.status === "waiting_for_input");
  const reviewSessions = state.sessions.filter(s => s.status === "waiting_for_review");
  const needsAttention = askingSessions.length > 0 || reviewSessions.length > 0;

  if (totalSessions === 0) {
    message.textContent = "No Claude sessions detected.";
    setDotColor(dot, "green");
    statusEl.textContent = "Waiting for Claude";
    hint.textContent = "Open a terminal and start Claude";
  } else if (needsAttention) {
    // Build list of all sessions needing attention
    let html = "";

    if (askingSessions.length > 0) {
      html += `<div style="margin-bottom:${reviewSessions.length > 0 ? '12px' : '0'};">`;
      html += `<div style="color:#ffd60a;font-weight:600;margin-bottom:8px;">Asking Questions:</div>`;
      for (const s of askingSessions) {
        html += `<div style="color:#fff;margin-left:8px;">• ${getProjectName(s.cwd)}</div>`;
      }
      html += `</div>`;
    }

    if (reviewSessions.length > 0) {
      html += `<div>`;
      html += `<div style="color:#ff9500;font-weight:600;margin-bottom:8px;">Awaiting Review:</div>`;
      for (const s of reviewSessions) {
        html += `<div style="color:#fff;margin-left:8px;">• ${getProjectName(s.cwd)}</div>`;
      }
      html += `</div>`;
    }

    message.innerHTML = html;
    setDotColor(dot, askingSessions.length > 0 ? "yellow" : "orange");

    const totalNeeding = askingSessions.length + reviewSessions.length;
    statusEl.textContent = `${totalNeeding} need${totalNeeding === 1 ? 's' : ''} attention`;
    hint.textContent = askingSessions.length > 0
      ? "Answer questions in Claude to continue"
      : "Review Claude's work to continue";
  } else if (workingSessions === 0) {
    message.textContent = "All Claude sessions are idle.";
    setDotColor(dot, "green");
    statusEl.textContent = `${totalSessions} session${totalSessions > 1 ? "s" : ""} idle`;
    hint.textContent = "Send a prompt in Claude to unblock";
  } else {
    // This shouldn't render because we remove modal when working
    message.textContent = "Claude is working...";
    setDotColor(dot, "green");
    statusEl.textContent = `${workingSessions} working`;
    hint.textContent = "";
  }
}

// Pause all video/audio elements
function pauseAllMedia(): void {
  const mediaElements = document.querySelectorAll<HTMLMediaElement>('video, audio');
  mediaElements.forEach(m => {
    if (!m.paused) m.pause();
  });
}

// Handle state update from service worker
function handleStateUpdate(state: ServerState): void {
  if (!isBlockedDomain()) {
    shouldBeBlocked = false;
    removeModal();
    return;
  }

  lastState = state;

  if (state.blocked) {
    shouldBeBlocked = true;
    createModal();
    renderStatus(state);
    pauseAllMedia();
  } else {
    shouldBeBlocked = false;
    removeModal();
  }
}

// Watch for modal being removed and re-add it
function setupMutationObserver(): void {
  const observer = new MutationObserver(() => {
    if (shouldBeBlocked && !getModal()) {
      createModal();
      renderStatus(lastState);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Listen for state updates from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE") {
    handleStateUpdate(message as ServerState);
  }
});

// Request state - try direct fetch first (more reliable in Safari)
async function requestState(): Promise<void> {
  // Try direct fetch first
  try {
    const response = await fetch("http://localhost:8765/status");
    if (response.ok) {
      const data = await response.json();
      const sessions = data.sessions || [];
      handleStateUpdate({
        serverConnected: true,
        blocked: data.blocked,
        working: sessions.filter((s: {status: string}) => s.status === "working").length,
        sessions: sessions,
      });
      return;
    }
  } catch {
    // Direct fetch failed, try service worker
  }

  // Fallback to service worker
  try {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
      if (response) {
        handleStateUpdate(response);
      }
    });
  } catch {
    // Extension context invalidated
  }
}

// Initialize - pause immediately on blocked domains
(function immediateInit() {
  // Pause all media ASAP
  const attemptPause = () => {
    const media = document.querySelectorAll<HTMLMediaElement>('video, audio');
    media.forEach(m => {
      if (!m.paused) m.pause();
    });
  };

  attemptPause();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attemptPause);
  }

  // Keep trying during initial load
  const earlyInterval = setInterval(attemptPause, 100);
  setTimeout(() => clearInterval(earlyInterval), 3000);
})();

// Main init
async function init(): Promise<void> {
  blockedDomains = await loadDomains();

  if (isBlockedDomain()) {
    setupMutationObserver();
    createModal();

    // Request initial state
    requestState();

    // Poll every 1s for responsive updates
    setInterval(requestState, 1000);
  }
}

init();
