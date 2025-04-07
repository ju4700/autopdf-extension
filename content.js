(function() {
    const searchTerm = new URLSearchParams(window.location.search).get("q")?.split(" ")[0] || "Unknown";
    console.log(`Content script running for: ${searchTerm}`);
  
    async function findAndDownloadPdf() {
      console.log("Scanning for PDFs...");
      const links = document.querySelectorAll("a[href]");
      let pdfUrl = null;
  
      for (const link of links) {
        const href = link.href.toLowerCase();
        let candidateUrl = href;
        if (href.includes("/url?q=")) {
          const urlParams = new URLSearchParams(href.split("?")[1]);
          candidateUrl = urlParams.get("q") || href;
        }
        if (candidateUrl.endsWith(".pdf")) {
          pdfUrl = candidateUrl;
          console.log(`PDF found: ${pdfUrl}`);
          break;
        }
      }
  
      if (pdfUrl) {
        chrome.runtime.sendMessage({
          action: "pdfFound",
          url: pdfUrl,
          term: searchTerm
        });
      } else {
        console.log("No PDF found.");
        chrome.runtime.sendMessage({
          action: "noPdfFound",
          term: searchTerm
        });
      }
    }
  
    const observer = new MutationObserver((mutations, obs) => {
      if (document.querySelector("a[href]")) {
        obs.disconnect();
        findAndDownloadPdf();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  
    if (document.readyState === "complete") {
      findAndDownloadPdf();
    } else {
      window.addEventListener("load", findAndDownloadPdf);
    }
  })();