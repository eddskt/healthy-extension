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
