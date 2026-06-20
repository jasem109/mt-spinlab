// =====================================================================
// MT SpinLab — shared Firebase init (js/firebase-init.js)
// =====================================================================
// Both js/content.js (public site content) and js/members.js (member
// portal) import the SAME app/auth/db from here, so Firebase is only
// initialized once no matter how many modules need it.
// =====================================================================

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
