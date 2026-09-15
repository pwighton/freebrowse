# FreeBrowse embedded in a plain (vanilla JS) page

The host page owns a NiiVue instance, mounts FreeBrowse around it with
`mountFreeBrowse`, and drives the instance directly with niivue's API; the
FreeBrowse UI follows. The page also has its own styles, canvas and footer so
that any style leaking out of FreeBrowse would be visible.

The example installs the **packed tarball**, not a workspace link, so it exercises
the real package (`exports`, types, bundled React, scoped CSS):

```bash
cd frontend
npm run examples:pack        # build:package + npm pack -> examples/freebrowse.tgz
cd examples/vanilla
npm install
npm run dev                  # http://localhost:5173/
```

Append `?nomount` to the URL to see the host page without FreeBrowse (used by the
CSS-bleed check). Re-run `npm run examples:pack` and `npm install` after changing
the package.
