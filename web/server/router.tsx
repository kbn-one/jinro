/**
 * The app, wired by hand.
 *
 * Route definitions live in `client/routes.ts` and this file maps them to what answers them — the
 * shape a Remix app has. `router.map(routes, controller)` is the whole of the mapping, and a
 * controller has to name an action for every route in the map it owns: leave one out and the
 * router throws while it is being built, rather than answering a route with nothing.
 *
 * What is exported is a plain `@remix-run/fetch-router` router, and it is deployed two ways from
 * this one file:
 *
 * - **Locally** `deno serve router.tsx` answers the pages *and* the server-only routes (`/api/*`,
 *   `/.well-known/jwks.json`) live. This is also what the tests run against.
 * - **Cloudflare Workers** serves the static build below as static assets and answers only the
 *   server-only routes, from `worker.ts` — this file uses Deno-only APIs and is not deployed there.
 * - **GitHub Pages** is `@remix-kbn/ssg` crawling this same object with `fetch()` and writing each
 *   response to disk. It starts from `entryPoints` and follows links, and nothing links to the
 *   server-only routes, so `/api/*` is never generated.
 */

import {
  createController,
  createRouter,
  type RouterContext,
} from "@remix-run/fetch-router";
import { cop } from "@remix-run/cop-middleware";
import { render } from "@remix-run/render-middleware";
import { createFileTree, githubPages } from "@remix-kbn/ssg/site";
import { stripBase } from "@remix-kbn/ssg/base";
import type { FileServerBehavior } from "@remix-kbn/ssg/site";

import { assets, assetsPath } from "./assets.ts";
import { contentSecurityPolicy, nonceOf } from "./csp.ts";
import { clientRuntime } from "./runtime.ts";
import { ogImage, ogPaths, serveOgImage } from "./og/mod.ts";
import { base } from "../client/base.ts";
import { Layout, type PageModule } from "../client/layout.tsx";
import { routes } from "../client/routes.ts";

import { blogController } from "./blog/mod.tsx"; // [feature:blog]
import * as Fullscreen from "../client/pages/fullscreen.tsx"; // [feature:fullscreen]
import * as Home from "../client/pages/index.tsx";
import * as Wasm from "../client/pages/wasm.tsx"; // [feature:jinro-demo]
import * as My from "../client/pages/my.tsx";
// [feature:play]
import * as PlayIndex from "../client/pages/play/index.tsx";
import * as PlayOwner from "../client/pages/play/owner.tsx";
import * as PlayJoin from "../client/pages/play/join.tsx";
import * as PlayMe from "../client/pages/play/me.tsx";

// [feature:protected-api] / [feature:server-send] / [feature:turso]: the server API.
import { apiController } from "./controllers/api/controller.ts";
import { notifyAction } from "./controllers/api/notify.ts";
import { tursoAction } from "./controllers/api/turso.ts";
import { roomsController } from "./controllers/api/rooms.ts"; // [feature:play]
import { jwksAction } from "./controllers/well_known.ts";
import { copDenied } from "./lib/problem.ts";

/** Deploy path prefix. The build strips it back off when writing, so output lands at the root. */
export { base };

/** Where the static build deploys. The build writes the file this rule would serve. */
export const fileServer: FileServerBehavior = githubPages();

/**
 * Renders a page module into the shell.
 *
 * The route comes in alongside the module because the page's own path is what its social card is
 * registered under — the card is drawn from the same `title` and `description` the `<head>` gets.
 */
function pageAction(route: { href(): string }, page: PageModule) {
  const image = ogImage(route.href(), page);
  const Page = page.default;

  return (context: AppContext): Response =>
    context.render(
      <Layout
        nonce={nonceOf(context)}
        title={page.title}
        description={page.description}
        image={image}
        viewport={page.viewport}
        bare={page.bare}
        script={page.hydrate ? clientRuntime : null}
      >
        <Page />
      </Layout>,
    );
}

/** The files under `client/static/`, served verbatim at their own names. */
const staticFiles = await createFileTree({
  rootDir: `${import.meta.dirname}/../client/static`,
  basePath: `${base}/static`,
  cacheControl: "public, max-age=3600",
});

/**
 * The service worker, from `client/sw.js`.
 *
 * It is a route of its own rather than a file under `static/` because a worker's scope is the
 * directory it is served from: `${base}/static/sw.js` could only control `${base}/static/`.
 */
const serviceWorker = await Deno.readTextFile(
  new URL("../client/sw.js", import.meta.url),
);

/**
 * `cop()` rejects unsafe cross-origin browser requests (`POST /api/notify`, the protected API) by
 * `Sec-Fetch-Site` / `Origin`, without tokens, answering with an RFC 9457 problem (`lib/problem.ts`). `contentSecurityPolicy` is the CSP (`csp.ts`). `render({ assets })`
 * puts `context.render(node)` on every request.
 */
const router = createRouter({
  middleware: [
    cop({ onDeny: copDenied }),
    contentSecurityPolicy,
    render({ assets }),
  ],
});

/** The request context those middlewares produce — `context.render`, in practice. */
export type AppContext = RouterContext<typeof router>;

declare module "@remix-run/fetch-router" {
  interface RouterTypes {
    context: AppContext;
  }
}

/**
 * The direct routes at the top of the map: the pages, and the JWKS document.
 *
 * `routes.api` is a map, so it is mapped separately below.
 */
const top = createController(routes, {
  actions: {
    home: pageAction(routes.home, Home),
    wasm: pageAction(routes.wasm, Wasm), // [feature:jinro-demo]
    // [feature:fullscreen]
    fullscreen: pageAction(routes.fullscreen, Fullscreen),
    my: pageAction(routes.my, My),
    jwks: jwksAction, // [feature:server-send]
  },
});

/**
 * The server-only API. Static builds never reach it — see the header.
 *
 * `routes.api.protected` is a map of its own, owned by `apiController`, because the DPoP
 * middleware belongs to those two routes and not to `notify`/`turso`.
 */
const api = createController(routes.api, {
  actions: {
    notify: notifyAction, // [feature:server-send]
    turso: tursoAction, // [feature:turso]
  },
});

router.map(routes, top);
// [feature:play] The play pages; which room they show is in the URL fragment.
router.map(
  routes.play,
  createController(routes.play, {
    actions: {
      index: pageAction(routes.play.index, PlayIndex),
      owner: pageAction(routes.play.owner, PlayOwner),
      join: pageAction(routes.play.join, PlayJoin),
      me: pageAction(routes.play.me, PlayMe),
    },
  }),
);
// [feature:blog] Both blog routes at once: the listing, and one article.
router.map(routes.blog, blogController);
router.map(routes.api, api);
router.map(routes.api.protected, apiController); // [feature:protected-api]
router.map(routes.api.rooms, roomsController); // [feature:play]

router.get(`${base}/static/*path`, ({ request }) => staticFiles.fetch(request));
router.get(`${assetsPath}/*path`, ({ request }) => assets.fetch(request));
router.get(`${base}/og/*path`, ({ request }) => serveOgImage(request));
// [feature:push] The service worker.
router.get(
  `${base}/sw.js`,
  () =>
    new Response(serviceWorker, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
        "service-worker-allowed": `${base}/`,
      },
    }),
);

/**
 * Where the static crawl starts.
 *
 * Pages are reached by following links from `/`. The exceptions are things nothing links to: the
 * social cards (an `og:image` is an absolute URL meant for someone else's server) and the service
 * worker (the push manager registers it by URL from script). `/api/*` is deliberately absent.
 */
export const entryPoints: readonly string[] = [
  "/",
  ...ogPaths(),
  "/sw.js", // [feature:push]
  // [feature:play] Reached only through links the islands build (with a fragment).
  "/play/owner",
  "/play/join",
  "/play/me",
  // [feature:jinro-demo] The engine `client/jinro.ts` fetches at runtime.
  "/static/jinro/jinro.wasm",
  // [feature:helper] The chat's chunk is only named by an attribute on the help button, which a
  // link-following crawl never reads — see `client/helper/install.ts`.
  `/${stripBase(clientRuntime.helper, base)}`,
];

export default router;
