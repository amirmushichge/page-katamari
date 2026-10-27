async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, message);
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
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (injectionError) {
      // Restricted browser pages intentionally reject content scripts.
      console.debug("Page Katamari is unavailable on this page", injectionError || error);
    }
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-katamari") {
    sendToActiveTab({ type: "PK_TOGGLE" });
  }
});
