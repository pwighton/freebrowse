"""pytest for migrate_nvd_embedded.py and the scene carry-over in migrate-nvd.py.

Run:  python3 -m pytest scripts/

Fixtures are tiny synthetic NIfTI-1 files built in memory, so nothing here
depends on the 45 MB documents in 20260914-freebrowse-embedded-nvd/.
"""

from __future__ import annotations

import base64
import gzip
import importlib.util
import json
import math
import os
import struct
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod  # so `import migrate_nvd_embedded` inside the script resolves
    spec.loader.exec_module(mod)
    return mod


migrate_nvd = _load("migrate_nvd", "migrate-nvd.py")
embedded = _load("migrate_nvd_embedded", "migrate_nvd_embedded.py")

HDR_KEYS = [
    "littleEndian", "dim_info", "dims", "pixDims", "intent_p1", "intent_p2",
    "intent_p3", "intent_code", "datatypeCode", "numBitsPerVoxel", "slice_start",
    "vox_offset", "scl_slope", "scl_inter", "slice_end", "slice_code",
    "xyzt_units", "cal_max", "cal_min", "slice_duration", "toffset",
    "description", "aux_file", "qform_code", "sform_code", "quatern_b",
    "quatern_c", "quatern_d", "qoffset_x", "qoffset_y", "qoffset_z", "affine",
    "intent_name", "magic",
]

DIMS = (4, 3, 2)
SROW = [[2.0, 0.0, 0.0, -10.0], [0.0, 3.0, 0.0, -20.0], [0.0, 0.0, 4.0, -30.0]]


def make_nifti(
    *,
    little=True,
    datatype=2,
    sform_code=1,
    qform_code=0,
    quatern=(0.0, 0.0, 0.0),
    qoffset=(0.0, 0.0, 0.0),
    pixdim=(1.0, 2.0, 3.0, 4.0),
    voxels=None,
    scl_slope=float("nan"),
    description="synthetic",
):
    e = "<" if little else ">"
    bitpix = {2: 8, 4: 16, 16: 32}[datatype]
    nvox = DIMS[0] * DIMS[1] * DIMS[2]
    if voxels is None:
        voxels = list(range(nvox))
    fmt = {2: "B", 4: "h", 16: "f"}[datatype]
    img = struct.pack(e + f"{nvox}{fmt}", *voxels)

    h = bytearray(348)
    struct.pack_into(e + "i", h, 0, 348)
    h[39] = 0
    struct.pack_into(e + "8h", h, 40, 3, *DIMS, 1, 1, 1, 1)
    struct.pack_into(e + "3f", h, 56, 0.0, 0.0, 0.0)
    struct.pack_into(e + "h", h, 68, 0)
    struct.pack_into(e + "h", h, 70, datatype)
    struct.pack_into(e + "h", h, 72, bitpix)
    struct.pack_into(e + "8f", h, 76, *pixdim, 1.0, 0.0, 0.0, 0.0)
    struct.pack_into(e + "f", h, 108, 352.0)
    struct.pack_into(e + "f", h, 112, scl_slope)
    struct.pack_into(e + "f", h, 116, 0.0)
    h[123] = 10  # xyzt_units mm + sec
    struct.pack_into(e + "f", h, 124, 0.0)
    struct.pack_into(e + "f", h, 128, 0.0)
    h[148 : 148 + len(description)] = description.encode()
    struct.pack_into(e + "h", h, 252, qform_code)
    struct.pack_into(e + "h", h, 254, sform_code)
    struct.pack_into(e + "3f", h, 256, *quatern)
    struct.pack_into(e + "3f", h, 268, *qoffset)
    for r in range(3):
        struct.pack_into(e + "4f", h, 280 + 16 * r, *SROW[r])
    h[344:348] = b"n+1\x00"
    return bytes(h) + bytes(4) + img, voxels


def legacy_doc(blob, name="orig.nii", **extra):
    opt = {
        "name": name,
        "url": "",
        "imageType": 1,
        "colormap": "freesurfer",
        "opacity": 0.7,
        "cal_min": 0,
        "cal_max": 255,
    }
    doc = {
        "title": "t",
        "imageOptionsArray": [opt],
        "encodedImageBlobs": [base64.b64encode(blob).decode()],
        "encodedDrawingBlob": "",
        "meshesString": "",
        "previewImageDataURL": "",
        "sceneData": {
            "azimuth": 42,
            "elevation": -7,
            "gamma": 1.5,
            "volScaleMultiplier": 2.5,
            "crosshairPos": [0.1, 0.2, 0.3],
            "pan2Dxyzmm": [1, 2, 3, 4],
            "clipPlanes": [[0, 0, 0, 0]],
        },
    }
    doc.update(extra)
    return doc


# --- parse_nifti1 --------------------------------------------------------------


def test_header_keys_match_extractHeaderData_exactly():
    blob, _ = make_nifti()
    out = embedded.parse_nifti1(blob)
    assert list(out["hdr"].keys()) == HDR_KEYS
    assert set(out) == {"hdr", "img", "datatypeCode"}


def test_little_endian_uint8_roundtrip():
    blob, voxels = make_nifti()
    out = embedded.parse_nifti1(blob)
    hdr = out["hdr"]
    assert hdr["dims"] == [3, 4, 3, 2, 1, 1, 1, 1]
    assert hdr["pixDims"][:4] == [1.0, 2.0, 3.0, 4.0]
    assert hdr["datatypeCode"] == 2 and hdr["numBitsPerVoxel"] == 8
    assert hdr["vox_offset"] == 352.0
    assert hdr["magic"] == "n+1"
    assert hdr["description"] == "synthetic"
    assert hdr["xyzt_units"] == 10
    assert hdr["littleEndian"] is True
    assert out["img"] == bytes(voxels)
    assert out["datatypeCode"] == 2


def test_sform_affine_is_the_srow_rows():
    blob, _ = make_nifti(sform_code=1)
    aff = embedded.parse_nifti1(blob)["hdr"]["affine"]
    assert aff[:3] == SROW
    assert aff[3] == [0.0, 0.0, 0.0, 1.0]


def test_qform_only_affine_uses_quaternion_method():
    # b=c=0, d=1 -> 180 degrees about z: R = diag(-1, -1, 1)
    blob, _ = make_nifti(sform_code=0, qform_code=1, quatern=(0.0, 0.0, 1.0),
                         qoffset=(5.0, 6.0, 7.0), pixdim=(1.0, 2.0, 3.0, 4.0))
    aff = embedded.parse_nifti1(blob)["hdr"]["affine"]
    assert [round(x, 6) for x in aff[0]] == [-2.0, 0.0, 0.0, 5.0]
    assert [round(x, 6) for x in aff[1]] == [0.0, -3.0, 0.0, 6.0]
    assert [round(x, 6) for x in aff[2]] == [0.0, 0.0, 4.0, 7.0]


def test_qform_wins_over_lower_sform_code():
    blob, _ = make_nifti(sform_code=1, qform_code=2, quatern=(0.0, 0.0, 0.0))
    aff = embedded.parse_nifti1(blob)["hdr"]["affine"]
    assert aff[0][:3] == [2.0, 0.0, 0.0]  # identity rotation * pixdim, not SROW


def test_no_form_codes_gives_pixdim_diagonal():
    blob, _ = make_nifti(sform_code=0, qform_code=0)
    aff = embedded.parse_nifti1(blob)["hdr"]["affine"]
    assert aff == [[2.0, 0, 0, 0], [0, 3.0, 0, 0], [0, 0, 4.0, 0], [0, 0, 0, 1.0]]


def test_big_endian_int16_is_swapped_to_native():
    voxels = [-3, 7, 300] * 8
    blob, _ = make_nifti(little=False, datatype=4, voxels=voxels)
    out = embedded.parse_nifti1(blob)
    assert out["hdr"]["littleEndian"] is True
    assert out["hdr"]["datatypeCode"] == 4
    assert struct.unpack("<24h", out["img"]) == tuple(voxels)
    assert out["hdr"]["affine"][:3] == SROW


def test_non_finite_header_floats_become_zero():
    blob, _ = make_nifti(scl_slope=float("nan"))
    hdr = embedded.parse_nifti1(blob)["hdr"]
    assert hdr["scl_slope"] == 0.0
    assert all(math.isfinite(v) for v in (hdr["scl_slope"], hdr["scl_inter"], hdr["toffset"]))


def test_gzip_wrapped_blob_decodes():
    blob, voxels = make_nifti()
    b64 = base64.b64encode(gzip.compress(blob)).decode()
    out = embedded.parse_nifti1(embedded.decode_blob(b64))
    assert out["img"] == bytes(voxels)


def test_bad_magic_is_rejected():
    blob, _ = make_nifti()
    bad = bytearray(blob)
    bad[344:348] = b"xyz\x00"
    with pytest.raises(ValueError, match="magic"):
        embedded.parse_nifti1(bytes(bad))


def test_not_nifti_is_rejected():
    with pytest.raises(ValueError, match="sizeof_hdr"):
        embedded.parse_nifti1(b"\x00" * 400)


def test_truncated_payload_is_rejected():
    blob, _ = make_nifti()
    with pytest.raises(ValueError, match="voxel payload"):
        embedded.parse_nifti1(blob[:-5])


# --- document-level ------------------------------------------------------------


def test_embedded_document_dispatch_and_shape():
    blob, voxels = make_nifti()
    doc = legacy_doc(blob)
    assert migrate_nvd.is_embedded_document(doc)
    out = migrate_nvd.migrate_document(doc, doc_stem="eg")
    assert out["version"] == migrate_nvd.DOCUMENT_VERSION
    assert len(out["volumes"]) == 1
    vol = out["volumes"][0]
    assert "url" not in vol
    assert vol["name"] == "orig.nii"
    assert vol["colormap"] == "Freesurfer"
    assert vol["opacity"] == 0.7
    assert vol["calMin"] == 0 and vol["calMax"] == 255
    assert vol["data"]["img"] == bytes(voxels)
    assert vol["data"]["datatypeCode"] == 2
    assert out["meshes"] == []


def test_scene_is_carried_over_from_sceneData():
    blob, _ = make_nifti()
    out = migrate_nvd.migrate_document(legacy_doc(blob), doc_stem="eg")
    scene = out["scene"]
    assert scene["azimuth"] == 42 and scene["elevation"] == -7
    assert scene["gamma"] == 1.5 and scene["scaleMultiplier"] == 2.5
    assert scene["crosshairPos"] == [0.1, 0.2, 0.3]
    assert scene["pan2Dxyzmm"] == [1, 2, 3, 4]
    assert "clipPlanes" not in scene  # not a v9 scene field
    assert scene["backgroundColor"] == [0, 0, 0, 1]  # default kept


def test_transform_scene_defaults_and_non_finite():
    d = migrate_nvd.transform_scene(None)
    assert d == migrate_nvd._scene_defaults()
    s = migrate_nvd.transform_scene({"azimuth": "nan", "crosshairPos": [0.5, "inf", 0.5]})
    assert s["azimuth"] == 110  # non-finite dropped -> default
    assert s["crosshairPos"] == [0.5, 0.5, 0.5]  # malformed -> default


def test_vectors_serialized_as_objects_are_accepted():
    # Old niivue JSON.stringify'd Float32Array vectors into {"0":..,"1":..}.
    s = migrate_nvd.transform_scene({
        "crosshairPos": {"0": 0.5, "1": 0.4372, "2": 0.4193},
        "pan2Dxyzmm": {"0": 1, "1": 2, "2": 3, "3": 4},
    })
    assert s["crosshairPos"] == [0.5, 0.4372, 0.4193]
    assert s["pan2Dxyzmm"] == [1, 2, 3, 4]
    assert migrate_nvd.transform_scene({"crosshairPos": {"0": 1, "2": 3}})["crosshairPos"] == [0.5, 0.5, 0.5]


def test_url_document_also_carries_scene():
    doc = {"imageOptionsArray": [{"url": "https://x/y.nii.gz", "name": "y.nii.gz"}],
           "sceneData": {"crosshairPos": [0.9, 0.8, 0.7]}}
    out = migrate_nvd.migrate_document(doc)
    assert out["scene"]["crosshairPos"] == [0.9, 0.8, 0.7]
    assert out["volumes"][0]["url"] == "https://x/y.nii.gz"


def test_json_output_tags_bytes_and_has_no_non_finite_text():
    blob, voxels = make_nifti()
    out = migrate_nvd.migrate_document(legacy_doc(blob), doc_stem="eg")
    tagged = migrate_nvd.to_json_safe(out)
    text = json.dumps(tagged, allow_nan=False)
    img = tagged["volumes"][0]["data"]["img"]
    assert img["$ta"] == "Uint8Array"
    assert base64.b64decode(img["b64"]) == bytes(voxels)
    assert "NaN" not in text and "Infinity" not in text
    # hdr is plain JSON (no tags), as extractHeaderData writes it
    assert tagged["volumes"][0]["data"]["hdr"]["dims"] == [3, 4, 3, 2, 1, 1, 1, 1]


def test_blobless_entry_with_url_stays_linked_and_without_is_dropped(capsys):
    blob, _ = make_nifti()
    doc = legacy_doc(blob)
    doc["imageOptionsArray"].append({"name": "linked.nii.gz", "url": "https://x/l.nii.gz"})
    doc["imageOptionsArray"].append({"name": "orphan.nii", "url": ""})
    doc["encodedImageBlobs"] += ["", ""]
    out = migrate_nvd.migrate_document(doc, doc_stem="eg")
    assert [v.get("url") for v in out["volumes"]] == [None, "https://x/l.nii.gz"]
    assert "orphan.nii" in capsys.readouterr().err


def test_drawing_blob_and_mesh_payload_warn_but_do_not_fail(capsys):
    blob, _ = make_nifti()
    doc = legacy_doc(blob, encodedDrawingBlob="AAAA",
                     meshesString=json.dumps([{"url": "https://x/lh.pial"}]))
    out = migrate_nvd.migrate_document(doc, doc_stem="eg")
    err = capsys.readouterr().err
    assert len(out["volumes"]) == 1
    assert "drawing" in err and "freebrowse#43" in err


def test_assets_dir_is_ignored_with_warning(capsys):
    blob, _ = make_nifti()
    out = migrate_nvd.migrate_document(legacy_doc(blob), assets_dir="/tmp/x", doc_stem="eg")
    assert "data" in out["volumes"][0]
    assert "assets-dir is ignored" in capsys.readouterr().err


# --- output naming -------------------------------------------------------------


def test_default_output_is_tagged_with_target_version():
    v = migrate_nvd.DOCUMENT_VERSION
    assert migrate_nvd._output_path("/a/b/scene.nvd", None, False) == f"/a/b/scene.v{v}.nvd"
    assert migrate_nvd._output_path("/a/b/scene.nvd", None, True) == f"/a/b/scene.v{v}.nvd"


def test_outdir_output_keeps_the_stem(tmp_path):
    out = migrate_nvd._output_path("/a/b/scene.nvd", str(tmp_path), False)
    assert out == str(tmp_path / "scene.nvd")
