/**
 * Post-processes `jco transpile` output for Deno's type checker (run by `deno task wasm`).
 *
 * jco writes `.d.ts` files that refer to each other as `./interfaces/foo.js`. Deno resolves a `.js`
 * specifier to the `.js` file, which does not exist for the interfaces, so `deno check` fails.
 * Pointing those imports at the `.d.ts` files fixes that without enabling sloppy imports.
 */

const dir = new URL("../client/jinro_wasm/", import.meta.url);

async function* dtsFiles(url: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(url)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), url);
    if (entry.isDirectory) yield* dtsFiles(child);
    else if (entry.name.endsWith(".d.ts")) yield child;
  }
}

for await (const file of dtsFiles(dir)) {
  const text = await Deno.readTextFile(file);
  // Both `from "./x.js"` and `import("./x.js")` forms.
  const fixed = text.replace(
    /(['"])(\.{1,2}\/[^'"]+)\.js(['"])/g,
    "$1$2.d.ts$3",
  );
  if (fixed !== text) await Deno.writeTextFile(file, fixed);
}
