const local = ["localhost", "127.0.0.1"].includes(location.hostname);

export const APP_CONFIG = {
  apiBaseUrl: local ? "http://127.0.0.1:8787" : "https://memora-api.guiasys.online",
  demoMode: false,
  maxUploadMb: 5120,
  requireLoginForCreate: true,
  requireLoginForUpload: true,
};
