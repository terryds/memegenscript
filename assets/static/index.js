/* Template index: instant client-side filtering that mirrors the ?q= server filter */
(function () {
  "use strict";
  var input = document.getElementById("q");
  var grid = document.getElementById("grid");
  var featured = document.querySelector(".featured");
  var count = document.getElementById("count");
  var empty = document.getElementById("empty");
  if (!input || !grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));

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
    if (count) count.textContent = visible + (visible === 1 ? " template" : " templates");
    if (featured) featured.hidden = !!query;
    if (empty) empty.hidden = visible > 0;
    if (history.replaceState) {
      var url = new URL(window.location.href);
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
