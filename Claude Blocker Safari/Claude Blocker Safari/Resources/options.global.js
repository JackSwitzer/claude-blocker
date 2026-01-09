"use strict";
(() => {
  // src/options.ts
  var DEFAULT_DOMAINS = ["x.com", "youtube.com"];
  var statusIndicator = document.getElementById("status-indicator");
  var statusText = document.getElementById("status-text");
  var sessionsEl = document.getElementById("sessions");
  var workingEl = document.getElementById("working");
  var blockStatusEl = document.getElementById("block-status");
  var blockingCard = document.getElementById("blocking-card");
  var addForm = document.getElementById("add-form");
  var domainInput = document.getElementById("domain-input");
  var domainList = document.getElementById("domain-list");
  var siteCount = document.getElementById("site-count");
  var bypassBtn = document.getElementById("bypass-btn");
  var bypassText = document.getElementById("bypass-text");
  var bypassStatus = document.getElementById("bypass-status");
  var bypassCountdown = null;
  var currentDomains = [];
  async function loadDomains() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["blockedDomains"], (result) => {
        if (result.blockedDomains && Array.isArray(result.blockedDomains)) {
          resolve(result.blockedDomains);
        } else {
          chrome.storage.sync.set({ blockedDomains: DEFAULT_DOMAINS });
          resolve(DEFAULT_DOMAINS);
        }
      });
    });
  }
  async function saveDomains(domains) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ blockedDomains: domains }, () => {
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, { type: "DOMAINS_UPDATED", domains }).catch(() => {
              });
            }
          }
        });
        resolve();
      });
    });
  }
  function normalizeDomain(input) {
    let domain = input.toLowerCase().trim();
    domain = domain.replace(/^https?:\/\//, "");
    domain = domain.replace(/^www\./, "");
    domain = domain.replace(/\/.*$/, "");
    return domain;
  }
  function isValidDomain(domain) {
    const regex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
    return regex.test(domain);
  }
  function renderDomains() {
    domainList.innerHTML = "";
    siteCount.textContent = String(currentDomains.length);
    if (currentDomains.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      domainList.appendChild(empty);
      return;
    }
    for (const domain of currentDomains) {
      const li = document.createElement("li");
      li.className = "domain-item";
      const nameSpan = document.createElement("span");
      nameSpan.className = "domain-name";
      nameSpan.textContent = domain;
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.title = "Remove site";
      removeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    `;
      removeBtn.addEventListener("click", () => removeDomain(domain));
      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      domainList.appendChild(li);
    }
  }
  async function addDomain(raw) {
    const domain = normalizeDomain(raw);
    if (!domain) return;
    if (!isValidDomain(domain)) {
      domainInput.classList.add("error");
      setTimeout(() => domainInput.classList.remove("error"), 400);
      return;
    }
    if (currentDomains.includes(domain)) {
      domainInput.value = "";
      return;
    }
    currentDomains.push(domain);
    currentDomains.sort();
    await saveDomains(currentDomains);
    renderDomains();
    domainInput.value = "";
  }
  async function removeDomain(domain) {
    currentDomains = currentDomains.filter((d) => d !== domain);
    await saveDomains(currentDomains);
    renderDomains();
  }
  function updateUI(state) {
    if (!state.serverConnected) {
      statusIndicator.className = "status-indicator disconnected";
      statusText.textContent = "Offline";
    } else if (state.working > 0) {
      statusIndicator.className = "status-indicator working";
      statusText.textContent = "Claude Working";
    } else {
      statusIndicator.className = "status-indicator connected";
      statusText.textContent = "Connected";
    }
    sessionsEl.textContent = String(state.sessions);
    workingEl.textContent = String(state.working);
    if (state.bypassActive) {
      blockStatusEl.textContent = "Bypassed";
      blockStatusEl.style.color = "var(--accent-amber)";
    } else if (state.blocked) {
      blockStatusEl.textContent = "Blocking";
      blockStatusEl.style.color = "var(--accent-red)";
    } else {
      blockStatusEl.textContent = "Open";
      blockStatusEl.style.color = "var(--accent-green)";
    }
  }
  function updateBypassButton(status) {
    if (bypassCountdown) {
      clearInterval(bypassCountdown);
      bypassCountdown = null;
    }
    if (status.bypassActive && status.bypassUntil) {
      bypassBtn.disabled = true;
      bypassBtn.classList.add("active");
      const updateCountdown = () => {
        const remaining = Math.max(0, Math.ceil((status.bypassUntil - Date.now()) / 1e3));
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        bypassText.textContent = `Bypass Active \xB7 ${minutes}:${seconds.toString().padStart(2, "0")}`;
        if (remaining <= 0) {
          if (bypassCountdown) clearInterval(bypassCountdown);
          refreshState();
        }
      };
      updateCountdown();
      bypassCountdown = setInterval(updateCountdown, 1e3);
      bypassStatus.textContent = "Bypass will expire soon";
    } else if (status.usedToday) {
      bypassBtn.disabled = true;
      bypassBtn.classList.remove("active");
      bypassText.textContent = "Bypass Used Today";
      bypassStatus.textContent = "Resets at midnight";
    } else {
      bypassBtn.disabled = false;
      bypassBtn.classList.remove("active");
      bypassText.textContent = "Activate Bypass";
      bypassStatus.textContent = "5 minutes of unblocked access, once per day";
    }
  }
  function refreshState() {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
      if (state) {
        updateUI(state);
      }
    });
    chrome.runtime.sendMessage({ type: "GET_BYPASS_STATUS" }, (status) => {
      if (status) {
        updateBypassButton(status);
      }
    });
  }
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addDomain(domainInput.value);
  });
  bypassBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "ACTIVATE_BYPASS" }, (response) => {
      if (response?.success) {
        refreshState();
      } else if (response?.reason) {
        bypassStatus.textContent = response.reason;
      }
    });
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE") {
      updateUI(message);
    }
  });
  async function init() {
    currentDomains = await loadDomains();
    renderDomains();
    refreshState();
  }
  init();
  setInterval(refreshState, 5e3);
})();
