const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const path = require("node:path");

const DIST_DIR = path.resolve(__dirname, "dist");
const API_ORIGIN = (process.env.API_ORIGIN || "https://jn-orcamentos-production.up.railway.app").replace(/\/$/, "");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendFile(response, filePath, method) {
  const extension = path.extname(filePath).toLowerCase();
  const mutableAsset = [".html", ".webmanifest", ".js"].includes(extension)
    || path.basename(filePath).startsWith("pwa-icon-");
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": mutableAsset ? "no-cache" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  if (method === "HEAD") return response.end();
  fs.createReadStream(filePath).pipe(response);
}

function proxyApi(request, response) {
  const target = new URL(request.url, API_ORIGIN);
  const transport = target.protocol === "https:" ? https : http;
  const headers = { ...request.headers, host: target.host };
  const upstream = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    method: request.method,
    path: `${target.pathname}${target.search}`,
    headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.setTimeout(20_000, () => upstream.destroy(new Error("Tempo limite ao acessar a API")));
  upstream.on("error", (error) => {
    if (response.headersSent) return response.destroy(error);
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ error: "O servidor de dados está temporariamente indisponível." }));
  });
  request.pipe(upstream);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end("Method not allowed");
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    return response.end("Bad request");
  }

  if (pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return response.end(JSON.stringify({ ok: true }));
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) return proxyApi(request, response);

  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(DIST_DIR, relativePath);
  if (filePath !== path.join(DIST_DIR, "index.html") && !filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
    response.writeHead(404);
    return response.end("Not found");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(response, filePath, request.method);
  }
  // The app uses HashRouter; return its entry point for browser refreshes and PWA launches.
  return sendFile(response, path.join(DIST_DIR, "index.html"), request.method);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log(`J&N Orçamentos web listening on ${port}`));

