/**
 * Every URL the app answers, in one place.
 *
 * `server/router.tsx` maps these to the controllers that answer them, and everything that links
 * reads `routes.my.href()` rather than rebuilding `${base}/my` at each call site.
 *
 * The map is built with the deploy prefix as its base, so hrefs are correct under a GitHub Pages
 * repo sub-path or a PR preview URL without anyone prepending anything. On Cloudflare `base` is
 * empty.
 *
 * Two kinds of route live here and they are deployed differently:
 *
 * - **Pages** (`home`, `wasm`, `my`) are rendered to static HTML by the GitHub Pages build as
 *   well as served from the static build by Cloudflare.
 * - **Server routes** (`jwks` and everything under `api`) only exist on the live server. Nothing
 *   links to them, so the static build's crawl never reaches them, and they are not in
 *   `entryPoints`. The client may still name them (`routes.api.notify.href()`), which is why the
 *   shapes are stated here — a static deploy simply has no server to answer them.
 */

import { get, post, put, route } from "@remix-run/fetch-router/routes";

import { base } from "./base.ts";

export const routes = route(base, {
  home: get("/"),
  // [feature:jinro-demo] The wasm engine playground.
  wasm: get("/wasm"),
  // [feature:play] Playing a real game against the room API. Ids and keys travel in the URL
  // fragment (`#room=…&key=…`), so these stay static pages and keys never reach a server log.
  play: route("play", {
    /** Create a room. */
    index: get("/"),
    /** The owner's page: who has joined, who has acted, and `go`. */
    owner: get("/owner"),
    /** Join a room. */
    join: get("/join"),
    /** A player's own page: their role, their actions, what they may see. */
    me: get("/me"),
  }),
  // [feature:signin] (the push card on this page is [feature:push])
  my: get("/my"),
  // [feature:fullscreen]
  fullscreen: get("/fullscreen"),
  // [feature:blog]
  blog: route("blog", {
    index: get("/"),
    /** One article. Articles are Markdown files; `server/blog/` answers this by reading the slug's file. */
    show: get("/:slug"),
  }),
  // [feature:server-send] RP public JWKS — lets the IdP verify our `private_key_jwt` assertions.
  jwks: get("/.well-known/jwks.json"),
  api: route("api", {
    // [feature:server-send] Server-initiated push fan-out (delegates to the IdP). Not DPoP-protected.
    notify: post("/notify"),
    // [feature:turso] Turso (libSQL) + @remix-run/data-table sample.
    turso: get("/turso"),
    // [feature:play] The room API (`server/controllers/api/rooms.ts`; types in `play/types.ts`).
    rooms: route("rooms", {
      create: post("/"),
      show: get("/:roomId"),
      owner: get("/:roomId/owner"),
      go: post("/:roomId/go"),
      join: post("/:roomId/players"),
      me: get("/:roomId/players/:playId"),
      act: put("/:roomId/players/:playId/actions"),
    }),
    // [feature:protected-api] DPoP-protected JSON endpoints; `server/router.tsx` puts the DPoP middleware on this group.
    protected: route("protected", {
      get: get("/"),
      post: post("/"),
    }),
  }),
});
