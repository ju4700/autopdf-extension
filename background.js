let activeTabs = new Map();
let downloadQueue = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "setTabId") {
    activeTabs.set(message.term, message.tabId);
    downloadQueue.push({ term: message.term, source: message.source, retries: 0 });
    processQueue();
  } else if (message.action === "download" || message.action === "preview") {
    const item = downloadQueue.find(q => q.term === message.term);
    if (item) {
      if (message.action === "preview") {
        chrome.tabs.create({ url: message.url });
      } else {
        chrome.storage.local.get(["saveAs", "ocrSimulate"], (result) => {
          const options = {
            url: message.url,
            filename: `${message.term}-${Date.now()}.pdf`,
            saveAs: result.saveAs || false
          };
          chrome.downloads.download(options, (downloadId) => {
            if (chrome.runtime.lastError) {
              chrome.runtime.sendMessage({
                action: "updateStatus",
                text: `Download failed for "${message.term}": ${chrome.runtime.lastError.message}`,
                className: "error"
              });
            } else {
              chrome.runtime.sendMessage({ action: "downloadComplete", term: message.term });
              if (result.ocrSimulate) console.log(`Simulating OCR for ${message.term} - extracting text not implemented`);
              downloadQueue = downloadQueue.filter(q => q.term !== message.term);
              processQueue();
            }
          });
        });
      }
    }
  } else if (message.action === "noPdfFound") {
    const item = downloadQueue.find(q => q.term === message.term);
    if (item && chrome.storage.local.get(["autoRetry"], r => r.autoRetry || false).autoRetry && item.retries < 2) {
      item.retries++;
      chrome.tabs.update(activeTabs.get(message.term), { url: `https://www.google.com/search?q=${encodeURIComponent(message.term + " filetype:pdf")}` });
    } else {
      chrome.runtime.sendMessage({
        action: "updateStatus",
        text: `No PDF found for "${message.term}" after ${item?.retries || 0} retries.`,
        className: "error"
      });
      downloadQueue = downloadQueue.filter(q => q.term !== message.term);
      processQueue();
    }
  }
});

function processQueue() {
  const next = downloadQueue[0];
  if (next && activeTabs.has(next.term)) {
    chrome.tabs.update(activeTabs.get(next.term), { url: `https://www.google.com/search?q=${encodeURIComponent(next.term + " filetype:pdf")}` });
  }
}

// Context menu
chrome.contextMenus.create({
  id: "searchPdf",
  title: "Find PDF for '%s'",
  contexts: ["selection"]
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchPdf") {
    const term = info.selectionText;
    chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(term + " filetype:pdf")}` }, (newTab) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === newTab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            files: ["content.js"]
          });
          chrome.runtime.sendMessage({ action: "setTabId", tabId: newTab.id, term, source: "all" });
        }
      });
    });
  }
});

// Scheduled searches
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scheduledSearch") {
    chrome.storage.local.get(["searchHistory"], (result) => {
      const terms = (result.searchHistory || []).slice(0, 5).map(h => h.term);
      if (terms.length) {
        chrome.runtime.sendMessage({ action: "updateStatus", text: "Running scheduled search...", className: "info" });
        terms.forEach(term => chrome.runtime.sendMessage({ action: "setTabId", term, source: "all" }));
      }
    });
  }
});