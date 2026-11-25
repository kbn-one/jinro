// Runs U.treeSize (UInt32 build) against treeSize (Nat build) and times both.
const load = async (p: string) =>
  (await WebAssembly.instantiate(
    await Deno.readFile(new URL(p, import.meta.url)),
  )).instance.exports as Record<string, (n: number) => number>;
const nat = await load("./out/demo.wasm");
const u32 = await load("./out/u32.wasm");
let same = 0;
for (const n of [1, 2, 3, 10, 100, 1000, 5000, 20000]) {
  const a = nat.treeSize(n), b = u32["U.treeSize"](n);
  console.log(`n=${n} nat=${a} u32=${b}`);
  if (a === b) same++;
}
const time = (label: string, f: () => void) => {
  f();
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) f();
  console.log(`${label}: ${((performance.now() - t0) / 5).toFixed(1)} ms`);
};
time("treeSize 20000 (Nat)", () => nat.treeSize(20000));
time("treeSize 20000 (UInt32)", () => u32["U.treeSize"](20000));
console.log(same === 8 ? "ALL EQUAL" : "MISMATCH");
