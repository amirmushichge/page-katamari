const toggleButton = document.querySelector("#toggle");
const toggleLabel = document.querySelector("#toggle-label");
const message = document.querySelector("#message");

let active = false;

function render() {
  toggleButton.classList.toggle("is-active", active);
  toggleLabel.textContent = active ? "Stop and restore page" : "Start collecting";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(messagePayload) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab");
  return chrome.tabs.sendMessage(tab.id, messagePayload);
}

function isRestrictedUrl(url = "") {
  return /^(chrome|chrome-extension|devtools|edge|about):/i.test(url);
}

async function ensureContentScript() {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab");
  if (isRestrictedUrl(tab.url)) throw new Error("Restricted page");

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "PK_STATUS" });
  } catch {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["overlay.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    return chrome.tabs.sendMessage(tab.id, { type: "PK_STATUS" });
  }
}

async function updateStatus() {
  try {
    const response = await ensureContentScript();
    active = Boolean(response?.active);
    message.textContent = "Ready on this tab. Esc stops the game.";
    message.classList.remove("is-error");
    render();
  } catch {
    message.textContent = "Chrome blocks extensions on this page";
    message.classList.add("is-error");
    toggleButton.disabled = true;
  }
}

toggleButton.addEventListener("click", async () => {
  try {
    await ensureContentScript();
    const response = await send({ type: "PK_TOGGLE" });
    active = Boolean(response?.active);
    message.textContent = active
      ? "The page is live — use WASD or arrow keys"
      : "Page restored";
    message.classList.remove("is-error");
    render();
  } catch {
    message.textContent = "Reload the page once, then try again";
    message.classList.add("is-error");
  }
});

updateStatus();
