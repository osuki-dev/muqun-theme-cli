import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { Effect } from 'effect';

/**
 * The local server behind `preview`.
 *
 * The website's preview page, `/themes/preview/?source=<url>`, fetches
 * `<source>theme.json` and then every asset the manifest declares, every couple
 * of seconds, and redraws only when the bytes differ. This is that source: the
 * theme directory over HTTP, read from disk on every request so a saved edit
 * is on screen at the next poll. Nothing is cached and nothing is watched --
 * the page already keeps time, and a watcher here would be a second clock
 * saying the same thing.
 *
 * Plain Bun and node:fs rather than Effect's FileSystem, because the handler
 * runs inside `Bun.serve`'s fetch callback, outside any fiber. Wrapping every
 * request in a runtime would buy a port the tests never use; they drive the
 * server over HTTP, as the page does.
 *
 * Bound to the loopback address on purpose. The page is on muqun.dev, but the
 * bytes never leave the machine, so the server has no business on the LAN.
 */

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 4173;
export const DEFAULT_SITE = 'https://muqun.dev';

export const PREVIEW_LAYOUTS = ['classic', 'editorial'] as const;
export type PreviewLayout = (typeof PREVIEW_LAYOUTS)[number];

export const PREVIEW_DEVICES = ['phone', 'tablet'] as const;
export type PreviewDevice = (typeof PREVIEW_DEVICES)[number];

export const PREVIEW_MODES = ['light', 'dark'] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];

export type PreviewPageOptions = {
  readonly layout?: PreviewLayout;
  readonly device?: PreviewDevice;
  readonly mode?: PreviewMode;
  readonly refresh?: number;
};

/** The page that draws a theme served at `source`. */
export const previewPageUrl = (
  site: string,
  source: string,
  options: PreviewPageOptions = {}
): string => {
  // Keep `source` in the same readable form as before. URLSearchParams on the
  // website decodes both forms, but preserving this spelling keeps existing
  // printed URLs and refresh behaviour stable for scripts and bookmarks.
  const query = [`source=${source}`];
  if (options.refresh !== undefined) query.push(`refresh=${encodeURIComponent(String(options.refresh))}`);
  if (options.layout !== undefined) query.push(`layout=${options.layout}`);
  if (options.device !== undefined) query.push(`device=${options.device}`);
  if (options.mode !== undefined) query.push(`mode=${options.mode}`);
  return `${site.replace(/\/+$/, '')}/themes/preview/?${query.join('&')}`;
};

export type PreviewServer = {
  readonly url: string;
  readonly stop: () => Promise<void>;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  // A public page reaching a loopback server is a "private network" request
  // in Chrome; the preflight is refused unless the server says this is fine.
  'Access-Control-Allow-Private-Network': 'true',
  'Cache-Control': 'no-store',
};

const respond = (body: string | Uint8Array | null, status: number, type?: string): Response =>
  new Response(body, { status, headers: type ? { ...CORS, 'Content-Type': type } : CORS });

const contentType = (path: string): string =>
  path.endsWith('.png')
    ? 'image/png'
    : path.endsWith('.webp')
      ? 'image/webp'
      : /\.jpe?g$/.test(path)
        ? 'image/jpeg'
        : 'application/octet-stream';

/**
 * The asset paths the manifest declares right now, read leniently.
 *
 * Deliberately not the schema. A manifest mid-edit -- a colour half typed --
 * fails validation, and the page reports that; the pictures should not vanish
 * at the same moment. Anything with a string `path` under `assets` counts,
 * and `relativePath` below decides whether it is safe to serve.
 */
const declaredPaths = (manifest: string): Set<string> => {
  const paths = new Set<string>();
  try {
    const assets: unknown = (JSON.parse(manifest) as { assets?: unknown }).assets;
    if (assets && typeof assets === 'object')
      for (const asset of Object.values(assets as Record<string, unknown>))
        if (asset && typeof asset === 'object' && typeof (asset as { path?: unknown }).path === 'string')
          paths.add((asset as { path: string }).path);
  } catch {
    // Not JSON at the moment. Nothing is declared, and theme.json itself is
    // still served so the page can say so.
  }
  return paths;
};

/**
 * The request path as a path inside the theme directory, or undefined when it
 * is not one. `..`, empty and `.` segments and backslashes are refused outright
 * rather than resolved, and the resolved file must still fall under the root:
 * the server hands out a directory an author chose, and nothing beside it.
 */
const relativePath = (root: string, pathname: string): string | undefined => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const relative = decoded.replace(/^\/+/, '');
  if (!relative || relative.includes('\\')) return undefined;
  if (relative.split('/').some((segment) => segment === '' || segment === '.' || segment === '..'))
    return undefined;
  return resolve(root, relative).startsWith(root + sep) ? relative : undefined;
};

/**
 * Serve `root` on the loopback address. Throws when the port cannot be bound;
 * the command turns that into a sentence naming `--port`.
 */
export const startPreviewServer = (options: {
  readonly root: string;
  readonly port: number;
  /** Where `GET /` sends a browser: the preview page pointed at this server. */
  readonly landing: string;
}): PreviewServer => {
  const root = resolve(options.root);
  const server = Bun.serve({
    hostname: HOST,
    port: options.port,
    // Production mode only for the error page; it also turns on SO_REUSEPORT,
    // which would let a second `preview` bind the same port and split the
    // page's requests between two themes. Explicitly off, so the second one
    // fails with EADDRINUSE and is told to pick another port.
    development: false,
    reusePort: false,
    fetch: async (request) => {
      if (request.method === 'OPTIONS') return respond(null, 204);
      if (request.method !== 'GET' && request.method !== 'HEAD') return respond('method not allowed', 405);

      const { pathname } = new URL(request.url);
      if (pathname === '/')
        return new Response(null, { status: 302, headers: { ...CORS, Location: options.landing } });

      const relative = relativePath(root, pathname);
      if (!relative) return respond('not found', 404);

      // Read fresh, every time: this is the whole reason edits show up.
      const manifest = await readFile(join(root, 'theme.json'), 'utf8').catch(() => undefined);
      if (relative === 'theme.json')
        return manifest === undefined
          ? respond('theme.json is missing', 404)
          : respond(manifest, 200, 'application/json');

      if (manifest === undefined || !declaredPaths(manifest).has(relative))
        return respond('not declared by theme.json', 404);
      const bytes = await readFile(join(root, relative)).catch(() => undefined);
      return bytes === undefined
        ? respond('declared by theme.json but not on disk', 404)
        : respond(bytes, 200, contentType(relative));
    },
  });
  return {
    url: `http://${HOST}:${server.port}/`,
    stop: () => server.stop(true),
  };
};

/**
 * Open `url` in the default browser. Resolves to undefined when the launcher
 * took it, and to a reason when it did not -- which the command prints as a
 * note, because a server that is up and a browser that did not open is an
 * inconvenience, not a failure.
 */
export const openInBrowser = async (url: string): Promise<string | undefined> => {
  // The empty argument to `start` is the window title it would otherwise take
  // the URL for.
  const command =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  try {
    const child = Bun.spawn(command, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
    // A launcher hands the URL over and exits at once. One still running after
    // a moment has most likely become the browser itself, as xdg-open does
    // without a desktop session; that is not a failure to open.
    const code = await Promise.race([child.exited, Bun.sleep(1500).then(() => 0)]);
    return code === 0 ? undefined : `${command[0]} exited with status ${code}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * Done when the process is asked to stop: Ctrl-C in the terminal, or a kill
 * from outside. Installing the handlers is what turns the signal from "die
 * now" into "finish up", so the server is stopped and the exit code is 0.
 */
export const untilInterrupted: Effect.Effect<void> = Effect.callback<void>((resume) => {
  const signals = ['SIGINT', 'SIGTERM'] as const;
  const detach = () => {
    for (const signal of signals) process.off(signal, onSignal);
  };
  const onSignal = () => {
    detach();
    resume(Effect.void);
  };
  for (const signal of signals) process.on(signal, onSignal);
  return Effect.sync(detach);
});
