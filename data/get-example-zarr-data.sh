#!/bin/bash
# Download example OME-Zarr stores from DANDI 001278 (LINC human data, CC-BY-4.0).
#
# A zarr store is a directory of many small files, so there is no single URL to
# fetch: list the store's files through the bucket's public listing, then fetch
# each one.
set -euo pipefail

BUCKET=https://dandiarchive.s3.amazonaws.com

# get_zarr <zarr-id> <destination-directory>
get_zarr() {
  local id=$1 dest=$2 prefix="zarr/$1/" token="" page key
  mkdir -p "$dest"
  while :; do
    page=$(wget -qO- "$BUCKET/?list-type=2&prefix=$prefix${token:+&continuation-token=$token}")
    for key in $(grep -o '<Key>[^<]*</Key>' <<<"$page" | sed 's/<[^>]*>//g'); do
      mkdir -p "$dest/$(dirname "${key#"$prefix"}")"
      wget -q -nc "$BUCKET/$key" -O "$dest/${key#"$prefix"}" || true
    done
    # The listing returns at most 1000 files per page.
    token=$(grep -o '<NextContinuationToken>[^<]*' <<<"$page" | sed 's/<[^>]*>//' | sed 's/+/%2B/g; s/\//%2F/g; s/=/%3D/g' || true)
    [ -n "$token" ] || break
  done
  echo "$dest: $(find "$dest" -type f | wc -l) files, $(du -sh "$dest" | cut -f1)"
}

mkdir -p zarr
get_zarr 4e3c4b54-9a75-42b4-901b-123b36fd02dd "zarr/sub-Hb1_sample-lefthemi_space-XPCT_acq-highres_desc-bratio+mean.nii.zarr"
get_zarr 5f41916f-e900-478a-b813-ec1ea095e1ad "zarr/sub-Hb1_sample-lefthemi_space-XPCT_acq-highres_desc-WMorientation.nii.zarr"
