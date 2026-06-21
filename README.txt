MT SpinLab — Lab Website
=========================

A single-page website (plain HTML, CSS, JS — no frameworks, no build step)
for Prof. Md. Torikul Islam's research group, "MT SpinLab".

Every visible piece of content — hero text, About, News, Research areas,
People (PI bio + members + alumni), Publications, Teaching, Contact info
and Footer — is stored in Firestore and rendered live by js/content.js.
There is no content to hand-edit in index.html anymore. Instead, Prof.
Islam signs in at yoursite.com/#members with his Google account and gets
a full admin panel where he can add, edit and delete every section of the
site. Edits appear on the public pages immediately (no rebuild, no
redeploy) because every page is a live Firestore listener.

HOW IT WORKS
------------
- index.html holds the page structure only — empty containers with ids
  (e.g. id="newsList", id="researchGrid") that get filled in by JS.
- js/content.js runs on every page load (no sign-in needed) and renders
  all public content from Firestore into those containers, live.
- js/members.js runs the private Member Portal (#members): Google
  sign-in, approval workflow, Projects/Lab Docs/Chat/Events for approved
  members, and — for the PI account only — the full site-content admin
  panel plus a Requests tab to approve new sign-ups.
- js/script.js handles page-switching (the URL hash), the mobile menu,
  scroll progress bar, and submits the contact form via EmailJS.
- js/firebase-init.js initializes Firebase once and is shared by both
  content.js and members.js.
- js/firebase-config.js holds your Firebase project keys, the PI's email,
  and (optional) EmailJS settings — edit this file directly.

FILES
-----
index.html            Page structure + the Member Portal/admin markup.
css/style.css          All styling. Colors, fonts and spacing are CSS
                        variables (:root) — change them there to re‑theme
                        the whole site.
js/firebase-config.js  Your Firebase project keys, PI email, EmailJS IDs.
js/firebase-init.js    Initializes Firebase once (shared module).
js/content.js           Reads Firestore and renders all PUBLIC content.
js/members.js           Member Portal: sign-in, approvals, dashboard,
                        and the PI's site-content admin panel.
js/script.js            Page switching, mobile menu, contact form.
firestore.rules         Reference copy of the security rules — paste
                        these into the Firebase Console (see Step 4).
assets/                 Put photo files here (see PHOTOS, below).

TO PREVIEW
----------
You MUST use a local server — double-clicking index.html will NOT work,
because content.js and members.js are ES modules that import each other,
and browsers block module imports on file:// pages. From the project
folder, run:
    python3 -m http.server 8000
then visit http://localhost:8000

FIRST-TIME SETUP (Firebase)
----------------------------
1. Create a Firebase project at https://console.firebase.google.com if
   you haven't already, then add a Web app and copy its config into
   js/firebase-config.js (firebaseConfig).

2. Authentication → Sign-in method → enable "Google".

3. Authentication → Settings → Authorized domains → add every domain
   you'll preview or host on (your live domain; "localhost" is included
   by default for local testing).

4. Firestore Database → create a database (production mode is fine),
   then go to the Rules tab and paste in the contents of
   firestore.rules from this folder. Click Publish.

5. In js/firebase-config.js, set PI_EMAIL to the exact Google account
   Prof. Islam will sign in with. The first time that account signs in
   at #members, it's automatically granted PI access — no approval
   step, no manual Firestore edit needed.

6. Open #members, sign in with the PI's Google account, and start
   filling in content from the new admin tabs (Home & News, Research,
   People, Publications, Teaching, Contact & Footer). Every other tab
   visitor who signs in becomes a "pending" request that shows up under
   the PI's "Requests" tab for approval.

OPTIONAL: EMAIL NOTIFICATIONS (EmailJS)
-----------------------------------------
Two separate things use EmailJS (https://dashboard.emailjs.com), a
service that can send email straight from the browser with no backend:

  a) Notifying the PI when someone requests member-portal access
     (js/members.js, notifyPI()) — uses emailjsConfig in
     firebase-config.js. NOTE: emailjsConfig.templateId is currently
     set to the same value as serviceId, which is almost certainly a
     copy-paste mistake — EmailJS template IDs normally look like
     "template_xxxxxxx". Check your EmailJS dashboard and fix this if
     the notification emails aren't arriving.

  b) The public Contact form actually sending mail (js/script.js) —
     create a SEPARATE EmailJS template for this (different fields:
     from_name, from_email, subject, message, to_email) and paste its
     ID over "YOUR_CONTACT_TEMPLATE_ID" in js/script.js. The "to_email"
     used is whatever email you set in the admin panel's Contact &
     Footer tab.

Both are optional — the rest of the site works fine without EmailJS
configured; the contact form will just show an error until step (b) is
done.

PHOTOS
------
Photos (PI photo, member photos) are plain text fields in the admin
panel — paste either a path to a file you've added to the assets/
folder (e.g. "assets/torikul-islam.jpg") or a full https:// URL to an
image hosted elsewhere. Leave it blank and the site falls back to a
colored initials avatar automatically.

CHANGING COLORS / FONTS
------------------------
Open css/style.css and edit the :root block near the top:
    --ink, --paper, --cobalt, --ember, --slate, --line
and the three --font-* variables. Google Fonts are loaded via <link>
tags in the <head> of index.html if you want to swap typefaces.

DEPLOYING
---------
This is a static site (the "backend" is entirely Firebase) — drag the
whole folder onto any static host that serves files over https://
(GitHub Pages, Netlify, Vercel, Cloudflare Pages, or your own server).
Don't forget to add that host's domain to Firebase's Authorized domains
(Step 3 above) or sign-in will fail there.
