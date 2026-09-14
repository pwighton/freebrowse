# FreeBrowse v2

🚧 Work in progress 🚧

FreeBrowse is a full-stack, web-based neuroimaging viewer and editor.  It
aspires to be a web-based version of the
[FreeSurfer](https://surfer.nmr.mgh.harvard.edu) tool
[FreeView](https://surfer.nmr.mgh.harvard.edu/fswiki/FreeviewGuide).

This is a re-write of the initial FreeBrowse implementation, based off of the
[niivue fullstack demo](https://github.com/niivue/fullstack-niivue-demo/).

Are you looking for the original FreeBrowse codebase?  That now lives on the
branch [`v1`](https://github.com/freesurfer/freebrowse/tree/v1).

## Examples:

Try out the 'serverless' version: [https://freesurfer.github.io/freebrowse/](https://freesurfer.github.io/freebrowse/)

- [A FreeSurfer segmentation overlayed on a t1-weighted anatomical MRI; from openneuro.org](https://freesurfer.github.io/freebrowse/?nvd=https://raw.githubusercontent.com/pwighton/freebrowse-test-data/refs/heads/main/openneuro/ds004731/sub-SM07.v9.nvd)
- [FreeSurfer surfaces overlayed on a t1-weighted anatomical MRI showing volume/surface intersections](https://freesurfer.github.io/freebrowse/?nvd=https://raw.githubusercontent.com/pwighton/freebrowse-test-data/main/freesurfer/surfaces/mgz-surf-eg.v9.nvd)
- [A FreeSurfer surface with a curvature overlay](https://freesurfer.github.io/freebrowse/?nvd=https://raw.githubusercontent.com/pwighton/freebrowse-test-data/refs/heads/main/freesurfer/surfaces/surf-overlay-eg.v9.nvd)
- [PET total volume of distribution (VT) overlaid on an MNI template](https://freesurfer.github.io/freebrowse/?nvd=https://raw.githubusercontent.com/pwighton/freebrowse-test-data/main/pet/petsurfer-bids/petsurfer-km.v9.nvd)
- [4D PET data](https://freesurfer.github.io/freebrowse/?nvd=https://raw.githubusercontent.com/pwighton/freebrowse-test-data/main/pet/4d-eg.v9.nvd)
  - This one may take some time to load.  NiiVue has optimizations for 4d data which have yet to be implemented

## Architecture

**Frontend:**
- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev) (build tool)
- [Tailwind CSS](https://tailwindcss.com) 4 + [Radix UI](https://www.radix-ui.com) components
- [NiiVue](https://github.com/niivue/niivue) (neuroimaging viewer)

**Backend:**
- [FastAPI](https://fastapi.tiangolo.com) (Python web framework)
- [Pixi](https://pixi.sh) (package manager)

## NiiVue documents (`.nvd`)

A FreeBrowse scene is a plain [NiiVue document](https://github.com/niivue/mono/blob/main/packages/niivue/src/NVDocument.ts)
(`NVDocumentData`, schema version 9).

The **Download** dialog writes it as JSON (text) or CBOR (binary);
loading detects the encoding, so either can be passed to `?nvd=`, dropped onto
the viewer, or embedded in a single-file build.

- **Downloaded documents are self-contained**: every volume's voxels are embedded
  (`volumes[i].data`), so the file stands alone. Meshes are embedded as geometry
  too, but mesh *overlays* (curvature, thickness) are not yet persisted — see
  [#43](https://github.com/freesurfer/freebrowse/issues/43).
- **Saved-to-backend documents are linked**: volumes are uploaded as `.nii.gz`
  and the document references them by URL. The one FreeBrowse-specific save
  behaviour is `retargetVolumeUrls` (`frontend/src/lib/nvd-volume-urls.ts`),
  which points each volume entry at the path it is being uploaded to; a volume
  given no destination keeps its bytes.
- **Loading changes only what the document sets.** FreeBrowse loads with
  niivue's `fill: "current"` policy, so a document that says nothing about,
  say, the crosshair colour or the view layout leaves the current viewer
  settings alone.

**Documents from FreeBrowse ≤ 2.4 (classic niivue) do not load** — the viewer
reports *"This .nvd predates the niivue document schema"*. Convert them once
with the stdlib-only migration script, which writes `<name>.v9.nvd` next to
each input (originals are never touched) and handles documents with embedded
volumes:

```bash
python3 scripts/migrate-nvd.py path/to/docs/        # directory, file or glob
python3 scripts/migrate-nvd.py scene.nvd --cbor     # binary output (needs cbor2)
```

`scripts/nvd-embed.py` embeds a document into a single-file build (see
[Build](#build)), and `python3 -m pytest` runs the script's tests.

## Driving FreeBrowse from your own code

FreeBrowse's UI is a *derived view* of its NiiVue instance: the React store is
updated only by the events niivue emits, and FreeBrowse's own controls go
through the same path as any external caller. The live instance is exposed as
`window.freebrowse.nv`, so from the browser console (or an embedding page) you
can drive the viewer with niivue's API and watch the sidebar, toolbar and footer
follow:

```js
const nv = window.freebrowse.nv;
await nv.addVolume({ url: "https://niivue.com/demos/images/mni152.nii.gz" });
await nv.setVolume(0, { colormap: "Hot", opacity: 0.8 });   // sidebar updates
nv.sliceType = 4;                                            // toolbar switches to Render
await nv.loadDocument(fileOrUrl);                            // document path, same events
```

**Supported mutations**: anything that emits an event: `setVolume(i, {...})`,
`setMesh(i, {...})`, `setMeshLayerProperty`, `add`/`remove`/`move` methods, the
flat setters (`sliceType`, `showRender`, `isRadiological`, `crosshairColor`,
`drawOpacity`, …), the drawing API and `loadDocument`.

**Not supported**: raw field writes such as `nv.volumes[0].colormap = "Hot"`.
Niivue-mono volumes and meshes are plain objects, so nothing observes the write
and the UI will not update.

## Install

### Pre-requisites

Requirements:
- [Node.js](https://nodejs.org) (for frontend environment)
- [npm](https://www.npmjs.com) (for frontend environment)
- [pixi](https://pixi.sh) (for backend environment)
- [git](https://git-scm.com/)

This should install all dependencies on an Ubuntu 24.04 system:

```
sudo apt update && sudo apt upgrade -y
sudo apt install nodejs npm git -y
curl -fsSL https://pixi.sh/install.sh | sh
```

Then clone the repo:

```
git clone git@github.com:freesurfer/freebrowse.git
```

If you want to use the example data, run `get-example-volumes.sh` in the `data/` folder:

```bash
cd freebrowse/data
./get-example-volumes.sh
```

If you want to perform AI assisted annotations, run `get-model-weights.sh` in the `models/` folder:

```bash
cd freebrowse/models
./get-model-weights.sh
```

### Frontend Setup

```bash
cd frontend
npm install
```

### Backend Setup

```bash
cd backend
pixi install
```

## Build

The frontend has several build targets:

### Serverless (static deployment)

Builds a fully serverless frontend (no backend required) that can be deployed to
any static file host:

```bash
cd frontend
npm run build:serverless
```

This creates a static build in `frontend/dist/`. You can set `VITE_BASE_PATH` to
control the base URL path (defaults to `/`).

### GitHub Pages

Builds the serverless version configured for GitHub Pages deployment:

```bash
cd frontend
npm run build:github
```

Output is in `frontend/dist-github/`.

### JupyterLab

Builds the serverless version configured for embedding inside JupyterLab:

```bash
cd frontend
npm run build:jupyter
```

Output is in `frontend/dist-jupyter/`. It also gets copied to `jupyter/jupyterlab_freebrowse/static/freebrowse/`. See the [Jupyter Integration](#jupyter-integration) for more information.

### Single HTML file

Builds a single standalone HTML file that can be distributed alongside output of
processing pipelines:

```bash
cd frontend
npm run build:singlefile
```

This creates a single standalone HTML file in `frontend/dist-singlefile/` that
is compatible with the `file://` protocol. Users can use this to view local
imaging data or self-contained NiiVue documents. The latest version of the
standalone HTML file is available at

`https://freesurfer.github.io/freebrowse/downloads/freebrowse-<version>.html`

Where `<version>` is the [current version of freebrowse](https://github.com/freesurfer/freebrowse/blob/main/frontend/package.json#L4)

The singlefile build is particularily useful with the python scripts in the
[`scripts`](https://github.com/freesurfer/freebrowse/tree/main/scripts) directory
to embed a niivue document and related imaging data directly into a the single
HTML file.  The resulting HTML file can be used to visualize the output of
processing pipelines, shared with collaborators and is offline compatible.  For
a real-world example, see the [petsurfer-bids](https://github.com/freesurfer/petsurfer-bids)
repository.

#### Older versions

The GitHub Pages site only ever hosts the **latest** single-file build (each
deploy replaces the whole site).

Every released version as of 2.4.7 is instead archived as a
[GitHub Release](https://github.com/freesurfer/freebrowse/releases) with its
standalone HTML attached as a release asset. This is the place to grab an older
build to test for regressions. To download a specific version:

```bash
# Direct download URL (replace the version):
# https://github.com/freesurfer/freebrowse/releases/download/v<version>/freebrowse-<version>.html

# Or with the GitHub CLI:
gh release download v2.4.7 --repo freesurfer/freebrowse --pattern 'freebrowse-*.html'
```

Then open the file directly (`file://`) or serve the containing folder locally:

```bash
python3 -m http.server
# then browse to http://localhost:8000/freebrowse-2.4.7.html
```

Releases are created automatically by the deploy workflow whenever the
`frontend/package.json` version is bumped on `main`.

### Full stack (with backend)

Builds the frontend for use with the FastAPI backend:

```bash
cd frontend
npm run build
```

### Deployment configurations

Some deployment settings are controlled at build time via Vite environment
variables. These are read-only at runtime.

| Variable | Values | Effect |
| --- | --- | --- |
| `VITE_DISABLE_DOWNLOAD` | `true` / unset | Disables the **Download** button and no-ops niivue's save-to-disk methods (`saveMesh`, `saveBitmap`, `saveDocument`, and `saveVolume` / `saveDrawing` whenever they are given a filename). In-memory exports (`saveVolume({filename: ""})`, `serializeDocument()`) keep working, so backend **Save**, AI sessions, save-drawing and edit-volume are unaffected. For deploying into secure environments where local data export should be turned off. |
| `VITE_SERVERLESS` | `true` / unset | Builds for the `file://` protocol with no backend (set automatically by `build:serverless`). Also disables the backend **Save** button. |
| `VITE_BASE_PATH` | e.g. `/freebrowse/` | Base URL path for routing/assets. |

`VITE_DISABLE_DOWNLOAD` composes with every build target. Just prepend it to
whichever build you run:

```bash
# Static / serverless
VITE_DISABLE_DOWNLOAD=true npm run build:serverless

# JupyterLab embed
VITE_DISABLE_DOWNLOAD=true npm run build:jupyter

# GitHub Pages
VITE_DISABLE_DOWNLOAD=true npm run build:github

# Single standalone HTML file
VITE_DISABLE_DOWNLOAD=true npm run build:singlefile

# Full stack (with backend)
VITE_DISABLE_DOWNLOAD=true npm run build
```

**Note:** While `VITE_DISABLE_DOWNLOAD` may stop well-intentioned users from
exporting data from a secure environment, it is *not* a guarantee against a
malicious user, who can still read pixels from the GPU or intercept data via t
he browser console.

## Dev

### Run the backend in development mode

This hot reloads the backend when changes are made to the code.

```bash
cd backend
pixi run dev
```

### Run the frontend in development mode

```bash
cd frontend
npm run dev
```

Then navigate to [http://localhost:5173/](http://localhost:5173/)

### Github Pages

To enable GitHub Pages:

1. Go to your repo on GitHub: Settings --> Pages
2. Under "Build and deployment", set Source to "GitHub Actions"
3. Push changes to main

You should then be able to view the 'serverless' version of your changes at https://{github-username.github.io/freebrowse/

## Production

## Build the frontend for production

```bash
cd frontend
npm run build
```

## Jupyter Integration

FreeBrowse can be used as a NIfTI file viewer inside JupyterLab or Jupyter
Notebook 7. Clicking a `.nii`, `.nii.gz` or `.nvd` (niivue document) file in the
file browser opens it in FreeBrowse in a new browser tab.

### Setup

Create and activate a conda environment with either JupyterLab or Notebook
7 and run `pip install -e .` from the `jupyter/` directory.

The file `jupyter/environment.yml` contains a sample maximal environment that
contains both JupyterLab, Jupyter Notebook and nodejs (for development) as well
as [ipyniivue](https://github.com/niivue/ipyniivue) to run niivue directly
inside of Jupyter notebooks.

```bash
cd ./jupyter
conda env create -f environment.yml
```

### Usage

Start JupyterLab or Notebook:

```bash
jupyter lab       # if using JupyterLab
jupyter notebook  # if using Notebook 7
```

Navigate to a directory containing `.nii`, `.nii.gz` or `.nvd` files, then either:
- **Double-click** a file to open it in FreeBrowse in a new browser tab
- **Right-click** a file and select **Open in FreeBrowse**

[ipyniivue](https://github.com/niivue/ipyniivue) is also installed in the example
`freebrowse-jupyter` environment.  See the [example notebooks repository](https://github.com/niivue/jupyter-notebooks)
for examples on how to use niivue directly inside jupyter

### Development

The FreeBrowse bundle served inside JupyterLab
(`jupyter/jupyterlab_freebrowse/static/freebrowse/`) is a build output and is
**not committed**: a fresh checkout has to generate it before installing the
extension, and any frontend change needs it regenerated before it becomes
visible in notebooks. (The server extension logs a warning at startup if the
bundle is missing.)

```bash
cd frontend
npm run build:jupyter
```

To embed FreeBrowse in a secure environment where data export is disabled, set
`VITE_DISABLE_DOWNLOAD=true` for the build (see
[Deployment configuration](#deployment-configurations)):

```bash
cd frontend
VITE_DISABLE_DOWNLOAD=true npm run build:jupyter
```

To re-install the JupyterLab extensions:

```bash
cd jupyter
jlpm install
jlpm build
pip install -e .
```

## Acknowledgements

FreeBrowse was generously funded by
[Gates Ventures](https://en.wikipedia.org/wiki/Gates_Ventures).  The [original
implementation](https://github.com/freesurfer/freebrowse/tree/v1) was performed
by [zuehlke](https://www.zuehlke.com).

Version 2 is based off of the
[niivue fullstack demo](https://github.com/niivue/fullstack-niivue-demo/) which
was developed during a
[Google Summer of Code Project](https://summerofcode.withgoogle.com/programs/2025/projects/h9cDmi0E)
in close collaboration with the [niivue](https://niivue.com) team.
