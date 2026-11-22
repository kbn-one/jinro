// Runs the WasmGC build of Demo and prints the same lines as `native.lean`.
const file = Deno.args[0] ??
  new URL("./out/demo.wasm", import.meta.url).pathname;
const { instance } = await WebAssembly.instantiate(await Deno.readFile(file));
const f = instance.exports as Record<string, (n: number) => number>;
// Naturals below 2^30 cross the JS boundary as i31ref <-> number.
for (const n of [0, 1, 10, 20, 25]) console.log(`fib ${n} = ${f.fib(n)}`);
for (const n of [0, 10, 1000, 10000]) console.log(`sumTo ${n} = ${f.sumTo(n)}`);
for (const n of [1, 10, 1000, 5000]) {
  console.log(`treeSize ${n} = ${f.treeSize(n)}`);
}
