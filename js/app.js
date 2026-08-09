import { APP_CONFIG } from "./app-config.js";
import {
  firebaseConfigured,
  getCurrentUser,
  signInWithGoogle,
  signInWithEmail,
  createAccountWithEmail,
  sendPasswordReset,
  resendEmailVerification,
  signOutAccount,
  subscribeAuth,
} from "./auth.js";
import {
  createAlbum,
  deleteMedia,
  getAlbum,
  isDemoMode,
  mediaDownloadUrl,
  mediaUrl,
  uploadMedia,
} from "./api.js";

const OWNED_KEY = "memora-owned-albums";
const UPLOADER_KEY = "memora-uploader-name";
const root = document.getElementById("app");
let currentAlbumState = null;
let previewPollTimer = null;

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function icon(name, className = "") {
  const safeName = /^[a-z0-9-]+$/.test(String(name || "")) ? String(name) : "circle-info";
  const classes = `ms-icon ${className}`.trim();
  return `<span class="${classes}" aria-hidden="true" style="--icon-mask:url('assets/icons/${safeName}.svg')"></span>`;
}

function brand(inverse = false) {
  if (inverse) {
    return `<a href="#/" class="brand brand--inverse"><img class="brand__mark-image" src="assets/brand/memora-mark.svg" alt=""><span class="brand__inverse-word">memora</span></a>`;
  }
  return `<a href="#/" class="brand"><img class="brand__logo" src="assets/brand/memora-logo.svg" alt="GuiaSys Memora"></a>`;
}

function setupBanner() {
  const notes = [];
  if (!firebaseConfigured) notes.push("Firebase ainda não configurado");
  if (isDemoMode) notes.push("API do servidor em modo demonstração");
  if (!notes.length) return "";
  return `<div class="setup-banner"><strong>Configuração pendente</strong><span>${esc(notes.join(" • "))}</span><a href="docs/COMECE_AQUI.md" target="_blank">Ver instruções</a></div>`;
}

function parseRoute() {
  const raw = (location.hash || "#/ ").replace(/^#/, "").trim();
  if (!raw || raw === "/") return { page: "home" };
  const [path, query = ""] = raw.split("?");
  const match = path.match(/^\/album\/([^/]+)$/);
  if (match) {
    const params = new URLSearchParams(query);
    return { page: "album", slug: decodeURIComponent(match[1]), owner: params.get("owner") || "" };
  }
  return { page: "home" };
}

function albumHash(slug, ownerToken = "") {
  const owner = ownerToken ? `?owner=${encodeURIComponent(ownerToken)}` : "";
  return `#/album/${encodeURIComponent(slug)}${owner}`;
}

function shareAlbumUrl(slug) {
  return `${location.origin}${location.pathname}#/album/${encodeURIComponent(slug)}`;
}

function readOwned() {
  try { return JSON.parse(localStorage.getItem(OWNED_KEY) || "[]"); }
  catch { return []; }
}

function saveOwned(item) {
  const current = readOwned();
  const next = [item, ...current.filter((a) => a.slug !== item.slug)].slice(0, 12);
  localStorage.setItem(OWNED_KEY, JSON.stringify(next));
}

function authControlHtml() {
  if (!firebaseConfigured) {
    return `<button class="auth-button auth-button--setup" id="auth-action" type="button">Firebase</button>`;
  }
  const user = getCurrentUser();
  if (!user) return `<button class="auth-button" id="auth-action" type="button">Entrar</button>`;
  const photo = user.photoURL ? `<img src="${esc(user.photoURL)}" alt="">` : `<span>${esc((user.displayName || user.email || "U").charAt(0).toUpperCase())}</span>`;
  return `<div class="auth-user"><button class="auth-user__main" id="auth-action" type="button">${photo}<b>${esc(user.displayName || user.email || "Minha conta")}</b></button><button class="auth-user__exit" id="auth-signout" type="button" aria-label="Sair">${icon("log-out")}</button></div>`;
}

let authContinuation = null;

function firebaseErrorMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-email": "Informe um endereço de e-mail válido.",
    "auth/email-already-in-use": "Já existe uma conta com este e-mail.",
    "auth/weak-password": "Use uma senha mais forte, com pelo menos 6 caracteres.",
    "auth/missing-password": "Informe a senha.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Não foi possível acessar o Firebase. Verifique sua internet.",
    "auth/operation-not-allowed": "O login por e-mail ainda não foi ativado no Firebase Console.",
    "auth/popup-closed-by-user": "A janela de login foi fechada antes de concluir.",
  };
  return messages[code] || error?.message || "Não foi possível concluir a autenticação.";
}

function resolveAuthContinuation(ok) {
  const continuation = authContinuation;
  authContinuation = null;
  if (continuation) continuation(ok);
}

function closeAuthModal(result = null) {
  document.getElementById("auth-modal-root")?.remove();
  if (result !== null && authContinuation) resolveAuthContinuation(result);
}

function openAuthModal(mode = "login", note = "", continuation = null) {
  document.getElementById("auth-modal-root")?.remove();
  if (continuation) authContinuation = continuation;
  const user = getCurrentUser();
  const rootBox = document.createElement("div");
  rootBox.id = "auth-modal-root";

  if (mode === "account" && user) {
    const provider = user.providerData?.[0]?.providerId === "google.com" ? "Google" : "E-mail e senha";
    rootBox.innerHTML = `<div class="auth-modal" role="dialog" aria-modal="true" aria-label="Minha conta"><button class="auth-modal__backdrop" data-auth-close aria-label="Fechar"></button><section class="auth-card"><button class="auth-card__close" data-auth-close aria-label="Fechar">${icon("x")}</button><div class="auth-card__brand">${brand()}</div><p class="eyebrow"><span></span> Minha conta</p><h2>${esc(user.displayName || "Conta Memora")}</h2><p class="auth-card__intro">${esc(user.email || "")}</p><div class="account-details"><div><span>Login</span><b>${esc(provider)}</b></div><div><span>E-mail verificado</span><b>${user.emailVerified || provider === "Google" ? "Sim" : "Ainda não"}</b></div></div>${!user.emailVerified && provider !== "Google" ? `<button class="button button--ghost button--wide" id="auth-resend-verification" type="button">Reenviar verificação de e-mail</button>` : ""}<p class="auth-form__status" id="auth-status" hidden></p><button class="button button--ink button--wide" id="auth-account-signout" type="button">Sair da conta</button></section></div>`;
    document.body.appendChild(rootBox);
    rootBox.querySelectorAll("[data-auth-close]").forEach((el) => el.addEventListener("click", () => closeAuthModal()));
    rootBox.querySelector("#auth-account-signout")?.addEventListener("click", async () => { await signOutAccount(); closeAuthModal(); });
    rootBox.querySelector("#auth-resend-verification")?.addEventListener("click", async () => {
      const status = rootBox.querySelector("#auth-status");
      try { await resendEmailVerification(); status.textContent = "E-mail de verificação reenviado."; status.className = "auth-form__status auth-form__status--ok"; status.hidden = false; }
      catch (error) { status.textContent = firebaseErrorMessage(error); status.className = "auth-form__status auth-form__status--error"; status.hidden = false; }
    });
    return;
  }

  const register = mode === "register";
  rootBox.innerHTML = `<div class="auth-modal" role="dialog" aria-modal="true" aria-label="${register ? "Criar conta" : "Entrar"}"><button class="auth-modal__backdrop" data-auth-close aria-label="Fechar"></button><section class="auth-card"><button class="auth-card__close" data-auth-close aria-label="Fechar">${icon("x")}</button><div class="auth-card__brand">${brand()}</div><p class="eyebrow"><span></span> ${register ? "Novo no Memora" : "Bem-vindo de volta"}</p><h2>${register ? "Crie sua conta" : "Entre no Memora"}</h2><p class="auth-card__intro">${esc(note || (register ? "Use Google ou cadastre seu e-mail para guardar e administrar seus álbuns." : "Entre com Google ou com seu e-mail."))}</p><button class="google-auth-button" id="auth-google" type="button"><span>G</span>${register ? "Continuar com Google" : "Entrar com Google"}</button><div class="auth-divider"><span>ou</span></div><form class="auth-form" id="auth-email-form">${register ? `<label class="field field--compact"><span>Seu nome</span><input id="auth-name" autocomplete="name" minlength="2" maxlength="80" required placeholder="Como devemos chamar você?"></label>` : ""}<label class="field field--compact"><span>E-mail</span><input id="auth-email" type="email" autocomplete="email" required placeholder="voce@exemplo.com"></label><label class="field field--compact"><span>Senha</span><input id="auth-password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="6" required placeholder="Mínimo de 6 caracteres"></label><p class="auth-form__status" id="auth-status" hidden></p><button class="button button--coral button--wide" id="auth-email-submit" type="submit">${register ? "Criar conta com e-mail" : "Entrar com e-mail"}</button></form>${register ? `<p class="auth-switch">Já tem uma conta? <button type="button" id="auth-switch-mode">Entrar</button></p>` : `<div class="auth-secondary"><button type="button" id="auth-forgot">Esqueci minha senha</button><span>•</span><button type="button" id="auth-switch-mode">Criar conta</button></div>`}</section></div>`;
  document.body.appendChild(rootBox);

  const status = rootBox.querySelector("#auth-status");
  const showStatus = (message, ok = false) => {
    status.textContent = message;
    status.className = `auth-form__status ${ok ? "auth-form__status--ok" : "auth-form__status--error"}`;
    status.hidden = false;
  };

  rootBox.querySelectorAll("[data-auth-close]").forEach((el) => el.addEventListener("click", () => closeAuthModal(false)));
  rootBox.querySelector("#auth-switch-mode")?.addEventListener("click", () => openAuthModal(register ? "login" : "register", "", authContinuation));
  rootBox.querySelector("#auth-google")?.addEventListener("click", async () => {
    try {
      const logged = await signInWithGoogle();
      if (logged) closeAuthModal(true);
    } catch (error) { showStatus(firebaseErrorMessage(error)); }
  });
  rootBox.querySelector("#auth-email-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = rootBox.querySelector("#auth-email-submit");
    submit.disabled = true;
    status.hidden = true;
    try {
      const email = rootBox.querySelector("#auth-email").value.trim();
      const password = rootBox.querySelector("#auth-password").value;
      if (register) {
        const name = rootBox.querySelector("#auth-name").value.trim();
        await createAccountWithEmail({ name, email, password });
        showStatus("Conta criada. Enviamos um link de verificação para seu e-mail.", true);
        setTimeout(() => closeAuthModal(true), 900);
      } else {
        await signInWithEmail(email, password);
        closeAuthModal(true);
      }
    } catch (error) {
      showStatus(firebaseErrorMessage(error));
      submit.disabled = false;
    }
  });
  rootBox.querySelector("#auth-forgot")?.addEventListener("click", async () => {
    const emailInput = rootBox.querySelector("#auth-email");
    const email = emailInput.value.trim();
    if (!email) { showStatus("Digite seu e-mail acima para receber o link de recuperação."); emailInput.focus(); return; }
    try { await sendPasswordReset(email); showStatus("Enviamos o link para redefinir sua senha.", true); }
    catch (error) { showStatus(firebaseErrorMessage(error)); }
  });
  setTimeout(() => rootBox.querySelector(register ? "#auth-name" : "#auth-email")?.focus(), 10);
}

function wireAuthControls() {
  document.querySelectorAll("#auth-action").forEach((button) => {
    button.addEventListener("click", () => {
      if (!firebaseConfigured) {
        alert("Firebase ainda não está configurado.");
        return;
      }
      if (getCurrentUser()) openAuthModal("account");
      else openAuthModal("login");
    });
  });
  document.querySelectorAll("#auth-signout").forEach((button) => button.addEventListener("click", () => signOutAccount()));
}

function refreshAuthControls() {
  document.querySelectorAll("[data-auth-slot]").forEach((slot) => { slot.innerHTML = authControlHtml(); });
  wireAuthControls();
}

async function requireLogin(kind) {
  if (!firebaseConfigured) return true;
  const required = kind === "create" ? APP_CONFIG.requireLoginForCreate : APP_CONFIG.requireLoginForUpload;
  if (!required || getCurrentUser()) return true;
  return new Promise((resolve) => openAuthModal("login", kind === "create" ? "Entre para criar e administrar seus álbuns." : "Entre para adicionar fotos e vídeos a este álbum.", resolve));
}

function renderHome() {
  clearTimeout(previewPollTimer);
  previewPollTimer = null;
  currentAlbumState = null;
  const owned = readOwned();
  const ownedHtml = owned.length
    ? `<div class="owned-grid">${owned.slice(0, 6).map((item, index) => `
      <a class="owned-card owned-card--${index % 3 + 1}" href="${albumHash(item.slug, item.ownerToken)}">
        <span class="owned-card__index">0${index + 1}</span>
        <div><h3>${esc(item.title)}</h3><p>Abrir área do proprietário</p></div>${icon("arrow-right")}
      </a>`).join("")}</div>`
    : `<div class="owned-empty"><span aria-hidden="true">${icon("album-plus")}</span><div><h3>Seu primeiro álbum começa lá em cima.</h3><p>Os álbuns administrados por você aparecerão aqui.</p></div><a class="text-link" href="#criar">Criar meu álbum ${icon("arrow-right")}</a></div>`;

  root.innerHTML = `${setupBanner()}<main class="landing-page">
    <div class="landing-glow landing-glow--one"></div><div class="landing-glow landing-glow--two"></div>
    <header class="topbar page-width">${brand()}<nav class="topbar__nav" aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#seus-albuns">Seus álbuns</a><a class="button button--small button--ink" href="#criar">Criar álbum</a><span data-auth-slot>${authControlHtml()}</span></nav></header>
    <section class="hero page-width"><div class="hero__copy"><p class="eyebrow"><span></span> Álbuns colaborativos</p><h1>Todo mundo viveu.<br> Agora, <em>todo mundo guarda.</em></h1><p class="hero__lead">Crie um álbum, envie o link e reúna as fotos e os vídeos de cada pessoa — sem perder nenhum momento no grupo de mensagens.</p><div class="hero__promises" aria-label="Benefícios"><span>Link simples</span><span>Fotos e vídeos</span><span>Download original</span></div><div class="moment-stack" aria-hidden="true"><div class="moment-card moment-card--one"><div class="moment-card__sun"></div><span>fim de tarde</span></div><div class="moment-card moment-card--two"><div class="moment-card__people"><i></i> <i></i> <i></i></div><span>todo mundo junto</span></div><div class="moment-card moment-card--three"><b>82</b><span>momentos reunidos</span></div></div></div>
      <div class="create-panel" id="criar"><div class="create-panel__heading"><span class="create-panel__number">01</span><div><p>Comece por aqui</p><h2>Crie seu álbum</h2></div></div><form id="create-album-form"><label class="field"><span>Nome do álbum</span><input id="album-title" autocomplete="off" maxlength="80" minlength="3" placeholder="Ex.: Casamento da Ana &amp; do Leo" required></label><label class="field"><span>Uma mensagem para os convidados</span><textarea id="album-description" maxlength="240" placeholder="Compartilhe suas melhores lembranças desse dia." rows="3"></textarea></label><p class="form-error" id="create-error" hidden></p><button class="button button--coral button--wide" id="create-submit"><span class="button-label">Criar álbum agora</span>${icon("arrow-right")}</button></form><p class="create-panel__note">Você receberá um link de proprietário para administrar tudo.</p></div>
    </section>
    <section class="steps-section" id="como-funciona"><div class="page-width"><div class="section-heading"><p class="eyebrow eyebrow--light"><span></span> Do convite à lembrança</p><h2>Três passos. Nenhum momento perdido.</h2></div><div class="steps-grid"><article><span class="step-icon" aria-hidden="true">${icon("album-plus")}</span><p>01</p><h3>Crie o álbum</h3><span>Dê um nome, escreva um recado e o seu espaço está pronto.</span></article><article><span class="step-icon" aria-hidden="true">${icon("share")}</span><p>02</p><h3>Envie o link</h3><span>Compartilhe pelo WhatsApp, e-mail ou onde todo mundo estiver.</span></article><article><span class="step-icon" aria-hidden="true">${icon("images")}</span><p>03</p><h3>Reviva junto</h3><span>As contribuições aparecem na galeria, prontas para ver e baixar.</span></article></div></div></section>
    <section class="owned-section page-width" id="seus-albuns"><div class="section-heading section-heading--dark"><p class="eyebrow"><span></span> Volte quando quiser</p><h2>Seus álbuns neste dispositivo</h2></div>${ownedHtml}</section>
    <footer class="footer"><div class="page-width footer__inner">${brand(true)}<p>As melhores lembranças são as que a gente junta.</p><span>Fotos. Vídeos. Pessoas.</span></div></footer>
  </main>`;

  wireAuthControls();
  const form = document.getElementById("create-album-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = document.getElementById("album-title").value.trim();
    const description = document.getElementById("album-description").value.trim();
    const errorBox = document.getElementById("create-error");
    const submit = document.getElementById("create-submit");
    if (!(await requireLogin("create"))) return;
    errorBox.hidden = true;
    submit.disabled = true;
    submit.querySelector(".button-label").textContent = "Criando seu álbum…";
    try {
      const result = await createAlbum({ title, description });
      saveOwned({ slug: result.album.slug, title: result.album.title, createdAt: result.album.createdAt, ownerToken: result.ownerToken });
      location.hash = albumHash(result.album.slug, result.ownerToken).slice(1);
    } catch (error) {
      errorBox.textContent = error.message || "Não foi possível criar o álbum.";
      errorBox.hidden = false;
      submit.disabled = false;
      submit.querySelector(".button-label").textContent = "Criar álbum agora";
    }
  });
}

function formatDate(value) {
  const safe = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(safe);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUploadLimit() {
  return APP_CONFIG.maxUploadMb >= 1024
    ? `${(APP_CONFIG.maxUploadMb / 1024).toFixed(APP_CONFIG.maxUploadMb % 1024 ? 1 : 0)} GB`
    : `${APP_CONFIG.maxUploadMb} MB`;
}

async function copyOrShareAlbum(slug, title) {
  const url = shareAlbumUrl(slug);
  if (navigator.share) {
    try {
      await navigator.share({ title, text: "Adicione suas fotos e vídeos ao nosso álbum no Memora.", url });
      return;
    } catch { /* cancelado ou indisponível */ }
  }
  await navigator.clipboard.writeText(url);
  const buttons = document.querySelectorAll("[data-share-album]");
  buttons.forEach((btn) => { btn.dataset.originalText ||= btn.innerHTML; btn.innerHTML = `${icon("circle-check")} Link copiado!`; });
  setTimeout(() => buttons.forEach((btn) => { if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText; }), 2200);
}

function galleryHeadingText(media) {
  return media.length ? `${media.length} momentos reunidos` : "O primeiro momento começa com você";
}

function galleryVisual(item) {
  const thumbnail = item.thumbnailUrl ? mediaUrl(item.thumbnailUrl) : "";
  const previewStatus = String(item.previewStatus || "");

  if (thumbnail) {
    return `<img class="media-card__thumbnail" alt="${esc(item.name)}" loading="lazy" src="${esc(thumbnail)}">${item.kind === "video" ? `<span class="video-play" aria-hidden="true">${icon("play")}</span>` : ""}`;
  }

  if (previewStatus === "pending" || previewStatus === "processing") {
    return `<span class="media-card__preview-state media-card__preview-state--processing">${icon("loader", "ms-icon--spin")}<small>Gerando prévia…</small></span>`;
  }

  if (previewStatus === "error") {
    return `<span class="media-card__preview-state media-card__preview-state--error">${icon(item.kind === "video" ? "video" : "image")}<small>Prévia indisponível</small></span>`;
  }

  // Compatibilidade com uma API anterior ao Passo 9.
  const source = esc(mediaUrl(item.url));
  return item.kind === "video"
    ? `<span class="media-card__preview-state">${icon("video")}<small>Vídeo</small></span>`
    : `<img class="media-card__thumbnail" alt="${esc(item.name)}" loading="lazy" src="${source}">`;
}

function galleryHtml(state) {
  const media = state.media || [];
  if (!media.length) {
    return `<div class="gallery-empty"><div class="gallery-empty__frames" aria-hidden="true"><i></i><i></i><i></i></div><h3>A galeria está esperando suas histórias.</h3><p>Adicione a primeira foto ou vídeo e convide as outras pessoas.</p><button class="button button--coral" id="empty-start">Começar agora ${icon("upload")}</button></div>`;
  }

  return `<div class="media-grid">${media.map((item, index) => {
    const visual = galleryVisual(item);
    return `<button class="media-card ${index % 7 === 0 ? "media-card--wide" : ""}" data-media-id="${esc(item.id)}" aria-label="Abrir ${esc(item.name)}">${visual}<span class="media-card__shade"></span><span class="media-card__meta"><b>${esc(item.uploaderName)}</b><small>${esc(formatDate(item.createdAt))}</small></span></button>`;
  }).join("")}</div>`;
}

function wireGalleryCards() {
  document.querySelectorAll("[data-media-id]").forEach((button) => {
    button.addEventListener("click", () => openLightbox(button.dataset.mediaId));
  });
  document.getElementById("empty-start")?.addEventListener("click", () => document.getElementById("uploader-name")?.focus());
}

function refreshGalleryDom() {
  const state = currentAlbumState;
  if (!state) return;
  const media = state.media || [];
  const images = media.filter((item) => item.kind === "image").length;
  const videos = media.length - images;
  const people = new Set(media.map((item) => item.uploaderName).filter(Boolean)).size;

  const galleryBody = document.getElementById("gallery-body");
  if (galleryBody) {
    galleryBody.innerHTML = galleryHtml(state);
    wireGalleryCards();
  }
  const galleryTitle = document.getElementById("gallery-title");
  if (galleryTitle) galleryTitle.textContent = galleryHeadingText(media);
  const statImages = document.getElementById("album-stat-images");
  const statVideos = document.getElementById("album-stat-videos");
  const statPeople = document.getElementById("album-stat-people");
  if (statImages) statImages.textContent = String(images);
  if (statVideos) statVideos.textContent = String(videos);
  if (statPeople) statPeople.textContent = String(people);
}

function schedulePreviewPoll() {
  clearTimeout(previewPollTimer);
  previewPollTimer = null;
  const state = currentAlbumState;
  if (!state || !(state.media || []).some((item) => ["pending", "processing"].includes(String(item.previewStatus || "")))) return;

  const expectedSlug = state.slug;
  previewPollTimer = setTimeout(async () => {
    try {
      if (!currentAlbumState || currentAlbumState.slug !== expectedSlug) return;
      const refreshed = await getAlbum(expectedSlug, currentAlbumState.ownerToken);
      currentAlbumState = { ...refreshed, slug: expectedSlug, ownerToken: currentAlbumState.ownerToken };
      refreshGalleryDom();
      schedulePreviewPoll();
    } catch {
      previewPollTimer = setTimeout(schedulePreviewPoll, 4000);
    }
  }, 2400);
}

async function renderAlbum(slug, ownerToken) {
  clearTimeout(previewPollTimer);
  previewPollTimer = null;
  currentAlbumState = null;
  root.innerHTML = `${setupBanner()}<main class="album-loading">${brand()}<div class="loading-pulse"></div><p>Abrindo as lembranças…</p></main>`;
  try {
    const state = await getAlbum(slug, ownerToken);
    currentAlbumState = { ...state, slug, ownerToken };
    drawAlbum();
  } catch (error) {
    root.innerHTML = `${setupBanner()}<main class="album-error-page">${brand()}<div class="album-error-card"><span class="album-error-icon" aria-hidden="true">${icon("circle-x")}</span><h1>Este álbum não foi encontrado.</h1><p>${esc(error.message || "Álbum não encontrado.")}</p><a class="button button--ink" href="#/">Voltar para o início</a></div></main>`;
  }
}

function drawAlbum() {
  const state = currentAlbumState;
  if (!state) return;
  const { album, media = [], viewerIsOwner, slug, ownerToken } = state;
  const images = media.filter((item) => item.kind === "image").length;
  const videos = media.length - images;
  const people = new Set(media.map((item) => item.uploaderName).filter(Boolean)).size;
  const suggestedName = localStorage.getItem(UPLOADER_KEY) || getCurrentUser()?.displayName || "";

  root.innerHTML = `${setupBanner()}<main class="album-page">
    <header class="album-topbar"><div class="page-width album-topbar__inner">${brand()}<div class="album-topbar__actions"><span data-auth-slot>${authControlHtml()}</span>${viewerIsOwner ? `<span class="owner-badge">Modo proprietário</span>` : ""}<button class="button button--ghost button--small" data-share-album>${icon("share")} <span class="button-label">Compartilhar álbum</span></button></div></div></header>
    <section class="album-hero"><div class="page-width album-hero__inner"><div class="album-hero__copy"><p class="eyebrow eyebrow--light"><span></span> Álbum compartilhado</p><h1>${esc(album.title)}</h1><p>${esc(album.description || "Cada olhar guarda um pedaço diferente deste momento.")}</p><div class="album-stats"><span>${icon("image")}<b id="album-stat-images">${images}</b> ${images === 1 ? "foto" : "fotos"}</span><span>${icon("video")}<b id="album-stat-videos">${videos}</b> ${videos === 1 ? "vídeo" : "vídeos"}</span><span>${icon("users")}<b id="album-stat-people">${people}</b> pessoas</span></div></div><div class="album-hero__ornament" aria-hidden="true"><span>memórias<br>em comum</span><i></i></div></div></section>
    <section class="album-content page-width"><aside class="upload-panel"><div class="upload-panel__heading"><span>${icon("plus")}</span><div><p>Sua vez</p><h2>Adicione seus momentos</h2></div></div><label class="field field--compact" for="uploader-name"><span>Como devemos identificar você?</span><input id="uploader-name" maxlength="50" placeholder="Seu nome" value="${esc(suggestedName)}"></label><label class="dropzone" id="dropzone"><input id="media-input" accept="image/*,video/*" multiple type="file"><span class="dropzone__icon" aria-hidden="true">${icon("upload-cloud")}</span><strong id="dropzone-title">Escolher fotos e vídeos</strong><small>ou arraste os arquivos para cá</small><em>Até ${formatUploadLimit()} por arquivo · envio retomável</em></label><div class="upload-progress" id="upload-progress" hidden><div class="upload-progress__top"><strong id="upload-progress-label">Preparando upload…</strong><span id="upload-progress-percent">0%</span></div><div class="upload-progress__track" aria-hidden="true"><span id="upload-progress-bar"></span></div><small id="upload-progress-detail">Aguardando…</small></div><p class="upload-success" id="upload-success" hidden></p><p class="form-error form-error--album" id="upload-error" hidden></p><div class="upload-panel__trust"><span aria-hidden="true">${icon("circle-check")}</span><p><b>Arquivos originais</b><br>Sem reduzir a qualidade · se a conexão cair, selecione o mesmo arquivo para continuar</p></div></aside>
      <div class="gallery-column"><div class="gallery-heading"><div><p class="eyebrow"><span></span> Galeria do álbum</p><h2 id="gallery-title">${galleryHeadingText(media)}</h2></div><button class="gallery-share" data-share-album>${icon("user-plus")} <span>Convidar pessoas</span></button></div><div id="gallery-body">${galleryHtml(state)}</div></div>
    </section>
    <footer class="album-footer page-width">${brand()}<p>Um álbum feito por todos que estavam lá.</p></footer>
  </main><div id="lightbox-root"></div>`;

  wireAuthControls();
  document.querySelectorAll("[data-share-album]").forEach((button) => button.addEventListener("click", () => copyOrShareAlbum(slug, album.title)));
  wireGalleryCards();
  schedulePreviewPoll();

  const input = document.getElementById("media-input");
  input.addEventListener("change", async (event) => { await handleUpload(Array.from(event.target.files || [])); input.value = ""; });
  const zone = document.getElementById("dropzone");
  ["dragenter", "dragover"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.add("dropzone--active"); }));
  ["dragleave", "drop"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.remove("dropzone--active"); }));
  zone.addEventListener("drop", (event) => handleUpload(Array.from(event.dataTransfer?.files || [])));
}

async function handleUpload(files) {
  if (!files.length || !currentAlbumState) return;
  if (!(await requireLogin("upload"))) return;

  const nameInput = document.getElementById("uploader-name");
  const uploaderName = nameInput.value.trim();
  const errorBox = document.getElementById("upload-error");
  const successBox = document.getElementById("upload-success");
  const title = document.getElementById("dropzone-title");
  const progress = document.getElementById("upload-progress");
  const progressLabel = document.getElementById("upload-progress-label");
  const progressPercent = document.getElementById("upload-progress-percent");
  const progressBar = document.getElementById("upload-progress-bar");
  const progressDetail = document.getElementById("upload-progress-detail");
  const mediaInput = document.getElementById("media-input");

  if (uploaderName.length < 2) {
    errorBox.textContent = "Escreva seu nome antes de adicionar os arquivos.";
    errorBox.hidden = false;
    nameInput.focus();
    return;
  }

  const maxBytes = APP_CONFIG.maxUploadMb * 1024 * 1024;
  const tooLarge = files.find((file) => file.size > maxBytes);
  if (tooLarge) {
    errorBox.textContent = `“${tooLarge.name}” ultrapassa o limite de ${formatUploadLimit()}.`;
    errorBox.hidden = false;
    return;
  }

  const invalid = files.find((file) => {
    const type = String(file.type || "").toLowerCase();
    return type && !type.startsWith("image/") && !type.startsWith("video/");
  });
  if (invalid) {
    errorBox.textContent = `“${invalid.name}” não é uma foto ou vídeo reconhecido.`;
    errorBox.hidden = false;
    return;
  }

  localStorage.setItem(UPLOADER_KEY, uploaderName);
  errorBox.hidden = true;
  successBox.hidden = true;
  progress.hidden = false;
  mediaInput.disabled = true;

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let finishedBytes = 0;
  let resumedAny = false;

  const updateProgress = ({ file, fileIndex, uploadedBytes, resumed }) => {
    resumedAny ||= Boolean(resumed);
    const overallBytes = Math.min(totalBytes, finishedBytes + uploadedBytes);
    const overallPercent = totalBytes ? Math.floor((overallBytes / totalBytes) * 100) : 0;
    const filePercent = file.size ? Math.floor((uploadedBytes / file.size) * 100) : 0;

    progressLabel.textContent = `${resumed ? "Retomando" : "Enviando"} ${fileIndex + 1} de ${files.length}: ${file.name}`;
    progressPercent.textContent = `${overallPercent}%`;
    progressBar.style.width = `${overallPercent}%`;
    progressDetail.textContent = `${filePercent}% deste arquivo · ${formatBytes(uploadedBytes)} de ${formatBytes(file.size)}`;
    title.textContent = resumed ? `Retomando: ${file.name}` : `Enviando: ${file.name}`;
  };

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      updateProgress({ file, fileIndex: index, uploadedBytes: 0, resumed: false });

      await uploadMedia(currentAlbumState.slug, file, uploaderName, {
        onProgress({ uploadedBytes, resumed }) {
          updateProgress({ file, fileIndex: index, uploadedBytes, resumed });
        },
      });

      finishedBytes += file.size;
      updateProgress({ file, fileIndex: index, uploadedBytes: file.size, resumed: resumedAny });
    }

    progressPercent.textContent = "100%";
    progressBar.style.width = "100%";
    progressLabel.textContent = "Upload concluído";
    progressDetail.textContent = `${files.length} ${files.length === 1 ? "arquivo enviado" : "arquivos enviados"} com sucesso.`;

    const refreshed = await getAlbum(currentAlbumState.slug, currentAlbumState.ownerToken);
    currentAlbumState = { ...refreshed, slug: currentAlbumState.slug, ownerToken: currentAlbumState.ownerToken };
    drawAlbum();

    const newSuccess = document.getElementById("upload-success");
    newSuccess.textContent = isDemoMode
      ? "Mídia adicionada nesta sessão de demonstração."
      : resumedAny
        ? "Tudo pronto! O envio foi retomado e concluído sem recomeçar do zero."
        : "Upload concluído! Os originais já estão salvos e as miniaturas estão sendo preparadas.";
    newSuccess.hidden = false;
  } catch (error) {
    errorBox.textContent = `${error.message || "Não foi possível enviar os arquivos."} Se a conexão tiver caído, selecione o mesmo arquivo novamente para continuar de onde parou.`;
    errorBox.hidden = false;
    title.textContent = "Escolher fotos e vídeos";
    progressLabel.textContent = "Upload interrompido";
    progressDetail.textContent = "A parte já recebida fica guardada temporariamente para retomada.";
    mediaInput.disabled = false;
  }
}

function openLightbox(mediaId) {
  const state = currentAlbumState;
  const media = state?.media || [];
  const index = media.findIndex((entry) => entry.id === mediaId);
  const item = media[index];
  if (!item) return;

  const src = mediaUrl(item.url);
  const mediaMarkup = item.kind === "video"
    ? `<video autoplay controls playsinline src="${esc(src)}"></video>`
    : `<img alt="${esc(item.name)}" src="${esc(src)}">`;

  const hasNavigation = media.length > 1;
  const rootBox = document.getElementById("lightbox-root");
  rootBox.innerHTML = `<div class="lightbox" role="dialog" aria-modal="true" aria-label="Visualizar arquivo">
    <button class="lightbox__backdrop" aria-label="Fechar"></button>
    <div class="lightbox__content">
      <div class="lightbox__media">
        ${mediaMarkup}
        ${hasNavigation ? `<button class="lightbox__nav lightbox__nav--prev" id="lightbox-prev" aria-label="Arquivo anterior">${icon("chevron-left")}</button><button class="lightbox__nav lightbox__nav--next" id="lightbox-next" aria-label="Próximo arquivo">${icon("chevron-right")}</button>` : ""}
      </div>
      <div class="lightbox__info">
        <button class="lightbox__close" aria-label="Fechar">${icon("x")}</button>
        <p class="eyebrow"><span></span> Momento compartilhado</p>
        <h2>${esc(item.name)}</h2>
        <dl>
          <div><dt>Enviado por</dt><dd>${esc(item.uploaderName)}</dd></div>
          <div><dt>Data</dt><dd>${esc(formatDate(item.createdAt))}</dd></div>
          <div><dt>Tamanho</dt><dd>${esc(formatBytes(item.sizeBytes))}</dd></div>
        </dl>
        <div class="lightbox__actions">
          ${state.album.allowDownload ? `<a class="button button--ink button--wide" download href="${esc(mediaDownloadUrl(item.url))}"><span>Baixar original</span>${icon("download")}</a>` : ""}
          <button class="button button--ghost button--wide" id="lightbox-share"><span>Compartilhar álbum</span>${icon("share")}</button>
          ${state.viewerIsOwner ? `<button class="danger-link" id="lightbox-delete">${icon("trash")} <span>Remover do álbum</span></button>` : ""}
        </div>
      </div>
    </div>
  </div>`;

  const close = () => { rootBox.innerHTML = ""; };
  rootBox.querySelector(".lightbox__backdrop").addEventListener("click", close);
  rootBox.querySelector(".lightbox__close").addEventListener("click", close);
  rootBox.querySelector("#lightbox-share").addEventListener("click", () => copyOrShareAlbum(state.slug, state.album.title));

  rootBox.querySelector("#lightbox-prev")?.addEventListener("click", () => {
    const previous = media[(index - 1 + media.length) % media.length];
    openLightbox(previous.id);
  });
  rootBox.querySelector("#lightbox-next")?.addEventListener("click", () => {
    const next = media[(index + 1) % media.length];
    openLightbox(next.id);
  });

  rootBox.querySelector("#lightbox-delete")?.addEventListener("click", async () => {
    if (!confirm(`Remover “${item.name}” do álbum?`)) return;
    try {
      await deleteMedia(item.id, state.ownerToken);
      const refreshed = await getAlbum(state.slug, state.ownerToken);
      currentAlbumState = { ...refreshed, slug: state.slug, ownerToken: state.ownerToken };
      close();
      drawAlbum();
    } catch (error) {
      alert(error.message || "Não foi possível remover o arquivo.");
    }
  });
}

function route() {
  const current = parseRoute();
  if (current.page === "album") renderAlbum(current.slug, current.owner);
  else renderHome();
}

window.addEventListener("hashchange", () => {
  if (["#como-funciona", "#seus-albuns", "#criar"].includes(location.hash)) return;
  route();
});
subscribeAuth(() => refreshAuthControls());
route();
