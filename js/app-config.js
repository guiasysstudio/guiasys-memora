const local = ["localhost", "127.0.0.1"].includes(location.hostname);

export const APP_CONFIG = {
  // Em teste local, o site conversa com o Memora Server local automaticamente.
  // Em produção, continuará em demonstração até publicarmos a API HTTPS no servidor físico.
  apiBaseUrl: local ? "http://127.0.0.1:8787" : "",
  demoMode: !local,

  maxUploadMb: 95,
  requireLoginForCreate: true,
  requireLoginForUpload: true,
};
