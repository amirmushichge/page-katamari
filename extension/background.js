async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: "PK_STATUS" });
    if (typeof status?.active !== "boolean") throw new Error("No content script response");
  } catch (error) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["overlay.css"]
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
    } catch (injectionError) {
      // Restricted browser pages intentionally reject content scripts.
      console.debug("Page Katamari is unavailable on this page", injectionError || error);
      return;
    }
  }
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    console.debug("Page Katamari is unavailable on this page", error);
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-katamari") {
    sendToActiveTab({ type: "PK_TOGGLE" });
  }
});
