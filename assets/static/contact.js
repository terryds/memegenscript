/* Contact page: unscramble the ROT13 address so it is never in the markup as plain text */
(function () {
  "use strict";
  var card = document.querySelector(".contact-card");
  if (!card) return;
  var email = (card.getAttribute("data-contact") || "").replace(/[a-z]/gi, function (c) {
    var base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  if (!email) return;

  var link = card.querySelector(".contact-link");
  var mailto = card.querySelector(".contact-mailto");
  var copy = card.querySelector(".contact-copy");
  var reversed = card.querySelector(".contact-reversed");
  var hint = card.querySelector(".contact-hint");
  var href = "mailto:" + email;

  if (reversed) reversed.hidden = true;
  if (link) {
    link.textContent = email;
    link.href = href;
    link.hidden = false;
  }
  if (mailto) {
    mailto.href = href;
    mailto.hidden = false;
  }
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(email).then(
        function () {
          if (hint) hint.textContent = "Address copied.";
        },
        function () {
          if (hint) hint.textContent = "Could not copy — select the address above instead.";
        },
      );
    });
  }
})();
