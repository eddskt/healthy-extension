/***********************
 * CONFIGURAÇÃO
 ***********************/
const DEFAULT_LEVEL = "lvl1";

const BASE_RULES_URL =
  "https://raw.githubusercontent.com/eddskt/healthy-extension/refs/heads/main/rules/";

/***********************
 * STATE
 ***********************/
let ACTIVE_LEVEL = DEFAULT_LEVEL;
let BUDDHA_MODE = false;
let BUDDHA_ACTION = "blur"; // "blur" | "hide"

let replaceRules = [];
let blockRules = [];

/***********************
 * SAFE STORAGE GET
 ***********************/
function getStoredSettings() {
  return new Promise(resolve => {
    try {
      chrome.storage.sync.get(
        ["level", "buddhaAction"],
        result => {
          resolve({
            level: result.level || DEFAULT_LEVEL,
            buddhaAction: result.buddhaAction || "blur"
          });
        }
      );
    } catch {
      resolve({
        level: DEFAULT_LEVEL,
        buddhaAction: "blur"
      });
    }
  });
}

/***********************
 * INPUT / EDITABLE GUARD
 ***********************/
function isEditable(node) {
  const el = node.parentElement;
  if (!el) return false;

  return (
    el.isContentEditable ||
    el.closest("[contenteditable='true']") ||
    ["INPUT", "TEXTAREA"].includes(el.tagName) ||
    el.closest("[role='textbox']")
  );
}

/***********************
 * LANGUAGE
 ***********************/
function getLanguageFallbacks() {
  const lang = navigator.language || "en-US";
  const base = lang.split("-")[0];

  return [lang, base, "en-US", "en"];
}

/***********************
 * LOAD RULES
 ***********************/
async function loadRules() {
  const settings = await getStoredSettings();

  ACTIVE_LEVEL = settings.level;
  BUDDHA_MODE = ACTIVE_LEVEL === "buddha";
  BUDDHA_ACTION = settings.buddhaAction;

  replaceRules = [];
  blockRules = [];

  const levelsByMode = {
    lvl1: ["lvl1"],
    lvl2: ["lvl1", "lvl2"],
    lvl3: ["lvl1", "lvl2", "lvl3"],
    buddha: ["lvl1", "lvl2", "lvl3", "buddha"]
  };

  const levels = levelsByMode[ACTIVE_LEVEL] || ["lvl1"];
  const languages = getLanguageFallbacks();

  for (const level of levels) {

    // 🔒 BUDDHA (arquivo único, sem idioma)
    if (level === "buddha") {
      try {
        const res = await fetch(
          `${BASE_RULES_URL}buddha/buddha.json`
        );

        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.block)) {
            blockRules.push(...json.block);
          }
        }
      } catch (err) {
        console.warn("Erro carregando buddha.json", err);
      }

      continue;
    }

    // 🌍 NÍVEIS COM IDIOMA
    for (const lang of languages) {
      try {
        const res = await fetch(
          `${BASE_RULES_URL}${level}/${lang}.json`
        );

        if (!res.ok) continue;

        const json = await res.json();

        if (Array.isArray(json.rules)) {
          replaceRules.push(...json.rules);
        }
        if (Array.isArray(json.block)) {
          blockRules.push(...json.block);
        }

        break; // idioma encontrado, não tenta fallback
      } catch (err) {
        console.warn(`Erro carregando ${level}/${lang}.json`, err);
      }
    }
  }

  // evita substituir palavras menores antes das maiores
  replaceRules.sort((a, b) => b.from.length - a.from.length);
}


/***********************
 * TEXT SOFTENING
 ***********************/
function softenText(text) {
  let result = text;

  for (const { from, to } of replaceRules) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");

    result = result.replace(regex, match =>
      match[0] === match[0].toUpperCase()
        ? to.charAt(0).toUpperCase() + to.slice(1)
        : to
    );
  }

  return result;
}

/***********************
 * BLOCK DETECTION
 ***********************/
function containsBlockedWords(text) {
  return blockRules.some(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

/***********************
 * STATS
 ***********************/
function incrementStat(key) {
  try {
    if (
      !chrome ||
      !chrome.storage ||
      !chrome.storage.sync ||
      chrome.runtime?.id === undefined
    ) {
      return;
    }

    chrome.storage.sync.get([key], result => {
      // extensão pode ter sido invalidada ENTRE o get e o callback
      if (chrome.runtime?.id === undefined) return;

      chrome.storage.sync.set({
        [key]: (result[key] || 0) + 1
      });
    });
  } catch {
    // silencia erro de contexto invalidado
  }
}


/***********************
 * BUDDHA MODE
 ***********************/
function applyBuddhaMode(textNode) {
  if (!BUDDHA_MODE || !blockRules.length) return;
  if (isEditable(textNode)) return;

  if (!containsBlockedWords(textNode.nodeValue)) return;

  const post = textNode.parentElement?.closest(
    "article[data-testid='tweet'], article, div[role='article']"
  );

  if (!post) return;
  if (post.hasAttribute("data-buddha-processed")) return;

  post.setAttribute("data-buddha-processed", "true");

  if (BUDDHA_ACTION === "hide") {
    post.style.display = "none";
    post.setAttribute("data-buddha-hidden", "true");
    incrementStat("totalBlockedPosts");
  } else {
    post.style.filter = "blur(8px)";
    post.style.pointerEvents = "none";
    post.setAttribute("data-buddha-blur", "true");
    incrementStat("totalBlurredPosts");
  }
}

/***********************
 * DOM WALKER
 ***********************/
function walk(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        if (isEditable(node)) return NodeFilter.FILTER_REJECT;

        if (
          ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)
        ) return NodeFilter.FILTER_REJECT;

        if (parent.closest("[data-buddha-hidden]"))
          return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    applyBuddhaMode(node);

    if (!BUDDHA_MODE) {
      const softened = softenText(node.nodeValue);
      if (softened !== node.nodeValue) {
        node.nodeValue = softened;
        incrementStat("totalReplacedTexts");
      }
    }
  }
}

/***********************
 * OBSERVER (DEBOUNCED)
 ***********************/
function observe() {
  let scheduled = false;

  const observer = new MutationObserver(mutations => {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      mutations.forEach(m =>
        m.addedNodes.forEach(n => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            walk(n);
          }
        })
      );
      scheduled = false;
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/***********************
 * MESSAGE HANDLER (REALTIME UPDATE)
 ***********************/
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "LEVEL_CHANGED") {
    reloadAll();
  }
});

/***********************
 * RELOAD
 ***********************/
async function reloadAll() {
  await loadRules();

  document
    .querySelectorAll("[data-buddha-blur]")
    .forEach(el => {
      el.style.filter = "";
      el.style.pointerEvents = "";
      el.removeAttribute("data-buddha-blur");
      el.removeAttribute("data-buddha-processed");
    });

  walk(document.body);
}

/***********************
 * INIT
 ***********************/
(async function init() {
  await loadRules();
  walk(document.body);
  observe();
})();
