/***********************
 * CONFIGURAÇÃO
 ***********************/
let ACTIVE_LEVEL = "lvl1"; // lvl1 | lvl2 | lvl3 | buddha
let BLUR_MODE = false;

const BASE_RULES_URL =
  "https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/rules/";

const LEVEL_FILES = {
  lvl1: ["lvl1.json"],
  lvl2: ["lvl1.json", "lvl2.json"],
  lvl3: ["lvl1.json", "lvl2.json", "lvl3.json"],
  buddha: ["lvl1.json", "lvl2.json", "lvl3.json", "buddha.json"]
};

/***********************
 * ESTADO
 ***********************/
let replaceRules = [];
let blockRules = [];

/***********************
 * LOAD RULES
 ***********************/
async function loadRules() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["level"], async ({ level }) => {
      ACTIVE_LEVEL = level || "lvl1";
      BLUR_MODE = ACTIVE_LEVEL === "buddha";

      const files = LEVEL_FILES[ACTIVE_LEVEL];
      replaceRules = [];
      blockRules = [];

      for (const file of files) {
        const res = await fetch(BASE_RULES_URL + file);
        const json = await res.json();

        if (json.rules) replaceRules.push(...json.rules);
        if (json.block) blockRules.push(...json.block);
      }

      replaceRules.sort((a, b) => b.from.length - a.from.length);
      resolve();
    });
  });
}


/***********************
 * TEXT SOFTENING
 ***********************/
function softenText(text) {
  let result = text;

  for (const { from, to } of replaceRules) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");

    result = result.replace(regex, match => {
      // mantém capitalização básica
      if (match[0] === match[0].toUpperCase()) {
        return to.charAt(0).toUpperCase() + to.slice(1);
      }
      return to;
    });
  }

  return result;
}



/***********************
 * MODO BLUR
 ***********************/
function blurPost(post) {
  post.style.filter = "blur(8px)";
  post.style.pointerEvents = "none";
}


/***********************
 * BUDDHA MODE
 ***********************/
function containsBlockedWords(text) {
  return blockRules.some(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(text);
  });
}

function hidePostIfNeeded(textNode) {
  if (!blockRules.length) return;

  if (containsBlockedWords(textNode.nodeValue)) {
    const post = textNode.parentElement?.closest(
      "article, div[role='article'], div[data-testid]"
    );

    if (post) {
      if (BLUR_MODE) {
        blurPost(post);
      } else {
        post.style.display = "none";
      }
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
        if (!node.parentElement) return NodeFilter.FILTER_REJECT;

        const tag = node.parentElement.tagName;
        if (
          ["SCRIPT", "STYLE", "NOSCRIPT", "INPUT", "TEXTAREA"].includes(tag)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let current;
  while ((current = walker.nextNode())) {
    hidePostIfNeeded(current);
    current.nodeValue = softenText(current.nodeValue);
  }
}

/***********************
 * OBSERVER
 ***********************/
function observe() {
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          walk(node);
        }
      });
    }
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
