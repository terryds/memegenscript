/* PWA glue: service worker registration and the mobile install banner. */
(function () {
  "use strict";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  // Google Analytics event; a no-op when analytics is off or blocked
  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }
  window.addEventListener("appinstalled", function () { track("pwa_install"); });

  var banner = document.getElementById("install-banner");
  if (!banner) return;
  var DISMISS_KEY = "memegenscript.install.dismissed";
  var DISMISS_DAYS = 14;
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var mobile = window.matchMedia("(max-width: 800px)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
  var dismissedAt = 0;
  try { dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0); } catch (e) {}
  var recentlyDismissed = dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000;
  if (standalone || !mobile || recentlyDismissed) return;

  var installButton = banner.querySelector("[data-install]");
  var closeButton = banner.querySelector("[data-close]");
  var hint = banner.querySelector("[data-hint]");
  var deferredPrompt = null;

  function show() { banner.hidden = false; document.body.classList.add("has-install-banner"); }
  function hide() { banner.hidden = true; document.body.classList.remove("has-install-banner"); }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    if (ios) return;
    installButton.hidden = false;
    hint.textContent = "Add the meme editor to your home screen. Works offline.";
    show();
  });

  if (ios) {
    installButton.hidden = true;
    hint.innerHTML = "Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install.";
    show();
  }

  installButton.addEventListener("click", function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      track("pwa_install_prompt", { outcome: choice && choice.outcome });
      deferredPrompt = null;
      hide();
    });
  });
  closeButton.addEventListener("click", function () {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
    hide();
  });
  window.addEventListener("appinstalled", hide);
})();
