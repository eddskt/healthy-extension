/***********************
 * CONFIGURAÇÃO
 ***********************/
const DEFAULT_LEVEL = "lvl1"; // lvl1 | lvl2 | lvl3 | buddha
//let ACTIVE_LEVEL = "lvl1"; // lvl1 | lvl2 | lvl3 | buddha
//let BLUR_MODE = false;

const BASE_RULES_URL =
  "https://raw.githubusercontent.com/eddskt/healthy-extension/refs/heads/main/rules/";

const LEVEL_FILES = {
  lvl1: ["lvl1.json"],
  lvl2: ["lvl1.json", "lvl2.json"],
  lvl3: ["lvl1.json", "lvl2.json", "lvl3.json"],
  buddha: ["lvl1.json", "lvl2.json", "lvl3.json", "buddha.json"]
};

/***********************
 * STATE
 ***********************/
let ACTIVE_LEVEL = DEFAULT_LEVEL;
let BLUR_MODE = false;
let replaceRules = [];
let blockRules = [];

/***********************
 * SAFE STORAGE GET
 ***********************/
function getStoredLevel() {
  return new Promise(resolve => {
    try {
      if (!chrome?.storage?.sync) {
        resolve(DEFAULT_LEVEL);
        return;
      }

      chrome.storage.sync.get(["level"], result => {
        resolve(result.level || DEFAULT_LEVEL);
      });
    } catch (e) {
      console.warn("Storage indisponível, usando default");
      resolve(DEFAULT_LEVEL);
    }
  });
}

/***********************
 * LOAD RULES
 ***********************/
async function loadRules() {
  ACTIVE_LEVEL = await getStoredLevel();
  BLUR_MODE = ACTIVE_LEVEL === "buddha";

  replaceRules = [];
  blockRules = [];

  const files = LEVEL_FILES[ACTIVE_LEVEL] || [];

  for (const file of files) {
    try {
      const res = await fetch(BASE_RULES_URL + file);
      const json = await res.json();

      if (Array.isArray(json.rules)) {
        replaceRules.push(...json.rules);
      }

      if (Array.isArray(json.block)) {
        blockRules.push(...json.block);
      }
    } catch (e) {
      console.error("Erro ao carregar regras:", file, e);
    }
  }

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
 * BUDDHA MODE
 ***********************/
function containsBlockedWords(text) {
  return blockRules.some(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

function applyBuddhaMode(textNode) {
  if (!blockRules.length) return;

  if (containsBlockedWords(textNode.nodeValue)) {
    const post = textNode.parentElement?.closest(
      "article, div[role='article'], div[data-testid]"
    );

    if (!post) return;

    if (BLUR_MODE) {
      post.style.filter = "blur(8px)";
      post.style.pointerEvents = "none";
    } else {
      post.style.display = "none";
    }
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

        if (
          ["SCRIPT", "STYLE", "NOSCRIPT", "INPUT", "TEXTAREA"].includes(
            parent.tagName
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    applyBuddhaMode(node);
    node.nodeValue = softenText(node.nodeValue);
  }
}

/***********************
 * OBSERVER
 ***********************/
function observe() {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m =>
      m.addedNodes.forEach(n => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          walk(n);
        }
      })
    );
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/***********************
 * INIT
 ***********************/
(async function init() {
  await loadRules();
  walk(document.body);
  observe();
})();