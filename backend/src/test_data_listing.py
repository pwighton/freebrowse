from data_listing import list_data_files

DEFAULT_PATTERNS = ["*.nii", "*.nii.gz", "*.zarr"]


def make_tree(root, paths):
    for path in paths:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"")


def test_lists_files_recursively_sorted_by_url(tmp_path):
    make_tree(tmp_path, ["b/brain.nii.gz", "a.nii", "b/notes.txt", "scene.nvd"])
    assert list_data_files(tmp_path, DEFAULT_PATTERNS) == [
        {"filename": "a.nii", "url": "data/a.nii"},
        {"filename": "b/brain.nii.gz", "url": "data/b/brain.nii.gz"},
    ]


def test_zarr_store_is_one_entry_and_is_not_descended_into(tmp_path):
    make_tree(
        tmp_path,
        [
            "micr/stain.ome.zarr/.zattrs",
            "micr/stain.ome.zarr/0/0/0/0",
            "micr/stain.ome.zarr/derived/mask.nii.gz",
            "micr/stain.ome.zarr/nested.zarr/.zgroup",
            "micr/other.nii.gz",
        ],
    )
    assert list_data_files(tmp_path, DEFAULT_PATTERNS) == [
        {"filename": "micr/other.nii.gz", "url": "data/micr/other.nii.gz"},
        {
            "filename": "micr/stain.ome.zarr",
            "url": "data/micr/stain.ome.zarr",
            "zarr": True,
        },
    ]


def test_store_suffix_is_case_insensitive(tmp_path):
    make_tree(tmp_path, ["A.ZARR/.zgroup"])
    assert list_data_files(tmp_path, ["*.zarr", "*.ZARR"]) == [
        {"filename": "A.ZARR", "url": "data/A.ZARR", "zarr": True},
    ]


def test_stores_are_skipped_even_when_not_listed(tmp_path):
    """Without a zarr pattern a store is neither listed nor walked."""
    make_tree(tmp_path, ["s.zarr/inside.nii.gz", "s.zarr/scene.nvd", "top.nvd"])
    assert list_data_files(tmp_path, ["*.nii.gz"]) == []
    assert list_data_files(tmp_path, ["*.nvd"]) == [
        {"filename": "top.nvd", "url": "data/top.nvd"},
    ]


def test_a_file_named_like_a_store_is_an_ordinary_match(tmp_path):
    make_tree(tmp_path, ["archive.zarr"])
    assert list_data_files(tmp_path, DEFAULT_PATTERNS) == [
        {"filename": "archive.zarr", "url": "data/archive.zarr"},
    ]


def test_missing_directory_lists_nothing(tmp_path):
    assert list_data_files(tmp_path / "absent", DEFAULT_PATTERNS) == []
