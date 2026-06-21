// =====================================================================
// MT SpinLab — configuration
// =====================================================================
// EDIT THIS FILE. See README.txt for the full setup walkthrough.
// =====================================================================

// 1) Firebase project config.
//    Firebase Console → ⚙ Project settings → General → "Your apps" →
//    Web app → SDK setup and configuration → Config
export const firebaseConfig = {
  apiKey: "AIzaSyBoN-K8O_sR5Za5R8FVr-UZ5ZJjimN3gUA",
  authDomain: "mt-spinlab.firebaseapp.com",
  projectId: "mt-spinlab",
  storageBucket: "mt-spinlab.firebasestorage.app",
  messagingSenderId: "59746369099",
  appId: "1:59746369099:web:4508b8eae2b5470593d7ce",
  measurementId: "G-DG1CNSWSZV"
};

// 2) The Google account email Prof. Md. Torikul Islam signs in with.
//    The FIRST time this exact account signs in with Google it is
//    auto-recognized as the Principal Investigator (full access, no
//    approval needed). Every other Google account starts out "pending"
//    until the PI approves it from the Requests tab.
//    IMPORTANT: this must exactly match the email in the Firestore
//    security rules — see README.txt, Step 5.
export const PI_EMAIL = "jasem211712@gmail.com";

// 3) OPTIONAL — email notifications for new access requests, via EmailJS
//    (a free service that can send email straight from the browser, no
//    backend needed). Leave the YOUR_... placeholders as-is to skip this;
//    the in-app "Requests" tab still works either way. See README.txt.
export const emailjsConfig = {
  serviceId: "service_nb7u53n",
  templateId: "service_nb7u53n",
  publicKey: "Kwv_b744tmyJeh72s"
};
