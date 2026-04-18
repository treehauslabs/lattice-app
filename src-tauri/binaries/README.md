# Bundled `lattice-node` sidecar

Tauri expects one binary per supported host, named with the **Rust target triple** suffix. Drop them in this directory before running `npm run tauri:build`:

```
binaries/
  lattice-node-aarch64-apple-darwin
  lattice-node-x86_64-apple-darwin
  lattice-node-x86_64-unknown-linux-gnu
  lattice-node-x86_64-pc-windows-msvc.exe
```

Get your host triple with:

```sh
rustc -Vv | sed -n 's/host: //p'
```

## Building `lattice-node` for each host

From `lattice-node/`:

```sh
# macOS arm64 (build on Apple Silicon)
swift build -c release --arch arm64
cp .build/arm64-apple-macosx/release/lattice-node \
   ../lattice-app/src-tauri/binaries/lattice-node-aarch64-apple-darwin

# macOS x86_64 (build on Intel Mac or via universal cross-build)
swift build -c release --arch x86_64
cp .build/x86_64-apple-macosx/release/lattice-node \
   ../lattice-app/src-tauri/binaries/lattice-node-x86_64-apple-darwin

# Linux x86_64 (build inside a Linux box or Docker)
swift build -c release
cp .build/release/lattice-node \
   ../lattice-app/src-tauri/binaries/lattice-node-x86_64-unknown-linux-gnu

# Windows x86_64 (build on Windows with Swift toolchain)
swift build -c release
copy .build\release\lattice-node.exe ^
  ..\lattice-app\src-tauri\binaries\lattice-node-x86_64-pc-windows-msvc.exe
```

## Dev mode

`npm run tauri:dev` only needs the binary matching the current host. If it's
missing, the app still launches but falls back to "External" mode — so if you
have a node already running on `127.0.0.1:8080`, you don't need sidecar
binaries at all for development.

## Required CLI flags

The Rust manager invokes the sidecar with:

```
lattice-node --rpc-port <picked-port> --data-dir <app-data>/node --rpc-auth cookie
```

If the Swift node's CLI uses different flag names, update
`src-tauri/src/node.rs` (`spawn_managed`) to match.
