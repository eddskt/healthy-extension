chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    [
      "totalBlockedPosts",
      "totalBlurredPosts",
      "totalReplacedTexts"
    ],
    data => {
      chrome.storage.sync.set({
        totalBlockedPosts: data.totalBlockedPosts || 0,
        totalBlurredPosts: data.totalBlurredPosts || 0,
        totalReplacedTexts: data.totalReplacedTexts || 0
      });
    }
  );
});
