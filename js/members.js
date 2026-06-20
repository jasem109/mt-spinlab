// =====================================================================
// MT SpinLab — Member Portal (js/members.js)
// =====================================================================
// Handles the #members page:
//   1. "Continue with Google" sign-in (Firebase Authentication).
//   2. On a brand-new sign-in, creates a Firestore profile with
//      role "pending" — except the PI's own Google account (matched by
//      email, see firebase-config.js), which is auto-approved as "pi".
//   3. While pending/rejected, shows a status card instead of the
//      dashboard. This is a *live* Firestore listener, so the moment the
//      PI approves someone, their screen updates on its own — no reload.
//   4. Once approved ("member" or "pi"), shows the dashboard: Projects,
//      Lab Docs, Chat and Events. The PI additionally gets a "Requests"
//      tab to approve/decline pending sign-ups, and full write access.
//
// Firestore data model — see README.txt for setup & security rules:
//   users/{uid}    { name, email, photoURL, role: "pending"|"member"|"pi"|"rejected", requestedAt }
//   projects/{id}  { title, status, description, updatedAt, createdBy }
//   labdocs/{id}   { title, url, addedAt, addedBy }
//   events/{id}    { title, date ("YYYY-MM-DD"), location, description, addedBy }
//   messages/{id}  { threadId, senderId, senderName, text, createdAt }
//                  threadId is always the MEMBER's uid — that's what ties
//                  a member's messages and the PI's replies into one
//                  private thread per member.
// =====================================================================

import { PI_EMAIL, emailjsConfig } from "./firebase-config.js";
import { auth, db } from "./firebase-init.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  deleteDoc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const provider = new GoogleAuthProvider();

// ---------------- DOM references ----------------
const loginCard = document.getElementById("loginCard");
const statusCard = document.getElementById("statusCard");
const dashboard = document.getElementById("dashboard");
const googleBtn = document.getElementById("googleBtn");
const loginNote = document.getElementById("loginNote");
const statusTitle = document.getElementById("statusTitle");
const statusMessage = document.getElementById("statusMessage");
const statusSignOut = document.getElementById("statusSignOut");
const logoutBtn = document.getElementById("logoutBtn");
const dashName = document.getElementById("dashName");

// ---------------- helpers ----------------
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// Builds a .dash-card with Edit/Delete buttons for the site-content admin lists.
function adminCard(headHtml, bodyHtml, onEdit, onDelete) {
  const el = document.createElement("div");
  el.className = "dash-card";
  el.innerHTML =
    '<div class="dash-card-head">' + headHtml +
    '<span class="dash-card-actions">' +
    '<button type="button" class="icon-btn" data-act="edit" aria-label="Edit"><svg class="icon" viewBox="0 0 24 24"><use href="#i-edit"/></svg></button>' +
    '<button type="button" class="icon-btn" data-act="delete" aria-label="Delete"><svg class="icon" viewBox="0 0 24 24"><use href="#i-trash"/></svg></button>' +
    "</span></div>" +
    (bodyHtml || "");
  el.querySelector('[data-act="edit"]').addEventListener("click", onEdit);
  el.querySelector('[data-act="delete"]').addEventListener("click", onDelete);
  return el;
}

let unsubs = [];          // dashboard listeners (Projects/Docs/Events/Chat/Requests) — cleared on sign-out
let profileUnsub = null;  // the live listener on the signed-in user's own profile doc
let bootstrapping = false;
let lastRole = null;      // tracks whether dashboard listeners are already set up this session

function clearListeners() {
  unsubs.forEach(function (u) { u(); });
  unsubs = [];
}

function showCard(which) {
  loginCard.hidden = which !== "login";
  statusCard.hidden = which !== "status";
  dashboard.hidden = which !== "dashboard";
}

// ---------------- Google sign-in / sign-out ----------------
googleBtn.addEventListener("click", function () {
  loginNote.textContent = "Opening Google sign-in…";
  signInWithPopup(auth, provider).catch(function (err) {
    console.error(err);
    loginNote.textContent =
      err.code === "auth/popup-closed-by-user" ? "" : "Sign-in failed: " + err.code;
  });
});

function doSignOut() { signOut(auth); }
statusSignOut.addEventListener("click", doSignOut);
logoutBtn.addEventListener("click", doSignOut);

// ---------------- auth state ----------------
onAuthStateChanged(auth, function (user) {
  clearListeners();
  if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  lastRole = null;

  if (!user) {
    showCard("login");
    loginNote.textContent = "";
    return;
  }

  const ref = doc(db, "users", user.uid);
  profileUnsub = onSnapshot(
    ref,
    function (snap) {
      if (!snap.exists()) {
        if (bootstrapping) return; // creation already in flight
        bootstrapping = true;
        const isPiAccount = (user.email || "").toLowerCase() === PI_EMAIL.toLowerCase();
        const profile = {
          name: user.displayName || user.email || "Member",
          email: user.email || "",
          photoURL: user.photoURL || "",
          role: isPiAccount ? "pi" : "pending",
          requestedAt: serverTimestamp()
        };
        setDoc(ref, profile)
          .then(function () {
            bootstrapping = false;
            if (!isPiAccount) notifyPI(profile.name, profile.email);
          })
          .catch(function (err) {
            bootstrapping = false;
            loginNote.textContent = "Could not create your profile — please try again.";
            console.error(err);
          });
        return;
      }
      applyProfile(snap.data(), user.uid);
    },
    function (err) {
      console.error(err);
      showCard("login");
      loginNote.textContent = "Could not load your profile: " + err.code;
    }
  );
});

function applyProfile(profile, uid) {
  const role = profile.role;

  if (role === "pending") {
    showCard("status");
    statusTitle.textContent = "Request sent";
    statusMessage.textContent =
      "Thanks! Your request to join MT SpinLab's member portal has been sent to " +
      "Prof. Md. Torikul Islam. You'll get access as soon as it's approved — " +
      "no need to refresh, this page updates on its own.";
    lastRole = role;
    return;
  }

  if (role === "rejected") {
    showCard("status");
    statusTitle.textContent = "Access not approved";
    statusMessage.textContent =
      "Your request to join the member portal wasn't approved. If you think " +
      "this is a mistake, please contact Prof. Islam directly.";
    lastRole = role;
    return;
  }

  // role is "member" or "pi"
  showCard("dashboard");
  dashName.textContent = (profile.name || profile.email) + (role === "pi" ? " · Principal Investigator" : "");
  document.querySelectorAll(".tab-pi-only").forEach(function (el) { el.hidden = role !== "pi"; });
  if (role !== "pi") {
    // a non-PI member should never land on a PI-only panel
    const firstVisibleTab = document.querySelector('.dash-tab:not(.tab-pi-only)');
    if (firstVisibleTab && document.querySelector(".dash-tab.active")?.classList.contains("tab-pi-only")) {
      firstVisibleTab.click();
    }
  }

  const justApproved = lastRole !== "member" && lastRole !== "pi";
  lastRole = role;
  if (!justApproved) return; // dashboard listeners already running this session

  initProjects(role, uid);
  initDocs(role, uid);
  initEvents(role, uid);
  initChat(role, uid, profile.name || profile.email);
  if (role === "pi") {
    initRequests();
    initHomeSettings();
    initNews();
    initResearchSettings();
    initResearchFields();
    initPiSettings();
    initMembers();
    initPublications();
    initTeaching();
    initContactSettings();
  }
}

// ---------------- dashboard tab switching ----------------
document.querySelectorAll(".dash-tab").forEach(function (btn) {
  btn.addEventListener("click", function () {
    document.querySelectorAll(".dash-tab").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".dash-panel").forEach(function (p) { p.classList.remove("active"); });
    btn.classList.add("active");
    document.querySelector('.dash-panel[data-panel="' + btn.dataset.tab + '"]').classList.add("active");
  });
});

// ---------------- Requests (PI only) ----------------
function initRequests() {
  const list = document.getElementById("requestsList");
  const badge = document.getElementById("requestsBadge");

  const q = query(collection(db, "users"), where("role", "==", "pending"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (badge) {
        if (snap.size > 0) { badge.hidden = false; badge.textContent = String(snap.size); }
        else { badge.hidden = true; }
      }
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No pending requests.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const u = docSnap.data();
        const el = document.createElement("div");
        el.className = "dash-card request-card";
        el.innerHTML =
          '<div class="dash-card-head"><h4>' + escapeHtml(u.name) + "</h4></div>" +
          '<p class="dash-card-meta">' + escapeHtml(u.email) + "</p>" +
          '<div class="request-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-approve="' + docSnap.id + '">Approve</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-decline="' + docSnap.id + '">Decline</button>' +
          "</div>";
        list.appendChild(el);
      });

      list.querySelectorAll("[data-approve]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          updateDoc(doc(db, "users", btn.dataset.approve), { role: "member", approvedAt: serverTimestamp() }).catch(
            function (err) { alert("Could not approve: " + err.message); }
          );
        });
      });
      list.querySelectorAll("[data-decline]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          updateDoc(doc(db, "users", btn.dataset.decline), { role: "rejected" }).catch(function (err) {
            alert("Could not decline: " + err.message);
          });
        });
      });
    },
    function (err) {
      list.innerHTML = '<p class="dash-empty">Could not load requests (' + err.code + ").</p>";
    }
  );
  unsubs.push(unsub);
}

// ---------------- notify the PI of a new request (optional, via EmailJS) ----------------
function notifyPI(applicantName, applicantEmail) {
  if (!window.emailjs) return;
  if (!emailjsConfig || emailjsConfig.serviceId.indexOf("YOUR_") === 0) return; // not configured — skip silently

  window.emailjs
    .send(
      emailjsConfig.serviceId,
      emailjsConfig.templateId,
      {
        to_email: PI_EMAIL,
        applicant_name: applicantName,
        applicant_email: applicantEmail,
        portal_link: window.location.origin + window.location.pathname + "#members"
      },
      emailjsConfig.publicKey
    )
    .catch(function (err) {
      // Non-fatal: the in-app Requests tab still works without email.
      console.warn("EmailJS notification failed:", err);
    });
}

// ---------------- Projects ----------------
function initProjects(role, uid) {
  const list = document.getElementById("projectsList");
  const form = document.getElementById("projectForm");
  form.hidden = role !== "pi";

  const q = query(collection(db, "projects"), orderBy("updatedAt", "desc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No projects yet.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const p = docSnap.data();
        const el = document.createElement("div");
        el.className = "dash-card";
        el.innerHTML =
          '<div class="dash-card-head"><h4>' + escapeHtml(p.title) + "</h4>" +
          (p.status ? '<span class="status-pill">' + escapeHtml(p.status) + "</span>" : "") +
          "</div>" +
          (p.description ? "<p>" + escapeHtml(p.description) + "</p>" : "");
        list.appendChild(el);
      });
    },
    function (err) {
      list.innerHTML = '<p class="dash-empty">Could not load projects (' + err.code + ").</p>";
    }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const title = document.getElementById("project-title").value.trim();
    const status = document.getElementById("project-status").value.trim();
    const desc = document.getElementById("project-desc").value.trim();
    if (!title) return;
    addDoc(collection(db, "projects"), {
      title: title,
      status: status,
      description: desc,
      updatedAt: serverTimestamp(),
      createdBy: uid
    })
      .then(function () { form.reset(); })
      .catch(function (err) { alert("Could not add project: " + err.message); });
  };
}

// ---------------- Lab Docs ----------------
function initDocs(role, uid) {
  const list = document.getElementById("docsList");
  const form = document.getElementById("docForm");
  form.hidden = role !== "pi";

  const q = query(collection(db, "labdocs"), orderBy("addedAt", "desc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No documents yet.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const d = docSnap.data();
        const el = document.createElement("a");
        el.className = "dash-card dash-card-link";
        el.href = d.url || "#";
        el.target = "_blank";
        el.rel = "noopener";
        el.innerHTML =
          "<h4>" + escapeHtml(d.title || "Untitled") + '</h4><span class="dash-card-meta">Open document →</span>';
        list.appendChild(el);
      });
    },
    function (err) {
      list.innerHTML = '<p class="dash-empty">Could not load documents (' + err.code + ").</p>";
    }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const title = document.getElementById("doc-title").value.trim();
    const url = document.getElementById("doc-url").value.trim();
    if (!title || !url) return;
    addDoc(collection(db, "labdocs"), {
      title: title,
      url: url,
      addedAt: serverTimestamp(),
      addedBy: uid
    })
      .then(function () { form.reset(); })
      .catch(function (err) { alert("Could not add document: " + err.message); });
  };
}

// ---------------- Events ----------------
function initEvents(role, uid) {
  const list = document.getElementById("eventsList");
  const form = document.getElementById("eventForm");
  form.hidden = role !== "pi";

  const q = query(collection(db, "events"), orderBy("date", "asc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No upcoming events.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const ev = docSnap.data();
        const el = document.createElement("div");
        el.className = "dash-card";
        el.innerHTML =
          '<div class="dash-card-head"><h4>' + escapeHtml(ev.title) + "</h4>" +
          '<span class="status-pill">' + escapeHtml(ev.date || "") + "</span></div>" +
          (ev.location ? '<p class="dash-card-meta">' + escapeHtml(ev.location) + "</p>" : "") +
          (ev.description ? "<p>" + escapeHtml(ev.description) + "</p>" : "");
        list.appendChild(el);
      });
    },
    function (err) {
      list.innerHTML = '<p class="dash-empty">Could not load events (' + err.code + ").</p>";
    }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const title = document.getElementById("event-title").value.trim();
    const date = document.getElementById("event-date").value;
    const location = document.getElementById("event-location").value.trim();
    const desc = document.getElementById("event-desc").value.trim();
    if (!title || !date) return;
    addDoc(collection(db, "events"), {
      title: title,
      date: date,
      location: location,
      description: desc,
      addedAt: serverTimestamp(),
      addedBy: uid
    })
      .then(function () { form.reset(); })
      .catch(function (err) { alert("Could not add event: " + err.message); });
  };
}

// ---------------- Chat (private 1:1 thread per member ↔ PI) ----------------
function initChat(role, uid, name) {
  const threadsBox = document.getElementById("chatThreads");
  const chatWith = document.getElementById("chatWith");
  const messagesBox = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");

  let currentThreadId = role === "pi" ? null : uid;

  function subscribeThread(threadId, label) {
    chatWith.textContent = "Conversation with " + label;
    messagesBox.innerHTML = '<p class="dash-empty">Loading messages…</p>';
    const q = query(
      collection(db, "messages"),
      where("threadId", "==", threadId),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      q,
      function (snap) {
        if (snap.empty) {
          messagesBox.innerHTML = '<p class="dash-empty">No messages yet — say hello!</p>';
          return;
        }
        messagesBox.innerHTML = "";
        snap.forEach(function (docSnap) {
          const m = docSnap.data();
          const mine = m.senderId === uid;
          const bubble = document.createElement("div");
          bubble.className = "msg " + (mine ? "msg-mine" : "msg-theirs");
          bubble.innerHTML =
            '<span class="msg-sender">' + escapeHtml(m.senderName) + "</span><p>" + escapeHtml(m.text) + "</p>";
          messagesBox.appendChild(bubble);
        });
        messagesBox.scrollTop = messagesBox.scrollHeight;
      },
      function (err) {
        messagesBox.innerHTML = '<p class="dash-empty">Could not load messages (' + err.code + ").</p>";
      }
    );
    unsubs.push(unsub);
  }

  if (role === "pi") {
    threadsBox.hidden = false;
    chatWith.textContent = "Select a member to view the conversation";
    messagesBox.innerHTML = "";

    const uq = query(collection(db, "users"), where("role", "==", "member"));
    const uunsub = onSnapshot(uq, function (snap) {
      threadsBox.innerHTML = "";
      if (snap.empty) {
        threadsBox.innerHTML = '<p class="dash-empty">No approved members yet.</p>';
        return;
      }
      snap.forEach(function (docSnap) {
        const u = docSnap.data();
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "thread-item";
        btn.textContent = u.name || u.email || "Member";
        btn.addEventListener("click", function () {
          document.querySelectorAll(".thread-item").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          currentThreadId = docSnap.id;
          subscribeThread(currentThreadId, u.name || "Member");
        });
        threadsBox.appendChild(btn);
      });
    });
    unsubs.push(uunsub);
  } else {
    threadsBox.hidden = true;
    subscribeThread(uid, "Prof. Md. Torikul Islam");
  }

  chatForm.onsubmit = function (e) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    if (role === "pi" && !currentThreadId) {
      alert("Select a member from the list first.");
      return;
    }
    addDoc(collection(db, "messages"), {
      threadId: currentThreadId,
      senderId: uid,
      senderName: name,
      text: text,
      createdAt: serverTimestamp()
    })
      .then(function () { chatInput.value = ""; })
      .catch(function (err) { alert("Could not send message: " + err.message); });
  };
}

// =====================================================================
// SITE CONTENT ADMIN (PI only) — everything below writes to the public
// `settings/*` docs and `news` / `researchFields` / `members` /
// `publications` / `teaching` collections that js/content.js renders
// on the public pages. A signed-out visitor can read these (see the
// Firestore rules in README.txt) but only the PI account can write.
// =====================================================================

function saveNote(el, ok, msg) {
  el.textContent = msg;
  if (ok) setTimeout(function () { if (el.textContent === msg) el.textContent = ""; }, 2500);
}

// ---------------- Home page: hero & about ----------------
function initHomeSettings() {
  const form = document.getElementById("homeSettingsForm");
  const note = document.getElementById("homeSettingsNote");
  const ref = doc(db, "settings", "home");

  getDoc(ref)
    .then(function (snap) {
      if (!snap.exists()) return;
      const d = snap.data();
      document.getElementById("home-eyebrow").value = d.heroEyebrow || "";
      document.getElementById("home-title").value = d.heroTitle || "";
      document.getElementById("home-sub").value = d.heroSub || "";
      document.getElementById("home-lede").value = d.heroLede || "";
      document.getElementById("home-stat-focus").value = d.statFocus || "";
      document.getElementById("home-stat-tools").value = d.statTools || "";
      document.getElementById("home-stat-home").value = d.statHome || "";
      document.getElementById("home-about1").value = d.aboutPara1 || "";
      document.getElementById("home-about2").value = d.aboutPara2 || "";
    })
    .catch(function (err) { saveNote(note, false, "Could not load: " + err.code); });

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = {
      heroEyebrow: document.getElementById("home-eyebrow").value.trim(),
      heroTitle: document.getElementById("home-title").value.trim(),
      heroSub: document.getElementById("home-sub").value.trim(),
      heroLede: document.getElementById("home-lede").value.trim(),
      statFocus: document.getElementById("home-stat-focus").value.trim(),
      statTools: document.getElementById("home-stat-tools").value.trim(),
      statHome: document.getElementById("home-stat-home").value.trim(),
      aboutPara1: document.getElementById("home-about1").value.trim(),
      aboutPara2: document.getElementById("home-about2").value.trim()
    };
    saveNote(note, false, "Saving…");
    setDoc(ref, data, { merge: true })
      .then(function () { saveNote(note, true, "Saved ✓"); })
      .catch(function (err) { saveNote(note, false, "Could not save: " + err.code); });
  };
}

// ---------------- News ----------------
function initNews() {
  const list = document.getElementById("newsAdminList");
  const form = document.getElementById("newsForm");
  const dateInput = document.getElementById("news-date");
  const bodyInput = document.getElementById("news-body");
  const editingId = document.getElementById("news-editing-id");
  const submitBtn = document.getElementById("newsSubmitBtn");
  const cancelBtn = document.getElementById("newsCancelEdit");

  function resetForm() {
    form.reset();
    editingId.value = "";
    submitBtn.textContent = "Add news item";
    cancelBtn.hidden = true;
  }
  cancelBtn.addEventListener("click", resetForm);

  const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No news yet — add your first item above.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const n = docSnap.data();
        list.appendChild(
          adminCard(
            "<h4>" + escapeHtml(n.date || "") + "</h4>",
            "<p>" + escapeHtml(n.body || "") + "</p>",
            function () {
              dateInput.value = n.date || "";
              bodyInput.value = n.body || "";
              editingId.value = docSnap.id;
              submitBtn.textContent = "Update news item";
              cancelBtn.hidden = false;
              form.scrollIntoView({ behavior: "smooth", block: "center" });
            },
            function () {
              if (confirm("Delete this news item?")) {
                deleteDoc(doc(db, "news", docSnap.id)).catch(function (err) { alert("Could not delete: " + err.message); });
              }
            }
          )
        );
      });
    },
    function (err) { list.innerHTML = '<p class="dash-empty">Could not load news (' + err.code + ").</p>"; }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = { date: dateInput.value.trim(), body: bodyInput.value.trim() };
    if (!data.date || !data.body) return;
    const id = editingId.value;
    const promise = id
      ? updateDoc(doc(db, "news", id), data)
      : addDoc(collection(db, "news"), Object.assign({}, data, { createdAt: serverTimestamp() }));
    promise.then(resetForm).catch(function (err) { alert("Could not save: " + err.message); });
  };
}

// ---------------- Research page intro ----------------
function initResearchSettings() {
  const form = document.getElementById("researchSettingsForm");
  const note = document.getElementById("researchSettingsNote");
  const introInput = document.getElementById("research-intro");
  const ref = doc(db, "settings", "research");

  getDoc(ref)
    .then(function (snap) { if (snap.exists()) introInput.value = snap.data().intro || ""; })
    .catch(function (err) { saveNote(note, false, "Could not load: " + err.code); });

  form.onsubmit = function (e) {
    e.preventDefault();
    saveNote(note, false, "Saving…");
    setDoc(ref, { intro: introInput.value.trim() }, { merge: true })
      .then(function () { saveNote(note, true, "Saved ✓"); })
      .catch(function (err) { saveNote(note, false, "Could not save: " + err.code); });
  };
}

// ---------------- Research focus areas ----------------
function initResearchFields() {
  const list = document.getElementById("researchFieldsAdminList");
  const form = document.getElementById("researchFieldForm");
  const titleInput = document.getElementById("rf-title");
  const iconSelect = document.getElementById("rf-icon");
  const bodyInput = document.getElementById("rf-body");
  const editingId = document.getElementById("rf-editing-id");
  const submitBtn = document.getElementById("rfSubmitBtn");
  const cancelBtn = document.getElementById("rfCancelEdit");

  function resetForm() {
    form.reset();
    editingId.value = "";
    submitBtn.textContent = "Add research area";
    cancelBtn.hidden = true;
  }
  cancelBtn.addEventListener("click", resetForm);

  const q = query(collection(db, "researchFields"), orderBy("createdAt", "asc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No research areas yet — add your first one above.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const r = docSnap.data();
        list.appendChild(
          adminCard(
            "<h4>" + escapeHtml(r.title || "") + "</h4>",
            "<p>" + escapeHtml(r.body || "") + "</p>",
            function () {
              titleInput.value = r.title || "";
              iconSelect.value = r.icon || "spins";
              bodyInput.value = r.body || "";
              editingId.value = docSnap.id;
              submitBtn.textContent = "Update research area";
              cancelBtn.hidden = false;
              form.scrollIntoView({ behavior: "smooth", block: "center" });
            },
            function () {
              if (confirm("Delete this research area?")) {
                deleteDoc(doc(db, "researchFields", docSnap.id)).catch(function (err) { alert("Could not delete: " + err.message); });
              }
            }
          )
        );
      });
    },
    function (err) { list.innerHTML = '<p class="dash-empty">Could not load research areas (' + err.code + ").</p>"; }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = { title: titleInput.value.trim(), icon: iconSelect.value, body: bodyInput.value.trim() };
    if (!data.title || !data.body) return;
    const id = editingId.value;
    const promise = id
      ? updateDoc(doc(db, "researchFields", id), data)
      : addDoc(collection(db, "researchFields"), Object.assign({}, data, { createdAt: serverTimestamp() }));
    promise.then(resetForm).catch(function (err) { alert("Could not save: " + err.message); });
  };
}

// ---------------- PI profile ----------------
function initPiSettings() {
  const form = document.getElementById("piSettingsForm");
  const note = document.getElementById("piSettingsNote");
  const ref = doc(db, "settings", "pi");

  getDoc(ref)
    .then(function (snap) {
      if (!snap.exists()) return;
      const d = snap.data();
      document.getElementById("pi-name").value = d.name || "";
      document.getElementById("pi-title").value = d.title || "";
      document.getElementById("pi-photo").value = d.photoURL || "";
      document.getElementById("pi-interests").value = (d.interests || []).join(", ");
      document.getElementById("pi-bio").value = d.bio || "";
      document.getElementById("pi-education").value = (d.education || []).join("\n");
      document.getElementById("pi-scholar").value = d.scholarUrl || "";
      document.getElementById("pi-orcid").value = d.orcidUrl || "";
      document.getElementById("pi-github").value = d.githubUrl || "";
      document.getElementById("pi-cv").value = d.cvUrl || "";
    })
    .catch(function (err) { saveNote(note, false, "Could not load: " + err.code); });

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = {
      name: document.getElementById("pi-name").value.trim(),
      title: document.getElementById("pi-title").value.trim(),
      photoURL: document.getElementById("pi-photo").value.trim(),
      interests: document.getElementById("pi-interests").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      bio: document.getElementById("pi-bio").value.trim(),
      education: document.getElementById("pi-education").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean),
      scholarUrl: document.getElementById("pi-scholar").value.trim(),
      orcidUrl: document.getElementById("pi-orcid").value.trim(),
      githubUrl: document.getElementById("pi-github").value.trim(),
      cvUrl: document.getElementById("pi-cv").value.trim()
    };
    saveNote(note, false, "Saving…");
    setDoc(ref, data, { merge: true })
      .then(function () { saveNote(note, true, "Saved ✓"); })
      .catch(function (err) { saveNote(note, false, "Could not save: " + err.code); });
  };
}

// ---------------- Members & alumni ----------------
function initMembers() {
  const list = document.getElementById("membersAdminList");
  const form = document.getElementById("memberForm");
  const nameInput = document.getElementById("member-name");
  const statusSelect = document.getElementById("member-status");
  const roleInput = document.getElementById("member-role");
  const photoInput = document.getElementById("member-photo");
  const focusInput = document.getElementById("member-focus");
  const institutionInput = document.getElementById("member-institution");
  const editingId = document.getElementById("member-editing-id");
  const submitBtn = document.getElementById("memberSubmitBtn");
  const cancelBtn = document.getElementById("memberCancelEdit");

  function resetForm() {
    form.reset();
    editingId.value = "";
    submitBtn.textContent = "Add member";
    cancelBtn.hidden = true;
  }
  cancelBtn.addEventListener("click", resetForm);

  const q = query(collection(db, "members"), orderBy("createdAt", "asc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No members added yet.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const m = docSnap.data();
        const isAlum = m.status === "alumni";
        const detail = isAlum ? m.institution : m.focus;
        list.appendChild(
          adminCard(
            "<h4>" + escapeHtml(m.name || "") + '</h4><span class="status-pill">' + (isAlum ? "Alumni" : "Current") + "</span>",
            '<p class="dash-card-meta">' + escapeHtml(m.role || "") + "</p>" + (detail ? "<p>" + escapeHtml(detail) + "</p>" : ""),
            function () {
              nameInput.value = m.name || "";
              statusSelect.value = m.status || "current";
              roleInput.value = m.role || "";
              photoInput.value = m.photoURL || "";
              focusInput.value = m.focus || "";
              institutionInput.value = m.institution || "";
              editingId.value = docSnap.id;
              submitBtn.textContent = "Update member";
              cancelBtn.hidden = false;
              form.scrollIntoView({ behavior: "smooth", block: "center" });
            },
            function () {
              if (confirm("Remove " + (m.name || "this person") + "?")) {
                deleteDoc(doc(db, "members", docSnap.id)).catch(function (err) { alert("Could not delete: " + err.message); });
              }
            }
          )
        );
      });
    },
    function (err) { list.innerHTML = '<p class="dash-empty">Could not load members (' + err.code + ").</p>"; }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = {
      name: nameInput.value.trim(),
      status: statusSelect.value,
      role: roleInput.value.trim(),
      photoURL: photoInput.value.trim(),
      focus: focusInput.value.trim(),
      institution: institutionInput.value.trim()
    };
    if (!data.name || !data.role) return;
    const id = editingId.value;
    const promise = id
      ? updateDoc(doc(db, "members", id), data)
      : addDoc(collection(db, "members"), Object.assign({}, data, { createdAt: serverTimestamp() }));
    promise.then(resetForm).catch(function (err) { alert("Could not save: " + err.message); });
  };
}

// ---------------- Publications ----------------
function initPublications() {
  const list = document.getElementById("pubsAdminList");
  const form = document.getElementById("pubForm");
  const yearInput = document.getElementById("pub-year");
  const authorsInput = document.getElementById("pub-authors");
  const journalInput = document.getElementById("pub-journal");
  const detailsInput = document.getElementById("pub-details");
  const doiInput = document.getElementById("pub-doi");
  const titleInput = document.getElementById("pub-title");
  const editingId = document.getElementById("pub-editing-id");
  const submitBtn = document.getElementById("pubSubmitBtn");
  const cancelBtn = document.getElementById("pubCancelEdit");

  function resetForm() {
    form.reset();
    editingId.value = "";
    submitBtn.textContent = "Add publication";
    cancelBtn.hidden = true;
  }
  cancelBtn.addEventListener("click", resetForm);

  const q = query(collection(db, "publications"), orderBy("createdAt", "desc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No publications yet.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const p = docSnap.data();
        list.appendChild(
          adminCard(
            "<h4>" + escapeHtml(p.title || "") + '</h4><span class="status-pill">' + escapeHtml(String(p.year || "")) + "</span>",
            '<p class="dash-card-meta">' + escapeHtml(p.authors || "") + " &middot; " + escapeHtml(p.journal || "") + "</p>",
            function () {
              yearInput.value = p.year || "";
              authorsInput.value = p.authors || "";
              journalInput.value = p.journal || "";
              detailsInput.value = p.details || "";
              doiInput.value = p.doi || "";
              titleInput.value = p.title || "";
              editingId.value = docSnap.id;
              submitBtn.textContent = "Update publication";
              cancelBtn.hidden = false;
              form.scrollIntoView({ behavior: "smooth", block: "center" });
            },
            function () {
              if (confirm("Delete this publication?")) {
                deleteDoc(doc(db, "publications", docSnap.id)).catch(function (err) { alert("Could not delete: " + err.message); });
              }
            }
          )
        );
      });
    },
    function (err) { list.innerHTML = '<p class="dash-empty">Could not load publications (' + err.code + ").</p>"; }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const yearVal = yearInput.value.trim();
    const data = {
      year: yearVal ? Number(yearVal) : "",
      authors: authorsInput.value.trim(),
      journal: journalInput.value.trim(),
      details: detailsInput.value.trim(),
      doi: doiInput.value.trim(),
      title: titleInput.value.trim()
    };
    if (!data.title || !data.authors || !data.journal) return;
    const id = editingId.value;
    const promise = id
      ? updateDoc(doc(db, "publications", id), data)
      : addDoc(collection(db, "publications"), Object.assign({}, data, { createdAt: serverTimestamp() }));
    promise.then(resetForm).catch(function (err) { alert("Could not save: " + err.message); });
  };
}

// ---------------- Teaching ----------------
function initTeaching() {
  const list = document.getElementById("teachingAdminList");
  const form = document.getElementById("teachingForm");
  const codeInput = document.getElementById("teach-code");
  const titleInput = document.getElementById("teach-title");
  const bodyInput = document.getElementById("teach-body");
  const editingId = document.getElementById("teach-editing-id");
  const submitBtn = document.getElementById("teachSubmitBtn");
  const cancelBtn = document.getElementById("teachCancelEdit");

  function resetForm() {
    form.reset();
    editingId.value = "";
    submitBtn.textContent = "Add course";
    cancelBtn.hidden = true;
  }
  cancelBtn.addEventListener("click", resetForm);

  const q = query(collection(db, "teaching"), orderBy("createdAt", "asc"));
  const unsub = onSnapshot(
    q,
    function (snap) {
      if (snap.empty) {
        list.innerHTML = '<p class="dash-empty">No courses yet.</p>';
        return;
      }
      list.innerHTML = "";
      snap.forEach(function (docSnap) {
        const t = docSnap.data();
        list.appendChild(
          adminCard(
            "<h4>" + escapeHtml(t.title || "") + '</h4><span class="status-pill">' + escapeHtml(t.code || "") + "</span>",
            "<p>" + escapeHtml(t.body || "") + "</p>",
            function () {
              codeInput.value = t.code || "";
              titleInput.value = t.title || "";
              bodyInput.value = t.body || "";
              editingId.value = docSnap.id;
              submitBtn.textContent = "Update course";
              cancelBtn.hidden = false;
              form.scrollIntoView({ behavior: "smooth", block: "center" });
            },
            function () {
              if (confirm("Delete this course?")) {
                deleteDoc(doc(db, "teaching", docSnap.id)).catch(function (err) { alert("Could not delete: " + err.message); });
              }
            }
          )
        );
      });
    },
    function (err) { list.innerHTML = '<p class="dash-empty">Could not load courses (' + err.code + ").</p>"; }
  );
  unsubs.push(unsub);

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = { code: codeInput.value.trim(), title: titleInput.value.trim(), body: bodyInput.value.trim() };
    if (!data.title || !data.body) return;
    const id = editingId.value;
    const promise = id
      ? updateDoc(doc(db, "teaching", id), data)
      : addDoc(collection(db, "teaching"), Object.assign({}, data, { createdAt: serverTimestamp() }));
    promise.then(resetForm).catch(function (err) { alert("Could not save: " + err.message); });
  };
}

// ---------------- Contact info & footer ----------------
function initContactSettings() {
  const form = document.getElementById("contactSettingsForm");
  const note = document.getElementById("contactSettingsNote");
  const ref = doc(db, "settings", "contact");

  getDoc(ref)
    .then(function (snap) {
      if (!snap.exists()) return;
      const d = snap.data();
      document.getElementById("contact-address").value = d.address || "";
      document.getElementById("contact-phone").value = d.phone || "";
      document.getElementById("contact-email").value = d.email || "";
      document.getElementById("contact-map").value = d.mapQuery || "";
      document.getElementById("contact-footer-tagline").value = d.footerTagline || "";
    })
    .catch(function (err) { saveNote(note, false, "Could not load: " + err.code); });

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = {
      address: document.getElementById("contact-address").value.trim(),
      phone: document.getElementById("contact-phone").value.trim(),
      email: document.getElementById("contact-email").value.trim(),
      mapQuery: document.getElementById("contact-map").value.trim(),
      footerTagline: document.getElementById("contact-footer-tagline").value.trim()
    };
    saveNote(note, false, "Saving…");
    setDoc(ref, data, { merge: true })
      .then(function () { saveNote(note, true, "Saved ✓"); })
      .catch(function (err) { saveNote(note, false, "Could not save: " + err.code); });
  };
}
