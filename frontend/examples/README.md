# Examples

Two host applications that embed FreeBrowse from the built npm package:

- [`vanilla/`](vanilla/) — plain JavaScript + Vite, `mountFreeBrowse` (React bundled). The
  shape of a Neurodesk web app. Doubles as the CSS-bleed check: the host page has its own
  styles, canvas and footer.
- [`react/`](react/) — React 19 + Vite, the `freebrowse/react` component.

Both install `freebrowse` from `examples/freebrowse.tgz`, produced by
`npm run examples:pack` in `frontend/`, so they exercise the real package exactly as a
consumer would (`exports` map, types, bundled React, scoped CSS) — not a workspace link.
