const cards = document.querySelectorAll(".card");

chrome.storage.sync.get(["level"], ({ level }) => {
  const active = level || "lvl1";
  document
    .querySelector(`[data-level="${active}"]`)
    ?.classList.add("selected");
});

cards.forEach(card => {
  card.addEventListener("click", () => {
    cards.forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    chrome.storage.sync.set({
      level: card.dataset.level
    });
  });
});

function loadStats() {
  chrome.storage.sync.get(
    ["totalBlockedPosts", "totalBlurredPosts", "totalReplacedTexts"],
    data => {
      document.getElementById("blocked").textContent =
        data.totalBlockedPosts || 0;

      document.getElementById("blurred").textContent =
        data.totalBlurredPosts || 0;

      document.getElementById("replaced").textContent =
        data.totalReplacedTexts || 0;
    }
  );
}

document.addEventListener("DOMContentLoaded", loadStats);


document.getElementById("resetStats")?.addEventListener("click", () => {
  chrome.storage.sync.set({
    totalBlockedPosts: 0,
    totalBlurredPosts: 0,
    totalReplacedTexts: 0
  }, loadStats);
});