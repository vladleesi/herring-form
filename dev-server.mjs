import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(projectRoot, "public");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 8765);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(pathname) {
  const requestPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const staticRoot = pathname.startsWith("/images/") ? publicRoot : projectRoot;
  const filePath = normalize(join(staticRoot, requestPath));
  const allowedPrefix = normalize(staticRoot).replace(/[\\/]+$/, "") + sep;

  return filePath.startsWith(allowedPrefix) ? filePath : null;
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  const filePath = resolveRequestPath(pathname);

  try {
    if (!filePath || !(await stat(filePath)).isFile()) throw new Error("Not found");

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Dog measurement guide: http://${host}:${port}`);
});
