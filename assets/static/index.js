/* Template and character index: instant client-side filtering that mirrors the ?q= server filter */
(function () {
  "use strict";
  var input = document.getElementById("q");
  var grid = document.getElementById("grid");
  var featured = document.querySelector(".featured");
  var count = document.getElementById("count");
  var empty = document.getElementById("empty");
  if (!input || !grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));
  // "templates" on the home page, "characters" on the character index
  var noun = (count && count.getAttribute("data-noun")) || "template";
  var nounPlural = (count && count.getAttribute("data-noun-plural")) || "templates";
  var searchTimer = null;
  var lastTracked = "";

  // Google Analytics event; a no-op when analytics is off or blocked
  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }

  function apply() {
    var query = input.value.trim().toLowerCase();
    // Word-based like the server's ?q= filter: every term must appear somewhere,
    // so "buzz clone" finds "Buzz Lightyear Clones".
    var terms = query.split(/\s+/).filter(Boolean);
    var visible = 0;
    cards.forEach(function (card) {
      var haystack = card.getAttribute("data-search") + " " + card.getAttribute("data-id");
      var match = terms.every(function (term) {
        return haystack.indexOf(term) !== -1;
      });
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (count) count.textContent = visible + " " + (visible === 1 ? noun : nounPlural);
    if (featured) featured.hidden = !!query;
    if (empty) empty.hidden = visible > 0;
    // One event per settled query, not one per keystroke
    clearTimeout(searchTimer);
    if (query.length >= 2 && query !== lastTracked) {
      searchTimer = setTimeout(function () {
        lastTracked = query;
        track("search", { search_term: query, results: visible });
      }, 1500);
    }
    if (history.replaceState) {
      var url = new URL(input.form.getAttribute("action") || "/", window.location.href);
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      history.replaceState(null, "", url.toString());
    }
  }

  input.addEventListener("input", apply);
  input.form.addEventListener("submit", function (event) {
    event.preventDefault();
    apply();
  });
})();
