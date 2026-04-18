# App icons

Placeholder. To generate real icons from `public/lattice.svg` run:

```sh
npm run tauri icon ../public/lattice.svg
```

That produces `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` (macOS), and `icon.ico` (Windows). Tauri expects all of these filenames to exist when `bundle.icon` in `tauri.conf.json` references them; committing blank placeholders here just documents the location.
