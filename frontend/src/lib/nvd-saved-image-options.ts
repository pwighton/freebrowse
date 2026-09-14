/**
 * Helpers that keep a saved NVD's `imageOptionsArray` consistent with the
 * bytes FreeBrowse actually writes.
 *
 * niivue's `NVDocument.json(true)` embeds every volume as NIfTI bytes
 * (`NVImage.toUint8Array()`), and the backend save path writes each volume
 * with `saveToUint8Array(<name>.nii.gz)`. In both cases niivue copies the
 * volume's *original* options unchanged, so a volume loaded from `orig.mgz`
 * is recorded as `name: "orig.mgz"`, `imageType: MGZ` while its data is
 * NIfTI. On reload the MGZ image type routes the NIfTI bytes to the MGH
 * reader, which fails ("Unexpected MGH version"). These helpers rewrite the
 * name and image type to match the NIfTI payload.
 */

/**
 * niivue's `ImageType.NII`. The enum is not part of the public typings in
 * @niivue/niivue 0.69, so the value is pinned here.
 */
export const NIFTI_IMAGE_TYPE = 1;

type ImageOptionsLike = {
  name?: string;
  url?: string;
  imageType?: number;
  [key: string]: unknown;
};

type NiftiImageOptions = { name: string; imageType: number; url: string };

/**
 * Replace the file extension of `name` with `.nii`, dropping a trailing `.gz`
 * first. An empty name stays empty.
 *
 * `orig.mgz` -> `orig.nii`, `x.nii.gz` -> `x.nii`, `foo` -> `foo.nii`.
 */
export function withNiftiName(name: string): string {
  if (!name) return "";
  let base = name;
  if (base.toLowerCase().endsWith(".gz")) {
    base = base.slice(0, -3);
  }
  const slash = base.lastIndexOf("/");
  const dot = base.lastIndexOf(".");
  if (dot > slash + 1) {
    base = base.slice(0, dot);
  }
  return `${base}.nii`;
}

/**
 * Options for a volume embedded in the document as an uncompressed NIfTI
 * blob (download mode). The URL is cleared because the data travels inside
 * the document.
 */
export function asEmbeddedNiftiOptions<T extends ImageOptionsLike>(
  options: T,
): T & NiftiImageOptions {
  return {
    ...options,
    name: withNiftiName(options.name ?? ""),
    imageType: NIFTI_IMAGE_TYPE,
    url: "",
  };
}

/**
 * Options for a volume that was written to the backend as a NIfTI file at
 * `savedUrl` (backend save mode). The name becomes the saved file's basename
 * so the extension matches the bytes on disk.
 */
export function imageOptionsForSavedVolume<T extends ImageOptionsLike>(
  options: T,
  savedUrl: string,
): T & NiftiImageOptions {
  const basename = savedUrl.split("/").pop() || savedUrl;
  return {
    ...options,
    name: basename,
    imageType: NIFTI_IMAGE_TYPE,
    url: savedUrl,
  };
}
