document.addEventListener("DOMContentLoaded", () => {
  const searchTermsInput = document.getElementById("searchTerms");
  const sourceSelect = document.getElementById("source");
  const searchButton = document.getElementById("searchButton");
  const status = document.getElementById("status");
  const progress = document.getElementById("progress");
  const resultsList = document.getElementById("resultsList");
  const historyList = document.getElementById("historyList");
  const analytics = document.getElementById("analytics");
  const tagInput = document.getElementById("tagInput");
  const toggleSettings = document.getElementById("toggleSettings");
  const settingsPanel = document.getElementById("settingsPanel");
  const saveAsCheckbox = document.getElementById("saveAs");
  const notifyCheckbox = document.getElementById("notify");
  const autoRetryCheckbox = document.getElementById("autoRetry");
  const previewModeCheckbox = document.getElementById("previewMode");
  const ocrSimulateCheckbox = document.getElementById("ocrSimulate");
  const minSizeInput = document.getElementById("minSize");
  const scheduleInput = document.getElementById("schedule");
  const categoryInput = document.getElementById("categoryInput");
  const clearHistoryButton = document.getElementById("clearHistory");
  const exportHistoryButton = document.getElementById("exportHistory");
  const importHistoryButton = document.getElementById("importHistory");
  const darkModeToggle = document.getElementById("darkModeToggle");

  // Load settings and history
  chrome.storage.local.get(
    ["saveAs", "notify", "autoRetry", "previewMode", "ocrSimulate", "minSize", "schedule", "category", "searchHistory", "darkMode"],
    (result) => {
      saveAsCheckbox.checked = result.saveAs || false;
      notifyCheckbox.checked = result.notify || false;
      autoRetryCheckbox.checked = result.autoRetry || false;
      previewModeCheckbox.checked = result.previewMode || false;
      ocrSimulateCheckbox.checked = result.ocrSimulate || false;
      minSizeInput.value = result.minSize || 0;
      scheduleInput.value = result.schedule || "";
      categoryInput.value = result.category || "";
      const history = result.searchHistory || [];
      updateHistory(history);
      updateAnalytics(history);
      if (result.darkMode) toggleDarkMode();
    }
  );

  // Search functionality
  searchButton.addEventListener("click", () => {
    const terms = searchTermsInput.value.trim().split("\n").filter(t => t.trim());
    if (!terms.length) {
      updateStatus("Enter a term.", "error");
      return;
    }
    updateStatus(`Searching ${terms.length} term(s)...`, "info");
    progress.textContent = `Progress: 0/${terms.length}`;
    searchBatch(terms, sourceSelect.value);
  });

  let processed = 0;
  async function searchBatch(terms, source) {
    const promises = terms.map(term => searchTerm(term, source, terms));
    await Promise.all(promises);
    updateStatus("Search completed!", "success");
  }

  async function searchTerm(term, source, terms) {
    processed++;
    progress.textContent = `Progress: ${processed}/${terms.length}`;
    updateStatus(`Searching "${term}"...`, "info");
    const query = `${term} filetype:pdf`;
    let searchUrl;
    switch (source) {
      case "gutenberg": searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + " site:gutenberg.org")}`; break;
      case "archive": searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + " site:archive.org")}`; break;
      case "scholar": searchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(term + " filetype:pdf")}`; break;
      default: searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }

    return new Promise((resolve) => {
      chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["content.js"]
            });
            // Close the tab after a delay to allow content.js to run
            setTimeout(() => chrome.tabs.remove(tab.id), 3000);
          }
        });
        setTimeout(resolve, 4000); // Give enough time for content.js to process
      });
    });
  }

  // History and analytics
  function updateHistory(history) {
    historyList.innerHTML = "";
    history.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `${item.term} (${item.source}) - ${new Date(item.timestamp).toLocaleString()} <span class="tags">${item.tags?.join(", ") || ""}</span>`;
      li.addEventListener("click", () => {
        searchTermsInput.value = item.term;
        sourceSelect.value = item.source;
        searchButton.click();
      });
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (tagInput.value.trim()) {
          item.tags = item.tags || [];
          item.tags.push(tagInput.value.trim());
          chrome.storage.local.set({ searchHistory: history }, () => updateHistory(history));
        }
      });
      historyList.appendChild(li);
    });
  }

  function updateAnalytics(history) {
    const total = history.length;
    const sources = history.reduce((acc, item) => {
      acc[item.source] = (acc[item.source] || 0) + 1;
      return acc;
    }, {});
    analytics.innerHTML = `Total Searches: ${total}<br>Sources: ${Object.entries(sources).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
  }

  // Settings and other event listeners
  toggleSettings.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
    toggleSettings.textContent = settingsPanel.classList.contains("hidden") ? "Settings" : "Settings";
  });

  saveAsCheckbox.addEventListener("change", () => chrome.storage.local.set({ saveAs: saveAsCheckbox.checked }));
  notifyCheckbox.addEventListener("change", () => chrome.storage.local.set({ notify: notifyCheckbox.checked }));
  autoRetryCheckbox.addEventListener("change", () => chrome.storage.local.set({ autoRetry: autoRetryCheckbox.checked }));
  previewModeCheckbox.addEventListener("change", () => chrome.storage.local.set({ previewMode: previewModeCheckbox.checked }));
  ocrSimulateCheckbox.addEventListener("change", () => chrome.storage.local.set({ ocrSimulate: ocrSimulateCheckbox.checked }));
  minSizeInput.addEventListener("change", () => chrome.storage.local.set({ minSize: parseInt(minSizeInput.value) || 0 }));
  scheduleInput.addEventListener("change", () => {
    const minutes = parseInt(scheduleInput.value) || 0;
    chrome.storage.local.set({ schedule: minutes });
    if (minutes > 0) chrome.alarms.create("scheduledSearch", { periodInMinutes: minutes });
    else chrome.alarms.clear("scheduledSearch");
  });
  categoryInput.addEventListener("change", () => chrome.storage.local.set({ category: categoryInput.value }));

  clearHistoryButton.addEventListener("click", () => {
    chrome.storage.local.set({ searchHistory: [] }, () => {
      updateHistory([]);
      updateAnalytics([]);
      updateStatus("History cleared!", "success");
    });
  });

  exportHistoryButton.addEventListener("click", () => {
    chrome.storage.local.get(["searchHistory"], (result) => {
      const blob = new Blob([JSON.stringify(result.searchHistory || [], null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename: "search_history.json" });
    });
  });

  importHistoryButton.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const history = JSON.parse(event.target.result);
        chrome.storage.local.set({ searchHistory: history }, () => {
          updateHistory(history);
          updateAnalytics(history);
        });
      };
      reader.readAsText(file);
    };
    input.click();
  });

  darkModeToggle.addEventListener("click", () => {
    toggleDarkMode();
    chrome.storage.local.set({ darkMode: document.body.classList.contains("dark-mode") });
  });

  function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    darkModeToggle.textContent = document.body.classList.contains("dark-mode") ? "Light" : "Dark";
  }

  function updateStatus(text, className) {
    status.textContent = text;
    status.className = `status ${className}`;
  }

  function addResult(term, url, action) {
    const li = document.createElement("li");
    li.innerHTML = `${term}: <a href="${url}" target="_blank">${url.split("/").pop()}</a> `;
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "View";
    viewBtn.className = "action-btn";
    viewBtn.onclick = () => chrome.runtime.sendMessage({ action: "preview", url, term });
    const dlBtn = document.createElement("button");
    dlBtn.textContent = "Download";
    dlBtn.className = "action-btn";
    dlBtn.onclick = () => {
      if (saveAsCheckbox.checked) {
        chrome.downloads.download({ url, saveAs: true });
      } else {
        chrome.downloads.download({ url });
      }
    };
    li.append(viewBtn, dlBtn);
    resultsList.appendChild(li);
  }

  // Handle messages from content.js and background.js
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "pdfFound") {
      const { term, url } = message;
      addResult(term, url, previewModeCheckbox.checked ? "preview" : "download");
      chrome.storage.local.get(["searchHistory", "category"], (result) => {
        const history = result.searchHistory || [];
        history.unshift({
          term,
          source: sourceSelect.value,
          timestamp: Date.now(),
          category: result.category || "Uncategorized",
          tags: tagInput.value.trim() ? [tagInput.value.trim()] : []
        });
        chrome.storage.local.set({ searchHistory: history.slice(0, 50) }, () => {
          updateHistory(history.slice(0, 50));
          updateAnalytics(history.slice(0, 50));
        });
      });
      if (notifyCheckbox.checked) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon.png",
          title: "PDF Found",
          message: `Found a PDF for "${term}"`
        });
      }
    } else if (message.action === "downloadComplete" && notifyCheckbox.checked) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "Download Complete",
        message: `Downloaded: ${message.term}`
      });
    }
  });
});