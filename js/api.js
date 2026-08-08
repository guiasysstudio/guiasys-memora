import { APP_CONFIG } from "./app-config.js";
import { getIdToken } from "./auth.js";

const DEMO_ALBUMS_KEY = "memora-demo-albums-v1";
const demoSessionMedia = new Map();

export const isDemoMode = APP_CONFIG.demoMode || !String(APP_CONFIG.apiBaseUrl || "").trim();

function apiBase() {
  return String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
}

function randomHex(length = 32) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

function readDemoAlbums() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_ALBUMS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeDemoAlbums(albums) {
  localStorage.setItem(DEMO_ALBUMS_KEY, JSON.stringify(albums));
}

async function authorizedFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Memora-Client", "github-pages-rebuild/1.0");

  const response = await fetch(`${apiBase()}${path}`, { ...options, headers });
  let data = null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) data = await response.json();
  else data = await response.text();

  if (!response.ok) {
    const message = data && typeof data === "object" ? data.error : data;
    throw new Error(message || `Erro HTTP ${response.status}.`);
  }
  return data;
}

export async function getMyAlbums() {
  if (isDemoMode) {
    return { albums: readDemoAlbums().map((item) => item.album) };
  }
  return authorizedFetch("/api/albums/mine", { cache: "no-store" });
}

export async function createAlbum({ title, description }) {
  if (isDemoMode) {
    const album = {
      slug: randomHex(16),
      title,
      description,
      allowDownload: true,
      createdAt: new Date().toISOString(),
    };
    const ownerToken = randomHex(48);
    const albums = readDemoAlbums();
    albums.unshift({ album, ownerToken });
    writeDemoAlbums(albums.slice(0, 50));
    return { album, ownerToken };
  }

  return authorizedFetch("/api/albums", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, description }),
  });
}

export async function getAlbum(slug, ownerToken = "") {
  if (isDemoMode) {
    const entry = readDemoAlbums().find((item) => item.album.slug === slug);
    if (!entry) throw new Error("Álbum não encontrado neste navegador de demonstração.");
    return {
      album: entry.album,
      media: demoSessionMedia.get(slug) || [],
      viewerIsOwner: Boolean(ownerToken && ownerToken === entry.ownerToken),
    };
  }

  const owner = ownerToken ? `?owner=${encodeURIComponent(ownerToken)}` : "";
  return authorizedFetch(`/api/albums/${encodeURIComponent(slug)}${owner}`, { cache: "no-store" });
}

export async function uploadMedia(slug, file, uploaderName) {
  if (isDemoMode) {
    const media = {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      uploaderName,
      createdAt: new Date().toISOString(),
      kind: file.type.startsWith("video/") ? "video" : "image",
      url: URL.createObjectURL(file),
      demoObjectUrl: true,
    };
    const list = demoSessionMedia.get(slug) || [];
    list.push(media);
    demoSessionMedia.set(slug, list);
    return { media };
  }

  const form = new FormData();
  form.append("file", file);
  form.append("uploaderName", uploaderName);
  return authorizedFetch(`/api/albums/${encodeURIComponent(slug)}/media`, {
    method: "POST",
    body: form,
  });
}

export async function deleteMedia(id, ownerToken) {
  if (isDemoMode) {
    for (const [slug, list] of demoSessionMedia.entries()) {
      const index = list.findIndex((item) => item.id === id);
      if (index >= 0) {
        const [removed] = list.splice(index, 1);
        if (removed?.demoObjectUrl) URL.revokeObjectURL(removed.url);
        demoSessionMedia.set(slug, list);
        return { ok: true };
      }
    }
    return { ok: true };
  }

  return authorizedFetch(`/api/media/${encodeURIComponent(id)}?owner=${encodeURIComponent(ownerToken)}`, {
    method: "DELETE",
  });
}

export function mediaUrl(url) {
  if (!url) return "";
  if (/^(blob:|data:|https?:)/i.test(url)) return url;
  return `${apiBase()}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function mediaDownloadUrl(url) {
  const resolved = mediaUrl(url);
  if (!resolved || resolved.startsWith("blob:")) return resolved;
  return `${resolved}${resolved.includes("?") ? "&" : "?"}download=1`;
}
