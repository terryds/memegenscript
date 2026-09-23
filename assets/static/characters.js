/* Character page: download / copy the transparent PNG, and count how it was used */
(function () {
  "use strict";
  var article = document.querySelector("article.character");
  if (!article) return;
  var id = article.getAttribute("data-character");
  var status = document.getElementById("character-status");
  var download = article.querySelector('[data-action="download"]');
  var copyImage = article.querySelector('[data-action="copy-image"]');
  var copyLink = article.querySelector('[data-action="copy-link"]');
  var imageUrl = download ? download.href.replace(/\?download=1$/, "") : "";

  // Google Analytics event; a no-op when analytics is off or blocked
  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }

  function say(message) {
    if (status) status.textContent = message;
  }

  if (download) {
    download.addEventListener("click", function () {
      track("character_download", { character_id: id, method: "download_png" });
    });
  }

  if (copyImage) {
    if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") {
      copyImage.hidden = true;
    } else {
      copyImage.addEventListener("click", function () {
        say("Copying…");
        fetch(imageUrl)
          .then(function (response) {
            if (!response.ok) throw new Error("fetch failed");
            return response.blob();
          })
          .then(function (blob) {
            return navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
          })
          .then(function () {
            say("Copied the image. Paste it anywhere that accepts images.");
            track("character_download", { character_id: id, method: "copy_image" });
          })
          .catch(function () {
            say("Couldn’t copy the image in this browser. Use Download instead.");
          });
      });
    }
  }

  if (copyLink) {
    copyLink.addEventListener("click", function () {
      var done = function () {
        say("Copied the image URL.");
        track("character_download", { character_id: id, method: "copy_link" });
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(imageUrl).then(done, function () {
          window.prompt("Copy the image URL:", imageUrl);
        });
      } else {
        window.prompt("Copy the image URL:", imageUrl);
      }
    });
  }
})();
