"""Recursive listings of the data directory for the `/data/nvd` and `/data/vol` endpoints.

Stdlib only, so it can be tested without the server's dependencies.
"""
import os
from fnmatch import fnmatch
from pathlib import Path
from typing import Iterable, Union


def _is_zarr_store(name: str) -> bool:
    return name.lower().endswith(".zarr")


def list_data_files(data_dir: Union[str, Path], patterns: Iterable[str]) -> list:
    """List entries under `data_dir` whose name matches any of `patterns`.

    A zarr store is a directory (`brain.ome.zarr/`) holding thousands of chunk
    files. One whose name matches a pattern is listed as a single entry, flagged
    `"zarr": True`, and no store is ever descended into: its chunks are not
    volumes, and walking them makes the listing slow.

    Returns `[{"filename": <path relative to data_dir>, "url": "data/<same>"}]`
    with POSIX separators, sorted by url.
    """
    root = Path(data_dir)
    patterns = list(patterns)

    def matches(name: str) -> bool:
        return any(fnmatch(name, pattern) for pattern in patterns)

    entries = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root)
        stores = [d for d in dirnames if _is_zarr_store(d)]
        # Prune in place so os.walk skips the stores.
        dirnames[:] = [d for d in dirnames if not _is_zarr_store(d)]
        for name in stores:
            if matches(name):
                rel = (rel_dir / name).as_posix()
                entries.append({"filename": rel, "url": "data/" + rel, "zarr": True})
        for name in filenames:
            if matches(name):
                rel = (rel_dir / name).as_posix()
                entries.append({"filename": rel, "url": "data/" + rel})
    return sorted(entries, key=lambda entry: entry["url"])
