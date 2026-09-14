import { describe, it, expect } from "vitest";

import {
  NIFTI_IMAGE_TYPE,
  withNiftiName,
  asEmbeddedNiftiOptions,
  imageOptionsForSavedVolume,
} from "./nvd-saved-image-options";

const NII = NIFTI_IMAGE_TYPE;
const MGZ = 11; // niivue ImageType.MGZ

describe("withNiftiName", () => {
  it("replaces the extension with .nii", () => {
    expect(withNiftiName("orig.mgz")).toBe("orig.nii");
    expect(withNiftiName("aseg.mgh")).toBe("aseg.nii");
    expect(withNiftiName("vol.nrrd")).toBe("vol.nii");
  });

  it("drops a trailing .gz before replacing the extension", () => {
    expect(withNiftiName("x.nii.gz")).toBe("x.nii");
    expect(withNiftiName("x.NII.GZ")).toBe("x.nii");
  });

  it("appends .nii when there is no extension", () => {
    expect(withNiftiName("foo")).toBe("foo.nii");
  });

  it("keeps a .nii name unchanged", () => {
    expect(withNiftiName("t1.nii")).toBe("t1.nii");
  });

  it("returns an empty string for an empty name", () => {
    expect(withNiftiName("")).toBe("");
  });

  it("only touches the last path segment", () => {
    expect(withNiftiName("sub.01/mri/orig.mgz")).toBe("sub.01/mri/orig.nii");
    expect(withNiftiName("sub.01/orig")).toBe("sub.01/orig.nii");
  });
});

describe("asEmbeddedNiftiOptions", () => {
  const input = {
    name: "orig.mgz",
    url: "https://example.org/orig.mgz",
    imageType: MGZ,
    colormap: "freesurfer",
    opacity: 0.7,
    cal_min: 0,
    cal_max: 255,
    colormapLabel: { labels: ["a", "b"] },
  };

  it("rewrites name, image type and url for an embedded NIfTI blob", () => {
    const out = asEmbeddedNiftiOptions(input);
    expect(out.name).toBe("orig.nii");
    expect(out.imageType).toBe(NII);
    expect(out.url).toBe("");
  });

  it("preserves every other field", () => {
    const out = asEmbeddedNiftiOptions(input);
    expect(out.colormap).toBe("freesurfer");
    expect(out.opacity).toBe(0.7);
    expect(out.cal_min).toBe(0);
    expect(out.cal_max).toBe(255);
    expect(out.colormapLabel).toBe(input.colormapLabel);
  });

  it("does not mutate its input", () => {
    const copy = { ...input };
    asEmbeddedNiftiOptions(input);
    expect(input).toEqual(copy);
  });

  it("handles options without a name", () => {
    const out = asEmbeddedNiftiOptions({ colormap: "gray" });
    expect(out.name).toBe("");
    expect(out.imageType).toBe(NII);
    expect(out.url).toBe("");
  });
});

describe("imageOptionsForSavedVolume", () => {
  it("points at the saved NIfTI file and names the volume after it", () => {
    const out = imageOptionsForSavedVolume(
      { name: "orig.mgz", imageType: MGZ, url: "", colormap: "gray" },
      "sub-01/x.nii.gz",
    );
    expect(out.url).toBe("sub-01/x.nii.gz");
    expect(out.name).toBe("x.nii.gz");
    expect(out.imageType).toBe(NII);
    expect(out.colormap).toBe("gray");
  });

  it("uses the whole url as the name when there is no path", () => {
    const out = imageOptionsForSavedVolume({ name: "orig.mgz" }, "t1.nii.gz");
    expect(out.name).toBe("t1.nii.gz");
  });

  it("does not mutate its input", () => {
    const input = { name: "orig.mgz", imageType: MGZ, url: "" };
    const copy = { ...input };
    imageOptionsForSavedVolume(input, "t1.nii.gz");
    expect(input).toEqual(copy);
  });
});
