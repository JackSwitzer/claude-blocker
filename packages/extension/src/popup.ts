export {};

interface Session {
  id: string;
  status: string;
  cwd?: string;
}

interface PopupState {
  blocked: boolean;
  serverConnected: boolean;
  sessions: Session[];
  working: number;
  bypassActive: boolean;
}

const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const sessionsEl = document.getElementById("sessions") as HTMLElement;
const workingEl = document.getElementById("working") as HTMLElement;
const blockBadge = document.getElementById("block-badge") as HTMLElement;
const blockStatus = document.getElementById("block-status") as HTMLElement;
const attentionList = document.getElementById("attention-list") as HTMLElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;

function getProjectName(cwd?: string): string {
  if (!cwd) return "Unknown";
  const parts = cwd.split("/");
  return parts[parts.length - 1] || "Unknown";
}

function updateUI(state: PopupState): void {
  const sessionCount = Array.isArray(state.sessions) ? state.sessions.length : 0;
  // Status indicator
  if (!state.serverConnected) {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Offline";
  } else if (state.working > 0) {
    statusDot.className = "status-dot working";
    statusText.textContent = "Working";
  } else {
    statusDot.className = "status-dot connected";
    statusText.textContent = "Connected";
  }

  // Stats
  sessionsEl.textContent = String(sessionCount);
  workingEl.textContent = String(state.working);

  // Block badge
  if (state.bypassActive) {
    blockBadge.className = "block-badge bypass";
    blockStatus.textContent = "Bypass";
  } else if (state.blocked) {
    blockBadge.className = "block-badge blocked";
    blockStatus.textContent = "Blocked";
  } else {
    blockBadge.className = "block-badge open";
    blockStatus.textContent = "Open";
  }

  // Attention list (asking/review)
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const asking = sessions.filter(s => s.status === "waiting_for_input");
  const review = sessions.filter(s => s.status === "waiting_for_review");

  if (asking.length === 0 && review.length === 0) {
    attentionList.innerHTML = "";
    attentionList.style.display = "none";
  } else {
    attentionList.style.display = "block";
    let html = "";

    for (const s of asking) {
      html += `<div class="attention-item asking"><span class="attention-type">?</span><span class="attention-project">${getProjectName(s.cwd)}</span></div>`;
    }
    for (const s of review) {
      html += `<div class="attention-item review"><span class="attention-type">!</span><span class="attention-project">${getProjectName(s.cwd)}</span></div>`;
    }

    attentionList.innerHTML = html;
  }
}

function refreshState(): void {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state: PopupState) => {
    if (state) {
      updateUI(state);
    }
  });
}

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE") {
    updateUI(message);
  }
});

refreshState();
setInterval(refreshState, 5000);
