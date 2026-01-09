"use strict";
(() => {
  // src/popup.ts
  var statusDot = document.getElementById("status-dot");
  var statusText = document.getElementById("status-text");
  var sessionsEl = document.getElementById("sessions");
  var workingEl = document.getElementById("working");
  var blockBadge = document.getElementById("block-badge");
  var blockStatus = document.getElementById("block-status");
  var settingsBtn = document.getElementById("settings-btn");
  function updateUI(state) {
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
    sessionsEl.textContent = String(state.sessions);
    workingEl.textContent = String(state.working);
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
  }
  function refreshState() {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
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
  setInterval(refreshState, 5e3);
})();
