import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage } from 'node:http';

/**
 * Serves netlify/functions/*.mts during `npm run dev`, so the admin's "create user"
 * works locally without the Netlify CLI. In production Netlify runs the same files.
 */
function netlifyFunctionsInDev(): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });

  return {
    name: 'netlify-functions-in-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/.netlify/functions/')) return next();
        const name = req.url.slice('/.netlify/functions/'.length).split(/[/?]/)[0];
        try {
          const mod = await server.ssrLoadModule(`/netlify/functions/${name}.mts`);
          const body = req.method === "GET" || req.method === "HEAD" ? undefined : new Uint8Array(await readBody(req));
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const response: Response = await mod.default(
            new Request(`http://localhost${req.url}`, { method: req.method, headers, body }),
            {},
          );
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.config.logger.error(String(err));
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Hand the server-only variables to the function above in development.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), netlifyFunctionsInDev()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, host: '127.0.0.1' },
    build: { sourcemap: true, chunkSizeWarningLimit: 900 },
  };
});
