/**
 * Just enough WASI preview 1 to run a command with stdin and stdout, in the browser or in Deno.
 *
 * The jinro engine (`lean-engine`, built by Lasm) is a WASI command that reads one JSON request
 * from stdin and writes one JSON response to stdout. This implements only what that needs: stdio,
 * no arguments or environment, no preopened files, a clock and randomness. Anything else the
 * module imports answers `ENOSYS`, so a newer build that wants more fails loudly rather than
 * silently.
 */

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOSYS = 52;
const FILETYPE_CHARACTER_DEVICE = 2;

/** What a run of the command produced. */
export interface WasiRun {
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

class Exit {
  constructor(readonly code: number) {}
}

/**
 * Instantiates `module` and runs its `_start` once, with `stdin` as file descriptor 0.
 *
 * A command is single-use — its `_start` runs `main` and then exits — so every call gets a fresh
 * instance (and fresh memory) from the same compiled module.
 */
export function runWasi(
  module: WebAssembly.Module,
  stdin: Uint8Array,
): WasiRun {
  // Filled in once the instance exists; the imports only run after that.
  const state: { memory?: WebAssembly.Memory } = {};
  const view = () => new DataView(state.memory!.buffer);
  const bytes = () => new Uint8Array(state.memory!.buffer);

  let stdinOffset = 0;
  const stdout: Uint8Array[] = [];
  const stderr: Uint8Array[] = [];

  // Each import's own signature; i64 parameters arrive as `bigint`.
  const wasi: Record<string, (...args: never[]) => number> = {
    environ_sizes_get(countPtr: number, sizePtr: number) {
      view().setUint32(countPtr, 0, true);
      view().setUint32(sizePtr, 0, true);
      return ERRNO_SUCCESS;
    },
    environ_get() {
      return ERRNO_SUCCESS;
    },
    fd_read(fd: number, iovs: number, iovsLen: number, nreadPtr: number) {
      if (fd !== 0) return ERRNO_BADF;
      let nread = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        const chunk = stdin.subarray(stdinOffset, stdinOffset + len);
        bytes().set(chunk, ptr);
        stdinOffset += chunk.length;
        nread += chunk.length;
        if (chunk.length < len) break;
      }
      view().setUint32(nreadPtr, nread, true);
      return ERRNO_SUCCESS;
    },
    fd_write(
      fd: number,
      iovs: number,
      iovsLen: number,
      nwrittenPtr: number,
    ) {
      const sink = fd === 1 ? stdout : fd === 2 ? stderr : null;
      if (!sink) return ERRNO_BADF;
      let written = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        sink.push(bytes().slice(ptr, ptr + len));
        written += len;
      }
      view().setUint32(nwrittenPtr, written, true);
      return ERRNO_SUCCESS;
    },
    proc_exit(code: number) {
      throw new Exit(code);
    },
    // What a Lean runtime (Lasm's WASI build) asks for on top of the above: no arguments, no
    // preopened directories, stdio that is a character device, a clock and randomness.
    args_sizes_get(countPtr: number, sizePtr: number) {
      view().setUint32(countPtr, 0, true);
      view().setUint32(sizePtr, 0, true);
      return ERRNO_SUCCESS;
    },
    args_get() {
      return ERRNO_SUCCESS;
    },
    fd_prestat_get() {
      return ERRNO_BADF;
    },
    fd_fdstat_get(fd: number, statPtr: number) {
      if (fd > 2) return ERRNO_BADF;
      // struct fdstat: filetype u8, flags u16, rights_base u64, rights_inheriting u64 (24 bytes)
      bytes().fill(0, statPtr, statPtr + 24);
      view().setUint8(statPtr, FILETYPE_CHARACTER_DEVICE);
      view().setBigUint64(statPtr + 8, ~0n, true);
      return ERRNO_SUCCESS;
    },
    fd_close() {
      return ERRNO_SUCCESS;
    },
    clock_time_get(_id: number, _precision: bigint, timePtr: number) {
      const ns =
        BigInt(Math.round(performance.timeOrigin + performance.now())) *
        1_000_000n;
      view().setBigUint64(timePtr, ns, true);
      return ERRNO_SUCCESS;
    },
    random_get(ptr: number, len: number) {
      const buf = bytes().subarray(ptr, ptr + len);
      for (let i = 0; i < len; i += 65536) {
        crypto.getRandomValues(buf.subarray(i, Math.min(len, i + 65536)));
      }
      return ERRNO_SUCCESS;
    },
  };

  const imports: WebAssembly.Imports = { wasi_snapshot_preview1: {} };
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module !== "wasi_snapshot_preview1" || imp.kind !== "function") {
      throw new Error(`unsupported import ${imp.module}.${imp.name}`);
    }
    imports.wasi_snapshot_preview1[imp.name] = wasi[imp.name] as (
      ...args: unknown[]
    ) => number ??
      (() => ERRNO_NOSYS);
  }

  const instance = new WebAssembly.Instance(module, imports);
  state.memory = instance.exports.memory as WebAssembly.Memory;
  let exitCode = 0;
  try {
    (instance.exports._start as () => void)();
  } catch (e) {
    if (!(e instanceof Exit)) throw e;
    exitCode = e.code;
  }
  return { exitCode, stdout: concat(stdout), stderr: concat(stderr) };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
