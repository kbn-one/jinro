//! `jinro`: a WASI command. Reads one JSON request from stdin, writes one JSON response to stdout
//! (see `lib.rs` for the protocol). Exits 1 when the response is an error, 0 otherwise.

use std::io::{Read, Write};

fn main() {
    let mut input = String::new();
    let response = match std::io::stdin().read_to_string(&mut input) {
        Ok(_) => jinro_wasi::handle(&input),
        Err(e) => jinro_wasi::Response::Error(format!("cannot read stdin: {e}")),
    };
    let failed = matches!(response, jinro_wasi::Response::Error(_));
    let text = serde_json::to_string(&response).expect("responses always serialize");
    let mut out = std::io::stdout().lock();
    out.write_all(text.as_bytes()).expect("cannot write stdout");
    out.write_all(b"\n").expect("cannot write stdout");
    out.flush().expect("cannot write stdout");
    drop(out);
    if failed {
        std::process::exit(1);
    }
}
