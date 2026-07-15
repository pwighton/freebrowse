#!/usr/bin/env python3
"""Migrate legacy FreeBrowse .nvd documents to niivue-mono's NVDocumentData v8.

Old FreeBrowse `.nvd` files are JSON with a flat, FreeBrowse-specific shape
(`imageOptionsArray`, `meshes`, optionally embedded `encodedImageBlobs` /
`meshesString` / `encodedDrawingBlob`). niivue-mono uses a completely different
document schema (`scene` / `layout` / `volumes` / `meshes` / ...), normally
CBOR-encoded. FreeBrowse loads it as JSON via a lossless tagged encoding
(see `frontend/src/lib/nvd-json.ts`); this script emits that same JSON so the
migrated document loads straight into the current app. With `--cbor` it instead
emits the binary CBOR form that vanilla niivue-mono / ipyniivue read natively.

Design goals (locked with Paul):
  * The URL-referencing path (the vast majority of legacy docs) uses ONLY the
    Python standard library, so it runs on a bare interpreter with no pip
    installs.
  * `--cbor` output lazily imports the optional `cbor2` package.
  * Embedded / full-export docs are handled by `migrate_nvd_embedded` (see the
    companion module split at 5d); they still emit stdlib-only JSON.

JSON tag convention (mirror of `toJsonSafe`/`fromJsonSafe` in nvd-json.ts):
  * bytes            -> {"$nvd": "ta",  "type": "Uint8Array"|..., "b64": "..."}
  * non-finite float -> {"$nvd": "num", "v": "NaN"|"Infinity"|"-Infinity"}
Untagged finite values are emitted as-is (FreeBrowse's reviver passes them
through unchanged). URL-only docs contain no bytes and rarely any non-finite
number, so their JSON is usually plain — but we always run the tag walk so the
skeleton's `mesh.thicknessOn2D = Infinity` (and any embedded 5d data) round-trips
losslessly.

Usage:
    migrate-nvd.py INPUT [INPUT ...] [-o OUTDIR] [--cbor] [--assets-dir DIR] [-v]

INPUT may be a file, a directory (recursed for *.nvd), or a glob.
"""

from __future__ import annotations

import argparse
import base64
import glob as globmod
import json
import math
import os
import sys
from datetime import datetime, timezone

DOCUMENT_VERSION = 8

# --- mesh shader index (old niivue) -> shaderType name (niivue-mono) ----------
# Old order: createDefaultMeshShaders() in niivue/.../ShaderManager.ts.
# New names: fragmentShaders keys in niivue-mono/.../gl/meshShader.ts (minus
# vertexColor). Old shaders with no niivue-mono equivalent fall back to 'phong'
# (the view layer would do the same on an unknown name; we emit a clean name).
SHADER_INDEX_TO_NAME = {
    0: "phong",
    1: "matte",
    4: "crevice",
    7: "outline",
    9: "toon",
    10: "flat",
    12: "rim",
    13: "silhouette",
    14: "crosscut",
}
# Known old indices with no direct equivalent (Harmonic/Hemispheric/Edge/
# Diffuse/Specular/Matcap) -> phong, but warn so the drift is visible.
_SHADER_FALLBACK = "phong"


def _warn(msg: str) -> None:
    print(f"migrate-nvd: warning: {msg}", file=sys.stderr)


def shader_name(index) -> str:
    """Map an old meshShaderIndex (int, or None/absent) to a shaderType name."""
    if index is None:
        return _SHADER_FALLBACK
    name = SHADER_INDEX_TO_NAME.get(index)
    if name is None:
        _warn(
            f"meshShaderIndex {index!r} has no niivue-mono equivalent; "
            f"using {_SHADER_FALLBACK!r}"
        )
        return _SHADER_FALLBACK
    return name


def _num(value):
    """Coerce a legacy numeric field to a float.

    Old niivue serialized non-finite numbers as the strings 'NaN' / 'infinity' /
    '-infinity' (see encodeNumberForJSON). Normalize those to Python floats so
    the tag walk can re-tag them. Leaves genuine numbers untouched; returns other
    values unchanged.
    """
    if isinstance(value, str):
        s = value.strip().lower()
        if s == "nan":
            return float("nan")
        if s in ("infinity", "inf", "+infinity", "+inf"):
            return float("inf")
        if s in ("-infinity", "-inf"):
            return float("-inf")
        try:
            return float(value)
        except ValueError:
            return value
    return value


# --- JSON tag walk (mirror of toJsonSafe in nvd-json.ts) ----------------------
def to_json_safe(value):
    """Return a JSON-safe copy: bytes and non-finite floats become tagged dicts."""
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {
            "$nvd": "ta",
            "type": "Uint8Array",
            "b64": base64.b64encode(bytes(value)).decode("ascii"),
        }
    if isinstance(value, float) and not math.isfinite(value):
        if math.isnan(value):
            v = "NaN"
        elif value > 0:
            v = "Infinity"
        else:
            v = "-Infinity"
        return {"$nvd": "num", "v": v}
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if v is None:
                # Drop null the way JSON.stringify drops undefined, keeping the
                # tree canonical. (Legacy fields we don't set are simply absent.)
                continue
            out[k] = to_json_safe(v)
        return out
    if isinstance(value, (list, tuple)):
        return [to_json_safe(v) for v in value]
    return value


# --- v8 skeleton (defaults sourced from niivue-mono/.../NVConstants.ts) --------
# These mirror LAYOUT/UI/VOLUME/MESH/DRAW/INTERACTION_DEFAULTS and the model
# scene defaults. Included so the migrated document is self-descriptive and
# round-trips identically to an app-saved one; niivue-mono would otherwise fill
# the same values from its own defaults on load.
def _scene_defaults():
    return {
        "azimuth": 110,
        "elevation": 10,
        "scaleMultiplier": 1.0,
        "gamma": 1.0,
        "crosshairPos": [0.5, 0.5, 0.5],
        "pan2Dxyzmm": [0, 0, 0, 1],
        "backgroundColor": [0, 0, 0, 1],
        "clipPlaneColor": [0.7, 0, 0.7, 0.4],
        "isClipPlaneCutaway": False,
    }


def new_document_skeleton(created: str | None = None):
    """A minimal, valid, empty NVDocumentData v8 (no volumes/meshes yet).

    Only the fields niivue-mono's `deserialize` / `applyDocumentToModel` actually
    require are emitted, keeping migrated docs close to the terse originals:
      * `version`     — validated (must be a number <= 8).
      * `scene`       — required, and every field is read individually (the color
                        arrays are spread), so it must be COMPLETE.
      * `layout`      — required only to be present/truthy; applied via
                        `Object.assign`, so `{}` keeps the model's own defaults.
      * `clipPlanes`  — iterated (`doc.clipPlanes.length`), so must exist.
      * `volumes` / `meshes` — iterated by loadDocument, so must be arrays.
    The `ui` / `volume` / `mesh` / `draw` / `interaction` groups are applied via
    `Object.assign(model.X, doc.X)`, which ignores a missing source — so we omit
    them entirely and the viewer falls back to its built-in defaults (identical
    result, far smaller file). `created` is not read by niivue but is cheap,
    conventional provenance, so we keep it.
    """
    return {
        "version": DOCUMENT_VERSION,
        "created": created or datetime.now(timezone.utc).isoformat(),
        "scene": _scene_defaults(),
        "layout": {},
        "clipPlanes": [],
        "volumes": [],
        "meshes": [],
    }


# --- URL-referencing transform ------------------------------------------------
def transform_volume(old: dict) -> dict:
    """imageOptionsArray[] entry -> NVDocumentVolume (URL-referenced)."""
    vol: dict = {}
    if old.get("url"):
        vol["url"] = old["url"]
    if old.get("name"):
        vol["name"] = old["name"]
    if old.get("colormap"):
        vol["colormap"] = old["colormap"]
    if old.get("colormapNegative"):
        vol["colormapNegative"] = old["colormapNegative"]
    # niivue-mono volumes have no `visible` flag; hide via opacity 0 (mirrors the
    # mesh visibility-via-opacity convention).
    opacity = _num(old.get("opacity", 1.0))
    if old.get("visible") is False:
        opacity = 0.0
    vol["opacity"] = opacity
    if "cal_min" in old:
        vol["calMin"] = _num(old["cal_min"])
    if "cal_max" in old:
        vol["calMax"] = _num(old["cal_max"])
    if "cal_minNeg" in old:
        vol["calMinNeg"] = _num(old["cal_minNeg"])
    if "cal_maxNeg" in old:
        vol["calMaxNeg"] = _num(old["cal_maxNeg"])
    return vol


def transform_layer(old: dict) -> dict:
    """meshes[].layers[] entry -> NVDocumentMeshLayer (URL-referenced)."""
    layer: dict = {}
    if old.get("url"):
        layer["url"] = old["url"]
    if old.get("name"):
        layer["name"] = old["name"]
    if old.get("colormap"):
        layer["colormap"] = old["colormap"]
    if "cal_min" in old:
        layer["calMin"] = _num(old["cal_min"])
    if "cal_max" in old:
        layer["calMax"] = _num(old["cal_max"])
    if "opacity" in old:
        layer["opacity"] = _num(old["opacity"])
    # Old boolean flag -> a negative colormap name. FreeBrowse used 'winter'.
    if old.get("useNegativeCmap"):
        layer["colormapNegative"] = "winter"
    return layer


def transform_mesh(old: dict) -> dict:
    """meshes[] entry -> NVDocumentMesh (URL-referenced)."""
    mesh: dict = {}
    if old.get("url"):
        mesh["url"] = old["url"]
    if old.get("name"):
        mesh["name"] = old["name"]
    if "opacity" in old:
        mesh["opacity"] = _num(old["opacity"])
    rgba = old.get("rgba255")
    if rgba:
        mesh["color"] = [c / 255 for c in rgba]
    mesh["shaderType"] = shader_name(old.get("meshShaderIndex"))
    layers = old.get("layers")
    if layers:
        mesh["layers"] = [transform_layer(l) for l in layers]
    return mesh


def is_embedded_document(doc: dict) -> bool:
    """True if the doc carries embedded binary payloads (full-export shape)."""
    return any(
        k in doc for k in ("encodedImageBlobs", "meshesString", "encodedDrawingBlob")
    )


def migrate_url_document(doc: dict, *, created: str | None = None) -> dict:
    """Transform a URL-referencing legacy doc into NVDocumentData v8 (untagged)."""
    out = new_document_skeleton(created=created)
    out["volumes"] = [transform_volume(v) for v in doc.get("imageOptionsArray", [])]
    out["meshes"] = [transform_mesh(m) for m in doc.get("meshes", [])]
    if doc.get("opts"):
        # The handful of {imageOptionsArray, opts, title} docs. Mapping old flat
        # opts onto the new config groups is best-effort and none of the required
        # surface docs need it; drop with a warning (model defaults apply).
        _warn(
            "legacy 'opts' block dropped (not mapped to niivue-mono config "
            "groups); viewer defaults will apply"
        )
    return out


def migrate_document(doc: dict, *, created: str | None = None, assets_dir=None,
                     doc_stem: str = "doc") -> dict:
    """Dispatch a legacy doc (URL or embedded) to NVDocumentData v8 (untagged)."""
    if is_embedded_document(doc):
        # Implemented in 5d (embedded/full-export path).
        try:
            from importlib import import_module

            embedded = import_module("migrate_nvd_embedded")
        except ImportError:
            raise NotImplementedError(
                "embedded/full-export .nvd migration is not implemented yet (5d)"
            )
        return embedded.migrate_embedded_document(
            doc, created=created, assets_dir=assets_dir, doc_stem=doc_stem
        )
    return migrate_url_document(doc, created=created)


# --- output -------------------------------------------------------------------
def write_json(doc_v8: dict, out_path: str) -> None:
    """Write the tagged JSON form (loadable by FreeBrowse)."""
    tagged = to_json_safe(doc_v8)
    with open(out_path, "w") as f:
        json.dump(tagged, f, indent=2, allow_nan=False)


def write_cbor(doc_v8: dict, out_path: str) -> None:
    """Write the binary CBOR form (loadable by vanilla niivue-mono / ipyniivue)."""
    try:
        import cbor2  # optional dependency, only needed for --cbor
    except ImportError:
        raise SystemExit(
            "migrate-nvd: --cbor requires the 'cbor2' package (pip install cbor2)"
        )
    # cbor2 encodes NaN/Infinity and byte strings natively, wire-compatible with
    # niivue-mono's cbor-x decoder.
    with open(out_path, "wb") as f:
        f.write(cbor2.dumps(doc_v8))


# --- CLI ----------------------------------------------------------------------
def _collect_inputs(inputs):
    """Expand files, directories (recursive *.nvd), and globs into a file list."""
    files = []
    for item in inputs:
        if os.path.isdir(item):
            for root, _dirs, names in os.walk(item):
                for name in names:
                    if name.lower().endswith(".nvd"):
                        files.append(os.path.join(root, name))
        elif os.path.isfile(item):
            files.append(item)
        else:
            expanded = globmod.glob(item, recursive=True)
            if not expanded:
                _warn(f"no such file/dir/glob: {item}")
            files.extend(expanded)
    return files


def _output_path(in_path, outdir, as_cbor):
    stem = os.path.splitext(os.path.basename(in_path))[0]
    if outdir:
        os.makedirs(outdir, exist_ok=True)
        return os.path.join(outdir, stem + ".nvd")
    # Non-destructive default: alongside the input with a .migrated marker.
    d = os.path.dirname(in_path)
    return os.path.join(d, stem + ".migrated.nvd")


def main(argv=None):
    p = argparse.ArgumentParser(description="Migrate legacy FreeBrowse .nvd -> niivue-mono v8")
    p.add_argument("inputs", nargs="+", help="file(s), dir(s) (recursed), or glob(s)")
    p.add_argument("-o", "--outdir", help="write outputs here (default: alongside input, .migrated.nvd)")
    p.add_argument("--cbor", action="store_true", help="emit binary CBOR instead of JSON (needs cbor2)")
    p.add_argument("--assets-dir", help="where to write exploded volume sidecars for embedded docs (5d)")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    files = _collect_inputs(args.inputs)
    if not files:
        _warn("no input files")
        return 1

    errors = 0
    for in_path in files:
        try:
            with open(in_path) as f:
                doc = json.load(f)
            stem = os.path.splitext(os.path.basename(in_path))[0]
            doc_v8 = migrate_document(
                doc, assets_dir=args.assets_dir, doc_stem=stem
            )
            out_path = _output_path(in_path, args.outdir, args.cbor)
            if args.cbor:
                write_cbor(doc_v8, out_path)
            else:
                write_json(doc_v8, out_path)
            if args.verbose:
                nv = len(doc_v8.get("volumes", []))
                nm = len(doc_v8.get("meshes", []))
                print(f"{in_path} -> {out_path}  ({nv} volumes, {nm} meshes)")
        except NotImplementedError as e:
            _warn(f"{in_path}: {e}")
            errors += 1
        except Exception as e:  # noqa: BLE001 - report and continue the batch
            _warn(f"{in_path}: {e}")
            errors += 1

    if errors:
        _warn(f"{errors} file(s) failed")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
