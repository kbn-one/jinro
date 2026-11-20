/**
 * Just enough WASI preview 1 to run a command with stdin and stdout, in the browser or in Deno.
 *
 * The jinro engine (`rust/jinro-wasi`) is a WASI command that reads one JSON request from stdin
 * and writes one JSON response to stdout. Its build imports five WASI functions, and those are all
 * this implements: no files, no clocks, no environment. Anything else the module imports answers
 * `ENOSYS`, so a newer build that wants more fails loudly rather than silently.
 */

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOSYS = 52;

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
  let memory: WebAssembly.Memory | undefined;
  const view = () => new DataView(memory!.buffer);
  const bytes = () => new Uint8Array(memory!.buffer);

  let stdinOffset = 0;
  const stdout: Uint8Array[] = [];
  const stderr: Uint8Array[] = [];

  const wasi: Record<string, (...args: number[]) => number> = {
    environ_sizes_get(countPtr, sizePtr) {
      view().setUint32(countPtr, 0, true);
      view().setUint32(sizePtr, 0, true);
      return ERRNO_SUCCESS;
    },
    environ_get() {
      return ERRNO_SUCCESS;
    },
    fd_read(fd, iovs, iovsLen, nreadPtr) {
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
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
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
    proc_exit(code) {
      throw new Exit(code);
    },
  };

  const imports: WebAssembly.Imports = { wasi_snapshot_preview1: {} };
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module !== "wasi_snapshot_preview1" || imp.kind !== "function") {
      throw new Error(`unsupported import ${imp.module}.${imp.name}`);
    }
    imports.wasi_snapshot_preview1[imp.name] = wasi[imp.name] ??
      (() => ERRNO_NOSYS);
  }

  const instance = new WebAssembly.Instance(module, imports);
  memory = instance.exports.memory as WebAssembly.Memory;
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
