/* Template index: instant client-side filtering that mirrors the ?q= server filter */
(function () {
  "use strict";
  var input = document.getElementById("q");
  var grid = document.getElementById("grid");
  var count = document.getElementById("count");
  var empty = document.getElementById("empty");
  if (!input || !grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));

  function apply() {
    var query = input.value.trim().toLowerCase();
    var visible = 0;
    cards.forEach(function (card) {
      var match = !query || card.getAttribute("data-search").indexOf(query) !== -1 || card.getAttribute("data-id").indexOf(query) !== -1;
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (count) count.textContent = visible + " templates";
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
