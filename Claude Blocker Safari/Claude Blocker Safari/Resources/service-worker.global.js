"use strict";
(() => {
  // src/service-worker.ts
  var POLL_INTERVAL = 2e3;
  var state = {
    serverConnected: false,
    blocked: true,
    sessions: [],
    bypassUntil: null
  };
  chrome.storage.sync.get(["bypassUntil"], (result) => {
    if (result.bypassUntil && result.bypassUntil > Date.now()) {
      state.bypassUntil = result.bypassUntil;
    }
  });
  function getPublicState() {
    const bypassActive = state.bypassUntil !== null && state.bypassUntil > Date.now();
    const workingSessions = state.sessions.filter((s) => s.status === "working").length;
    const shouldBlock = !bypassActive && (workingSessions === 0 || !state.serverConnected);
    return {
      serverConnected: state.serverConnected,
      sessions: state.sessions,
      working: workingSessions,
      blocked: shouldBlock,
      bypassActive,
      bypassUntil: state.bypassUntil
    };
  }
  function broadcast() {
    const publicState = getPublicState();
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "STATE", ...publicState }).catch(() => {
          });
        }
      }
    });
  }
  async function fetchStatus() {
    try {
      if (typeof browser !== "undefined" && browser.runtime?.sendNativeMessage) {
        const response = await browser.runtime.sendNativeMessage(
          "com.jackswitzer.Claude-Blocker-Safari.Extension",
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
    }
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
    }
    state.serverConnected = false;
    state.sessions = [];
    state.blocked = true;
    broadcast();
  }
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
      const today = (/* @__PURE__ */ new Date()).toDateString();
      chrome.storage.sync.get(["lastBypassDate"], (result) => {
        if (result.lastBypassDate === today) {
          sendResponse({ success: false, reason: "Already used today" });
          return;
        }
        state.bypassUntil = Date.now() + 5 * 60 * 1e3;
        chrome.storage.sync.set({ bypassUntil: state.bypassUntil, lastBypassDate: today });
        broadcast();
        sendResponse({ success: true });
      });
      return true;
    }
    if (message.type === "GET_BYPASS_STATUS") {
      const today = (/* @__PURE__ */ new Date()).toDateString();
      chrome.storage.sync.get(["lastBypassDate"], (result) => {
        sendResponse({
          usedToday: result.lastBypassDate === today,
          bypassActive: state.bypassUntil !== null && state.bypassUntil > Date.now(),
          bypassUntil: state.bypassUntil
        });
      });
      return true;
    }
    return false;
  });
  setInterval(() => {
    if (state.bypassUntil && state.bypassUntil <= Date.now()) {
      state.bypassUntil = null;
      chrome.storage.sync.remove("bypassUntil");
      broadcast();
    }
  }, 5e3);
  setInterval(fetchStatus, POLL_INTERVAL);
  fetchStatus();
})();
