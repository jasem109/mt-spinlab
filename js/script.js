/* =========================================================
   MT SpinLab — script.js
   Handles: single-page navigation between sections, mobile
   menu, scroll progress bar, scroll hint, and the contact form.
   ========================================================= */
(function () {
  "use strict";

  var pages = Array.prototype.slice.call(document.querySelectorAll("[data-page]"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-link]"));
  var navLinksWrap = document.getElementById("navLinks");
  var navToggle = document.getElementById("navToggle");
  var main = document.getElementById("main");
  var pageIds = pages.map(function (p) { return p.id; });

  function pageTitle(id) {
    var titles = {
      home: "MT SpinLab — Computational Spintronics & Magnetism",
      research: "Research — MT SpinLab",
      people: "People — MT SpinLab",
      publications: "Publications — MT SpinLab",
      teaching: "Teaching — MT SpinLab",
      contact: "Contact — MT SpinLab",
      members: "Members — MT SpinLab"
    };
    return titles[id] || "MT SpinLab";
  }

  function showPage(id, opts) {
    if (pageIds.indexOf(id) === -1) id = "home";
    opts = opts || {};

    pages.forEach(function (p) {
      if (p.id === id) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });

    navLinks.forEach(function (a) {
      var target = a.getAttribute("href").replace("#", "");
      a.classList.toggle("active", target === id);
    });

    document.title = pageTitle(id);

    if (!opts.skipScroll) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    closeMobileMenu();
  }

  function currentHash() {
    return (window.location.hash || "#home").replace("#", "");
  }

  // Nav link clicks
  navLinks.forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href");
      if (href.charAt(0) !== "#") return; // external links unaffected
      e.preventDefault();
      var id = href.replace("#", "");
      if (id === currentHash()) {
        showPage(id);
      } else {
        window.location.hash = id; // triggers hashchange -> showPage
      }
    });
  });

  window.addEventListener("hashchange", function () {
    showPage(currentHash());
  });

  // Initial load
  document.addEventListener("DOMContentLoaded", function () {
    showPage(currentHash(), { skipScroll: true });
  });

  // ---------------- Mobile menu ----------------
  function closeMobileMenu() {
    if (!navLinksWrap || !navToggle) return;
    navLinksWrap.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && navLinksWrap) {
    navToggle.addEventListener("click", function () {
      var isOpen = navLinksWrap.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  // ---------------- Scroll progress bar ----------------
  var scrollField = document.getElementById("scrollField");
  function updateScrollProgress() {
    if (!scrollField) return;
    var doc = document.documentElement;
    var scrollTop = window.scrollY || doc.scrollTop;
    var height = doc.scrollHeight - doc.clientHeight;
    var pct = height > 0 ? (scrollTop / height) * 100 : 0;
    scrollField.style.width = pct + "%";
  }
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress);

  // ---------------- Hero scroll hint ----------------
  var scrollHint = document.getElementById("scrollHint");
  if (scrollHint) {
    scrollHint.addEventListener("click", function () {
      var about = document.getElementById("aboutSection");
      if (about) about.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ---------------- Footer year ----------------
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------------- Contact form (sends via EmailJS — no email client popup) ----------------
  var form = document.getElementById("contactForm");
  var note = document.getElementById("formNote");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var subject = form.elements.subject.value.trim() || "Message from " + name;
      var message = form.elements.message.value.trim();

      if (!name || !email || !message) {
        note.textContent = "Please fill in your name, email and message.";
        return;
      }

      if (!window.emailjs) {
        note.textContent = "Sorry, the contact form couldn't load. Please email us directly instead.";
        return;
      }

      note.textContent = "Sending…";
      var submitBtn = form.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.disabled = true;

      window.emailjs
        .send(
          "service_nb7u53n",          // EmailJS service ID — same as firebase-config.js
          "YOUR_CONTACT_TEMPLATE_ID", // <-- create a template in your EmailJS dashboard for the contact form, paste its ID here
          {
            from_name: name,
            from_email: email,
            subject: subject,
            message: message,
            // Set by js/content.js once it reads settings/contact from Firestore.
            // Falls back to the placeholder address until that's configured.
            to_email: window.MT_CONTACT_EMAIL || "torikul.islam@example.edu"
          },
          "Kwv_b744tmyJeh72s"         // EmailJS public key — same as firebase-config.js
        )
        .then(function () {
          note.textContent = "Thanks! Your message has been sent.";
          form.reset();
        })
        .catch(function (err) {
          console.error(err);
          note.textContent = "Sorry, something went wrong. Please try again.";
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }
})();
