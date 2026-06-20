// =====================================================================
// MT SpinLab — public content renderer (js/content.js)
// =====================================================================
// Runs on every page load (no sign-in required). Reads the site's
// content from Firestore and fills in the page — hero/about text,
// news, research areas, people, publications, teaching, contact info
// and footer. Everything here is a *live* listener, so edits made in
// the admin panel (Members → PI dashboard) appear immediately without
// a page reload.
//
// Firestore data model:
//   settings/home      { heroEyebrow, heroTitle, heroSub, heroLede,
//                         statFocus, statTools, statHome, aboutPara1, aboutPara2 }
//   settings/research  { intro }
//   settings/pi        { name, title, photoURL, bio, education[], interests[],
//                         scholarUrl, orcidUrl, githubUrl, cvUrl }
//   settings/contact   { address, phone, email, mapQuery, footerTagline }
//   news/{id}          { date, body, createdAt }
//   researchFields/{id}{ title, body, icon, createdAt }
//   members/{id}       { name, status ("current"|"alumni"), role, focus,
//                         institution, photoURL, createdAt }
//   publications/{id}  { year, title, authors, journal, details, doi, createdAt }
//   teaching/{id}      { code, title, body, createdAt }
// =====================================================================

import { db } from "./firebase-init.js";
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------------- helpers ----------------
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// Markdown -> inline HTML (bold/italic/links). Falls back to escaped
// plain text if the marked library hasn't loaded for some reason.
function mdInline(text) {
  if (!text) return "";
  if (window.marked && typeof window.marked.parseInline === "function") {
    return window.marked.parseInline(String(text));
  }
  return escapeHtml(text);
}

function setText(id, value) {
  if (!value) return; // keep the existing fallback copy already in the HTML
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  if (!value) return;
  var el = document.getElementById(id);
  if (el) el.innerHTML = mdInline(value);
}

// ---------------- research field icon presets ----------------
var RESEARCH_ICONS = {
  spins:
    '<g stroke="var(--cobalt)" stroke-width="2" stroke-linecap="round">' +
    '<line x1="20" y1="20" x2="20" y2="36"/><polygon points="14,22 20,12 26,22" fill="var(--cobalt)" stroke="none"/>' +
    '<line x1="44" y1="34" x2="44" y2="18"/><polygon points="38,32 44,42 50,32" fill="var(--cobalt)" stroke="none"/>' +
    '<line x1="68" y1="20" x2="68" y2="36"/><polygon points="62,22 68,12 74,22" fill="var(--cobalt)" stroke="none"/>' +
    '<line x1="92" y1="34" x2="92" y2="18"/><polygon points="86,32 92,42 98,32" fill="var(--cobalt)" stroke="none"/></g>' +
    '<g stroke="var(--ember)" stroke-width="2" stroke-linecap="round">' +
    '<line x1="20" y1="56" x2="20" y2="72"/><polygon points="14,58 20,48 26,58" fill="var(--ember)" stroke="none"/>' +
    '<line x1="44" y1="70" x2="44" y2="54"/><polygon points="38,68 44,78 50,68" fill="var(--ember)" stroke="none"/>' +
    '<line x1="68" y1="56" x2="68" y2="72"/><polygon points="62,58 68,48 74,58" fill="var(--ember)" stroke="none"/>' +
    '<line x1="92" y1="70" x2="92" y2="54"/><polygon points="86,68 92,78 98,68" fill="var(--ember)" stroke="none"/></g>',
  loop:
    '<g fill="none" stroke="var(--cobalt)" stroke-width="2">' +
    '<path d="M60 14 C76 14 86 28 86 44 C86 60 76 76 60 76 C44 76 34 60 34 44 C34 28 44 14 60 14Z"/></g>' +
    '<g stroke="var(--ember)" stroke-width="2" stroke-linecap="round">' +
    '<line x1="48" y1="36" x2="48" y2="24"/><polygon points="44,26 48,18 52,26" fill="var(--ember)" stroke="none"/>' +
    '<line x1="72" y1="52" x2="72" y2="64"/><polygon points="68,62 72,70 76,62" fill="var(--ember)" stroke="none"/></g>',
  torque:
    '<line x1="60" y1="16" x2="60" y2="52" stroke="var(--cobalt)" stroke-width="2.4" stroke-linecap="round"/>' +
    '<polygon points="52,18 60,4 68,18" fill="var(--cobalt)"/>' +
    '<path d="M60 52 C80 48 88 60 80 70" fill="none" stroke="var(--ember)" stroke-width="2.2" stroke-linecap="round"/>' +
    '<polygon points="76,64 86,70 78,78" fill="var(--ember)"/>' +
    '<line x1="30" y1="76" x2="90" y2="76" stroke="var(--line)" stroke-width="2"/>',
  stack:
    '<g fill="none" stroke="var(--cobalt)" stroke-width="2">' +
    '<ellipse cx="60" cy="24" rx="26" ry="8"/><ellipse cx="60" cy="44" rx="26" ry="8"/><ellipse cx="60" cy="64" rx="26" ry="8"/></g>' +
    '<line x1="34" y1="24" x2="34" y2="64" stroke="var(--cobalt)" stroke-width="2"/>' +
    '<line x1="86" y1="24" x2="86" y2="64" stroke="var(--cobalt)" stroke-width="2"/>' +
    '<line x1="60" y1="34" x2="60" y2="36" stroke="var(--ember)" stroke-width="3"/>',
  wave:
    '<line x1="14" y1="45" x2="106" y2="45" stroke="var(--line)" stroke-width="2"/>' +
    '<path d="M14 45 Q40 20 60 45 Q80 70 106 45" fill="none" stroke="var(--cobalt)" stroke-width="2.4"/>' +
    '<line x1="60" y1="20" x2="60" y2="70" stroke="var(--ember)" stroke-width="2" stroke-dasharray="3 4"/>' +
    '<polygon points="64,40 76,45 64,50" fill="var(--ember)"/>',
  atom:
    '<path d="M10 70 C30 70 35 20 60 20 C85 20 90 70 110 70" fill="none" stroke="var(--cobalt)" stroke-width="2.4"/>' +
    '<line x1="60" y1="20" x2="60" y2="70" stroke="var(--line)" stroke-width="1.6" stroke-dasharray="2 4"/>' +
    '<circle cx="32" cy="61" r="3" fill="var(--ember)"/><circle cx="88" cy="61" r="3" fill="var(--ember)"/>'
};
function researchIconSvg(key) {
  var inner = RESEARCH_ICONS[key] || RESEARCH_ICONS.spins;
  return '<svg class="research-art" viewBox="0 0 120 90" aria-hidden="true">' + inner + "</svg>";
}

// ---------------- scroll-reveal for dynamically-rendered cards ----------------
// (script.js used to do this once at page load, but these cards are now
// injected asynchronously from Firestore, so the reveal is applied here,
// right after each render, to any element that hasn't been revealed yet.)
var revealIO = "IntersectionObserver" in window
  ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "none";
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 })
  : null;

function revealNewCards(container, selector) {
  if (!revealIO || !container) return;
  container.querySelectorAll(selector).forEach(function (el) {
    if (el.dataset.revealed) return;
    el.dataset.revealed = "1";
    el.style.opacity = "0";
    el.style.transform = "translateY(14px)";
    el.style.transition = "opacity .5s ease, transform .5s ease";
    revealIO.observe(el);
  });
}

// ---------------- settings/home ----------------
onSnapshot(doc(db, "settings", "home"), function (snap) {
  if (!snap.exists()) return;
  var d = snap.data();
  setText("heroEyebrow", d.heroEyebrow);
  setText("heroTitle", d.heroTitle);
  setText("heroSub", d.heroSub);
  setHtml("heroLede", d.heroLede);
  setText("statFocus", d.statFocus);
  setText("statTools", d.statTools);
  setText("statHome", d.statHome);
  setHtml("aboutPara1", d.aboutPara1);
  setHtml("aboutPara2", d.aboutPara2);
});

// ---------------- settings/research ----------------
onSnapshot(doc(db, "settings", "research"), function (snap) {
  if (!snap.exists()) return;
  setHtml("researchIntro", snap.data().intro);
});

// ---------------- settings/pi ----------------
onSnapshot(doc(db, "settings", "pi"), function (snap) {
  if (!snap.exists()) return;
  var d = snap.data();

  setText("piName", d.name);
  setText("piTitle", d.title);
  setHtml("piBio", d.bio);

  if (d.photoURL) {
    var wrap = document.getElementById("piAvatarWrap");
    if (wrap) wrap.innerHTML = '<img class="avatar avatar-lg" src="' + escapeHtml(d.photoURL) + '" alt="' + escapeHtml(d.name || "PI photo") + '" />';
  }

  var eduList = document.getElementById("piEducationList");
  if (eduList && Array.isArray(d.education) && d.education.length) {
    eduList.innerHTML = d.education.map(function (line) {
      return "<li>" + escapeHtml(line) + "</li>";
    }).join("");
  }

  var tagList = document.getElementById("piInterestsList");
  if (tagList && Array.isArray(d.interests) && d.interests.length) {
    tagList.innerHTML = d.interests.map(function (tag) {
      return "<li>" + escapeHtml(tag) + "</li>";
    }).join("");
  }

  function showLink(id, itemId, url) {
    var a = document.getElementById(id);
    var item = itemId ? document.getElementById(itemId) : null;
    if (!a || !url) return;
    a.href = url;
    if (item) item.hidden = false;
  }
  showLink("piScholarLink", "piScholarItem", d.scholarUrl);
  showLink("piOrcidLink", "piOrcidItem", d.orcidUrl);
  if (d.cvUrl) {
    var cv = document.getElementById("piCvLink");
    if (cv) { cv.href = d.cvUrl; cv.hidden = false; }
  }
  if (d.githubUrl) {
    var fg = document.getElementById("footerGithubLink");
    if (fg) { fg.href = d.githubUrl; fg.hidden = false; }
  }
  if (d.scholarUrl) {
    var fs = document.getElementById("footerScholarLink");
    if (fs) { fs.href = d.scholarUrl; fs.hidden = false; }
  }
  if (d.orcidUrl) {
    var fo = document.getElementById("footerOrcidLink");
    if (fo) { fo.href = d.orcidUrl; fo.hidden = false; }
  }
});

// ---------------- settings/contact ----------------
onSnapshot(doc(db, "settings", "contact"), function (snap) {
  if (!snap.exists()) return;
  var d = snap.data();

  if (d.address) {
    var addr = escapeHtml(d.address).replace(/\n/g, "<br/>");
    var ca = document.getElementById("contactAddress");
    if (ca) ca.innerHTML = addr;
    var fa = document.getElementById("footerAddress");
    if (fa) fa.innerHTML = addr;
  }
  setText("contactPhone", d.phone);
  setText("footerTagline", d.footerTagline);

  if (d.email) {
    window.MT_CONTACT_EMAIL = d.email; // read by js/script.js when the contact form sends
    var ce = document.getElementById("contactEmailLink");
    if (ce) { ce.href = "mailto:" + d.email; ce.textContent = d.email; }
    var fe = document.getElementById("footerEmailLink");
    if (fe) { fe.href = "mailto:" + d.email; fe.textContent = d.email; }
    var pe = document.getElementById("piEmailLink");
    if (pe) pe.href = "mailto:" + d.email;
  }

  if (d.mapQuery) {
    var frame = document.getElementById("contactMapFrame");
    if (frame) frame.src = "https://www.google.com/maps?q=" + encodeURIComponent(d.mapQuery) + "&output=embed";
  }
});

// ---------------- news ----------------
onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), function (snap) {
  var list = document.getElementById("newsList");
  if (!list) return;
  if (snap.empty) {
    list.innerHTML = '<li class="news-item"><p class="dash-empty">No news yet.</p></li>';
    return;
  }
  list.innerHTML = snap.docs.map(function (d) {
    var n = d.data();
    return (
      '<li class="news-item"><svg class="icon news-icon" viewBox="0 0 24 24"><use href="#i-news"/></svg><div>' +
      '<span class="news-date">' + escapeHtml(n.date || "") + "</span>" +
      "<p>" + mdInline(n.body) + "</p></div></li>"
    );
  }).join("");
  revealNewCards(list, ".news-item");
});

// ---------------- research fields ----------------
onSnapshot(query(collection(db, "researchFields"), orderBy("createdAt", "asc")), function (snap) {
  var grid = document.getElementById("researchGrid");
  if (!grid) return;
  if (snap.empty) {
    grid.innerHTML = '<p class="dash-empty">No research areas added yet.</p>';
    return;
  }
  grid.innerHTML = snap.docs.map(function (d) {
    var r = d.data();
    return (
      '<article class="research-card">' + researchIconSvg(r.icon) +
      "<h3>" + escapeHtml(r.title || "") + "</h3>" +
      "<p>" + mdInline(r.body) + "</p></article>"
    );
  }).join("");
  revealNewCards(grid, ".research-card");
});

// ---------------- members (current + alumni) ----------------
onSnapshot(query(collection(db, "members"), orderBy("createdAt", "asc")), function (snap) {
  var currentGrid = document.getElementById("currentMembersGrid");
  var alumniGrid = document.getElementById("alumniMembersGrid");
  if (!currentGrid || !alumniGrid) return;

  var current = [];
  var alumni = [];
  snap.forEach(function (docSnap) {
    var m = docSnap.data();
    if ((m.status || "current") === "alumni") alumni.push(m);
    else current.push(m);
  });

  function initials(name) {
    return (name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase();
  }
  function avatarHtml(m) {
    if (m.photoURL) return '<img class="avatar" src="' + escapeHtml(m.photoURL) + '" alt="' + escapeHtml(m.name || "") + '" />';
    return '<div class="avatar">' + escapeHtml(initials(m.name)) + "</div>";
  }

  currentGrid.innerHTML = current.length
    ? current.map(function (m) {
        return (
          '<article class="member-card">' + avatarHtml(m) +
          "<h4>" + escapeHtml(m.name || "") + "</h4>" +
          '<p class="member-role">' + escapeHtml(m.role || "") + "</p>" +
          '<p class="member-focus">' + mdInline(m.focus) + "</p></article>"
        );
      }).join("")
    : '<p class="dash-empty">No current members listed yet.</p>';

  alumniGrid.innerHTML = alumni.length
    ? alumni.map(function (m) {
        var inst = m.institution ? " &middot; now at " + escapeHtml(m.institution) : "";
        return (
          '<article class="member-card member-card--alum">' + avatarHtml(m) +
          "<h4>" + escapeHtml(m.name || "") + "</h4>" +
          '<p class="member-role">' + escapeHtml(m.role || "") + inst + "</p></article>"
        );
      }).join("")
    : '<p class="dash-empty">No alumni listed yet.</p>';

  revealNewCards(currentGrid, ".member-card");
  revealNewCards(alumniGrid, ".member-card");
});

// ---------------- publications (grouped by year, newest first) ----------------
onSnapshot(query(collection(db, "publications"), orderBy("createdAt", "desc")), function (snap) {
  var wrap = document.getElementById("pubYears");
  if (!wrap) return;
  if (snap.empty) {
    wrap.innerHTML = '<p class="dash-empty">No publications added yet.</p>';
    return;
  }

  var byYear = {};
  snap.forEach(function (docSnap) {
    var p = docSnap.data();
    var y = String(p.year || "Undated");
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(p);
  });

  var years = Object.keys(byYear).sort(function (a, b) { return Number(b) - Number(a); });

  wrap.innerHTML = years.map(function (y, idx) {
    var items = byYear[y].map(function (p) {
      var doiLink = p.doi
        ? ' &middot; <a href="' + escapeHtml(p.doi) + '" target="_blank" rel="noopener">DOI <svg class="icon icon-sm" viewBox="0 0 24 24"><use href="#i-ext"/></svg></a>'
        : "";
      return (
        "<li>" +
        '<p class="pub-title">' + escapeHtml(p.title || "") + "</p>" +
        '<p class="pub-meta">' + escapeHtml(p.authors || "") + " &middot; <em>" + escapeHtml(p.journal || "") + "</em>" +
        (p.details ? " &middot; " + escapeHtml(p.details) : "") + doiLink + "</p>" +
        "</li>"
      );
    }).join("");
    return (
      '<details class="pub-year"' + (idx === 0 ? " open" : "") + ">" +
      "<summary><span>" + escapeHtml(y) + '</span><svg class="icon" viewBox="0 0 24 24"><use href="#i-down"/></svg></summary>' +
      '<ol class="pub-list">' + items + "</ol></details>"
    );
  }).join("");
  revealNewCards(wrap, ".pub-year");
});

// ---------------- teaching ----------------
onSnapshot(query(collection(db, "teaching"), orderBy("createdAt", "asc")), function (snap) {
  var grid = document.getElementById("teachingGrid");
  if (!grid) return;
  if (snap.empty) {
    grid.innerHTML = '<p class="dash-empty">No courses added yet.</p>';
    return;
  }
  grid.innerHTML = snap.docs.map(function (d) {
    var t = d.data();
    return (
      '<article class="teaching-card"><span class="course-code">' + escapeHtml(t.code || "") + "</span>" +
      "<h3>" + escapeHtml(t.title || "") + "</h3>" +
      "<p>" + mdInline(t.body) + "</p></article>"
    );
  }).join("");
  revealNewCards(grid, ".teaching-card");
});
