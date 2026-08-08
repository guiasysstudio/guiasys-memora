import { firebaseConfig } from "./firebase-config.js";

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"];
export const firebaseConfigured = requiredKeys.every((key) => {
  const value = String(firebaseConfig[key] ?? "").trim();
  return value && !value.includes("COLOQUE_AQUI");
});

let auth = null;
let currentUser = null;
let provider = null;
let modules = null;
let initPromise = null;
const listeners = new Set();

async function initFirebase() {
  if (!firebaseConfigured) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [appMod, authMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js"),
    ]);

    modules = { appMod, authMod };
    const app = appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    auth.languageCode = "pt-BR";
    provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    await authMod.setPersistence(auth, authMod.browserLocalPersistence);

    try {
      const redirectResult = await authMod.getRedirectResult(auth);
      if (redirectResult?.user) currentUser = redirectResult.user;
    } catch (error) {
      console.warn("Firebase redirect result:", error);
    }

    authMod.onAuthStateChanged(auth, (user) => {
      currentUser = user ?? null;
      for (const listener of listeners) listener(currentUser);
    });

    return auth;
  })();

  return initPromise;
}

export async function ensureAuthReady() {
  return initFirebase();
}

export function getCurrentUser() {
  return currentUser;
}

export function subscribeAuth(listener) {
  listeners.add(listener);
  listener(currentUser);
  initFirebase().catch((error) => console.error("Firebase Auth:", error));
  return () => listeners.delete(listener);
}

export async function signInWithGoogle() {
  if (!firebaseConfigured) throw new Error("Firebase não configurado.");
  await initFirebase();
  try {
    const result = await modules.authMod.signInWithPopup(auth, provider);
    currentUser = result.user;
    return currentUser;
  } catch (error) {
    const fallbackCodes = new Set([
      "auth/popup-blocked",
      "auth/operation-not-supported-in-this-environment",
      "auth/web-storage-unsupported",
    ]);
    if (fallbackCodes.has(error?.code)) {
      await modules.authMod.signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export async function signInWithEmail(email, password) {
  if (!firebaseConfigured) throw new Error("Firebase não configurado.");
  await initFirebase();
  const result = await modules.authMod.signInWithEmailAndPassword(auth, email.trim(), password);
  currentUser = result.user;
  return currentUser;
}

export async function createAccountWithEmail({ name, email, password }) {
  if (!firebaseConfigured) throw new Error("Firebase não configurado.");
  await initFirebase();
  const result = await modules.authMod.createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name?.trim()) await modules.authMod.updateProfile(result.user, { displayName: name.trim() });
  await modules.authMod.sendEmailVerification(result.user, {
    url: "https://memora.guiasys.online/",
  });
  currentUser = result.user;
  return currentUser;
}

export async function sendPasswordReset(email) {
  if (!firebaseConfigured) throw new Error("Firebase não configurado.");
  await initFirebase();
  await modules.authMod.sendPasswordResetEmail(auth, email.trim(), {
    url: "https://memora.guiasys.online/",
  });
}

export async function resendEmailVerification() {
  if (!firebaseConfigured) throw new Error("Firebase não configurado.");
  await initFirebase();
  if (!auth.currentUser) throw new Error("Nenhum usuário conectado.");
  await modules.authMod.sendEmailVerification(auth.currentUser, {
    url: "https://memora.guiasys.online/",
  });
}

export async function signOutAccount() {
  if (!firebaseConfigured) return;
  await initFirebase();
  await modules.authMod.signOut(auth);
}

export async function getIdToken() {
  if (!firebaseConfigured) return "";
  await initFirebase();
  if (!auth.currentUser) return "";
  return auth.currentUser.getIdToken();
}
