/** Small helpers the play islands share: polling the room, and copying to the clipboard. */

import type { Handle } from "@remix-run/component";

/**
 * Calls `tick` now and then every `ms`, from the client only, until the island goes away. There is
 * no push from the server: a page sees an agent's move, or the owner's `go`, on its next tick.
 */
export function poll(
  // deno-lint-ignore no-explicit-any
  handle: Handle<any, any>,
  tick: () => Promise<void>,
  ms = 2500,
): void {
  handle.queueTask(() => {
    let busy = false;
    const run = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        await tick();
      } finally {
        busy = false;
      }
    };
    run();
    const timer = setInterval(run, ms);
    const onVisible = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    handle.signal.addEventListener("abort", () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    });
  });
}

/** Copies `text`; resolves to whether it worked. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
