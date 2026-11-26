/**
 * The room API from the browser, and the links between the play pages.
 *
 * The pages are static; which room (and whose key) they are about travels in the URL fragment —
 * `#room=…&key=…` — so a shared link carries it, the server never sees it in a request line, and
 * the static build needs no page per room. Credentials are also kept in `localStorage` so the
 * create and join pages can list "your rooms".
 */

import { routes } from "../routes.ts";
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinResponse,
  OwnerView,
  PlayerView,
  RoomView,
  SubmittedAction,
} from "./types.ts";

/** An API error, with the server's `detail`. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(
  method: string,
  href: string,
  key?: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(href, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(
      0,
      `サーバに届きません: ${e instanceof Error ? e.message : e}`,
    );
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) {
    throw new ApiError(
      res.status,
      "このサイトにはゲームのサーバがありません（静的な配信です）。`deno task dev` か Cloudflare で動かしてください。",
    );
  }
  const json = await res.json();
  if (!res.ok) throw new ApiError(res.status, json.detail ?? res.statusText);
  return json as T;
}

const r = routes.api.rooms;

export const api = {
  create: (req: CreateRoomRequest) =>
    call<CreateRoomResponse>("POST", r.create.href(), undefined, req),
  show: (roomId: string) => call<RoomView>("GET", r.show.href({ roomId })),
  owner: (roomId: string, roomKey: string) =>
    call<OwnerView>("GET", r.owner.href({ roomId }), roomKey),
  go: (roomId: string, roomKey: string) =>
    call<OwnerView>("POST", r.go.href({ roomId }), roomKey),
  join: (roomId: string, name: string) =>
    call<JoinResponse>("POST", r.join.href({ roomId }), undefined, { name }),
  me: (roomId: string, playId: string, playKey: string) =>
    call<PlayerView>("GET", r.me.href({ roomId, playId }), playKey),
  act: (
    roomId: string,
    playId: string,
    playKey: string,
    actions: SubmittedAction[],
  ) =>
    call<PlayerView>("PUT", r.act.href({ roomId, playId }), playKey, {
      actions,
    }),
};

// ---- fragments and links ---------------------------------------------------------------

export function fragment(): URLSearchParams {
  return new URLSearchParams(location.hash.slice(1));
}

const withFragment = (href: string, params: Record<string, string>) =>
  `${href}#${new URLSearchParams(params)}`;

export const links = {
  owner: (room: string, key: string) =>
    withFragment(routes.play.owner.href(), { room, key }),
  join: (room: string) => withFragment(routes.play.join.href(), { room }),
  me: (room: string, play: string, key: string) =>
    withFragment(routes.play.me.href(), { room, play, key }),
};

/** An absolute URL on this site. */
export const absolute = (href: string) => new URL(href, location.href).href;

// ---- what this browser has created or joined ------------------------------------------

export interface Saved {
  kind: "owner" | "player";
  room: string;
  key: string;
  play?: string;
  name?: string;
  at: string;
}

const STORAGE_KEY = "jinro.play";

export function saved(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function remember(entry: Omit<Saved, "at">): void {
  const rest = saved().filter((s) =>
    !(s.room === entry.room && s.kind === entry.kind && s.play === entry.play)
  );
  const next = [{ ...entry, at: new Date().toISOString() }, ...rest].slice(
    0,
    20,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function savedHref(s: Saved): string {
  return s.kind === "owner"
    ? links.owner(s.room, s.key)
    : links.me(s.room, s.play!, s.key);
}
