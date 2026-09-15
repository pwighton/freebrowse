# FreeBrowse in a React host

Uses the `freebrowse/react` entry (React is a peer dependency there, so the host
and FreeBrowse share one React). The host owns the NiiVue instance and drives it
with niivue's API; the FreeBrowse UI follows.

```bash
cd frontend
npm run examples:pack        # build:package + npm pack -> examples/freebrowse.tgz
cd examples/react
npm install
npm run dev
```
