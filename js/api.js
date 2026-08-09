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

async function readResponse(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  return response.text();
}

async function authorizedFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Memora-Client", "github-pages-rebuild/1.1");

  const response = await fetch(`${apiBase()}${path}`, { ...options, headers });
  const data = await readResponse(response);

  if (!response.ok) {
    const message = data && typeof data === "object" ? data.error : data;
    const error = new Error(message || `Erro HTTP ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function fileResumeKey(file) {
  const sampleSize = 64 * 1024;
  const first = new Uint8Array(await file.slice(0, Math.min(sampleSize, file.size)).arrayBuffer());
  const lastStart = Math.max(0, file.size - sampleSize);
  const last = new Uint8Array(await file.slice(lastStart, file.size).arrayBuffer());
  const meta = new TextEncoder().encode(`${file.name}\n${file.size}\n${file.lastModified}\n${file.type || ""}\n`);

  const combined = new Uint8Array(meta.length + first.length + last.length);
  combined.set(meta, 0);
  combined.set(first, meta.length);
  combined.set(last, meta.length + first.length);

  return bytesToHex(await crypto.subtle.digest("SHA-256", combined));
}

async function sendChunk(uploadId, offset, blob) {
  const token = await getIdToken();
  const response = await fetch(`${apiBase()}/api/uploads/${encodeURIComponent(uploadId)}/chunk`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-Upload-Offset": String(offset),
      "X-Memora-Client": "github-pages-rebuild/1.1",
    },
    body: blob,
  });

  const data = await readResponse(response);
  if (response.status === 409 && data && typeof data === "object" && Number.isFinite(Number(data.expectedOffset))) {
    return { conflict: true, expectedOffset: Number(data.expectedOffset), data };
  }
  if (!response.ok) {
    const message = data && typeof data === "object" ? data.error : data;
    const error = new Error(message || `Erro HTTP ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { conflict: false, data };
}

async function sendChunkWithRetry(uploadId, offset, blob) {
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await sendChunk(uploadId, offset, blob);
      if (result.conflict) return result;
      return result;
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500 && error.status !== 408 && error.status !== 429) throw error;

      try {
        const status = await authorizedFetch(`/api/uploads/${encodeURIComponent(uploadId)}`, { cache: "no-store" });
        const uploadedBytes = Number(status?.upload?.uploadedBytes || 0);
        if (uploadedBytes > offset) {
          return { conflict: true, expectedOffset: uploadedBytes, data: status };
        }
      } catch (statusError) {
        if (statusError?.status && statusError.status >= 400 && statusError.status < 500) throw statusError;
      }

      if (attempt < 4) await sleep(1000 * (2 ** attempt));
    }
  }

  throw lastError || new Error("A conexão foi interrompida durante o upload.");
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

export async function uploadMedia(slug, file, uploaderName, options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};

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
    onProgress({ uploadedBytes: file.size, totalBytes: file.size, percent: 100, resumed: false });
    return { media };
  }

  const clientUploadKey = await fileResumeKey(file);
  const init = await authorizedFetch(`/api/albums/${encodeURIComponent(slug)}/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      uploaderName,
      clientUploadKey,
    }),
  });

  const upload = init.upload;
  let offset = Number(upload.uploadedBytes || 0);
  const chunkSize = Math.max(1, Number(upload.chunkSizeBytes || 8 * 1024 * 1024));
  const resumed = Boolean(init.resumed || offset > 0);

  onProgress({
    uploadedBytes: offset,
    totalBytes: file.size,
    percent: file.size ? Math.floor((offset / file.size) * 100) : 0,
    resumed,
  });

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    const blob = file.slice(offset, end);
    const result = await sendChunkWithRetry(upload.id, offset, blob);

    if (result.conflict) {
      const expected = Number(result.expectedOffset);
      if (!Number.isSafeInteger(expected) || expected < 0 || expected > file.size) {
        throw new Error("O servidor retornou uma posição de retomada inválida.");
      }
      offset = expected;
    } else {
      offset = Number(result.data?.uploadedBytes ?? end);
    }

    onProgress({
      uploadedBytes: offset,
      totalBytes: file.size,
      percent: file.size ? Math.min(100, Math.floor((offset / file.size) * 100)) : 0,
      resumed,
    });
  }

  const completed = await authorizedFetch(`/api/uploads/${encodeURIComponent(upload.id)}/complete`, {
    method: "POST",
  });

  onProgress({ uploadedBytes: file.size, totalBytes: file.size, percent: 100, resumed });
  return completed;
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
