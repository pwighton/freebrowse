import { describe, it, expect } from "vitest";
import { decode, encode } from "cbor-x";

import {
  base64ToUint8Array,
  decodeDocument,
  documentFromJson,
  documentToJson,
  jsonToDocumentFile,
  stripEmbeddedData,
  toJsonSafe,
} from "./nvd-json";

/** Structural view of the decoded sample used only for typed test assertions. */
interface DecodedDoc {
  mesh: { thicknessOn2D: number; xray: number };
  drawingBitmapRLE: Uint8Array;
  volumes: {
    calMinNeg: number;
    calMaxNeg: number;
    data: { img: Uint8Array };
    colormapLabel: { lut: Uint8Array };
  }[];
  meshes: {
    data: { positions: Uint8Array };
    layers: { data: Uint8Array }[];
    tractData: { dpv: { scalar: Uint8Array } };
  }[];
}

/**
 * Build a representative NVDocumentData-shaped object that exercises every
 * JSON-hostile field kind the niivue-mono schema can contain: embedded volume
 * bytes, mesh geometry, mesh-layer data, a label colormap LUT, a drawing RLE
 * bitmap, tract data with typed-array maps, and non-finite numbers (NaN /
 * +-Infinity). This object encoded with cbor-x IS our fixture.
 */
function makeSampleDoc() {
  return {
    version: 8,
    created: "2026-07-07T00:00:00.000Z",
    scene: {
      azimuth: 110,
      elevation: 10,
      crosshairPos: [0.5, 0.5, 0.5],
      pan2Dxyzmm: [0, 0, 0, 1],
      backgroundColor: [0, 0, 0, 1],
    },
    layout: { sliceType: 3, isRadiological: false },
    draw: { isEnabled: false, penValue: 1 },
    // Non-finite scalars that JSON.stringify would corrupt to null:
    mesh: { thicknessOn2D: Infinity, xray: -Infinity },
    drawingBitmapRLE: new Uint8Array([0, 255, 3, 7, 128]),
    drawingBitmapLength: 5,
    volumes: [
      {
        url: "brain.nii.gz",
        name: "brain",
        colormap: "gray",
        opacity: 1,
        calMin: 30,
        calMax: 80,
        calMinNeg: NaN,
        calMaxNeg: NaN,
        frame4D: 0,
        data: {
          hdr: { dims: [3, 2, 2, 2, 1, 1, 1, 1], affine: [[1, 0, 0, 0]] },
          img: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
          datatypeCode: 2,
        },
        colormapLabel: {
          lut: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
          min: 0,
          max: 1,
          labels: ["bg", "roi"],
        },
      },
    ],
    meshes: [
      {
        url: "lh.white",
        name: "lh.white",
        color: [1, 1, 1, 1],
        shaderType: "phong",
        kind: "mesh",
        data: {
          positions: new Uint8Array([1, 2, 3, 4]),
          indices: new Uint8Array([0, 1, 2]),
          colors: new Uint8Array([9, 9, 9]),
        },
        layers: [
          {
            url: "lh.curv",
            name: "lh.curv",
            colormap: "nih",
            colormapNegative: "",
            calMin: -0.75,
            calMax: 0.75,
            calMinNeg: NaN,
            calMaxNeg: NaN,
            opacity: 1,
            data: new Uint8Array([100, 101, 102, 103]),
          },
        ],
      },
      {
        url: "fibers.trx",
        name: "fibers",
        kind: "tract",
        tractData: {
          vertices: new Uint8Array([1, 1, 1, 1]),
          offsets: new Uint8Array([0, 2]),
          dpv: { scalar: new Uint8Array([5, 6]) },
          dps: { group: new Uint8Array([7]) },
          groups: {},
          dpvMeta: { scalar: { globalMin: 0, globalMax: 1 } },
          dpsMeta: {},
        },
      },
    ],
    annotations: undefined,
  };
}

describe("base64ToUint8Array", () => {
  it("is the inverse of the shared uint8ArrayToBase64 helper", async () => {
    const { uint8ArrayToBase64 } = await import("./niivue-helpers");
    const original = new Uint8Array([0, 1, 2, 254, 255, 128, 42]);
    expect([...base64ToUint8Array(uint8ArrayToBase64(original))]).toEqual([
      ...original,
    ]);
  });

  it("round-trips a large buffer (crosses the chunk boundary)", async () => {
    const { uint8ArrayToBase64 } = await import("./niivue-helpers");
    const big = new Uint8Array(20000);
    for (let i = 0; i < big.length; i++) big[i] = i % 256;
    expect(base64ToUint8Array(uint8ArrayToBase64(big))).toEqual(big);
  });
});

describe("nvd-json round-trip", () => {
  it("survives a full CBOR -> JSON text -> CBOR cycle byte-for-byte", () => {
    const cborBytes = encode(makeSampleDoc());

    // The path a saved-and-reloaded document actually takes:
    const json = documentToJson(cborBytes); // decode + tag
    const text = JSON.stringify(json); // FreeBrowse .nvd on disk / backend
    const reparsed = JSON.parse(text); // load from disk / backend
    const rebuiltBytes = documentFromJson(reparsed); // -> CBOR for loadDocument

    expect(decode(rebuiltBytes)).toEqual(decode(cborBytes));
  });

  it("preserves NaN and +-Infinity through JSON text", () => {
    const json = JSON.parse(JSON.stringify(documentToJson(encode(makeSampleDoc()))));
    const doc = decode(documentFromJson(json)) as unknown as DecodedDoc;
    expect(doc.volumes[0].calMinNeg).toBeNaN();
    expect(doc.volumes[0].calMaxNeg).toBeNaN();
    expect(doc.mesh.thicknessOn2D).toBe(Infinity);
    expect(doc.mesh.xray).toBe(-Infinity);
  });

  it("preserves every embedded Uint8Array exactly", () => {
    const json = JSON.parse(JSON.stringify(documentToJson(encode(makeSampleDoc()))));
    const doc = decode(documentFromJson(json)) as unknown as DecodedDoc;
    expect(doc.drawingBitmapRLE).toEqual(new Uint8Array([0, 255, 3, 7, 128]));
    expect(doc.volumes[0].data.img).toEqual(
      new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
    );
    expect(doc.volumes[0].colormapLabel.lut).toEqual(
      new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
    );
    expect(doc.meshes[0].data.positions).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(doc.meshes[0].layers[0].data).toEqual(
      new Uint8Array([100, 101, 102, 103]),
    );
    expect(doc.meshes[1].tractData.dpv.scalar).toEqual(new Uint8Array([5, 6]));
  });

  it("produces strictly JSON-safe output (no typed arrays, no non-finite numbers)", () => {
    const json = documentToJson(encode(makeSampleDoc()));
    // If any Uint8Array or NaN/Infinity leaked through, a strict JSON reparse
    // would either lose it or diverge from a second stringify.
    const once = JSON.stringify(json);
    const twice = JSON.stringify(JSON.parse(once));
    expect(twice).toEqual(once);
    expect(once).not.toContain("null"); // NaN/Infinity would appear as null
  });

  it("is resilient to typed-array types beyond Uint8Array (future rc insurance)", () => {
    // The walk is generic over ArrayBufferView by constructor name, so a
    // Float32Array (not currently emitted) still round-trips losslessly.
    const bytes = encode({ coords: new Float32Array([1.5, -2.25, 3.125]) });
    const round = decode(
      documentFromJson(JSON.parse(JSON.stringify(documentToJson(bytes)))),
    ) as { coords: Float32Array };
    expect(round.coords).toBeInstanceOf(Float32Array);
    expect([...round.coords]).toEqual([1.5, -2.25, 3.125]);
  });
});

describe("jsonToDocumentFile", () => {
  it("wraps JSON as a File of CBOR bytes that decode back to the document", async () => {
    const json = documentToJson(encode(makeSampleDoc()));
    const file = jsonToDocumentFile(json, "my-scene.nvd");
    expect(file.name).toBe("my-scene.nvd");
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect((decode(bytes) as { version: number }).version).toBe(8);
  });
});

describe("stripEmbeddedData", () => {
  it("drops embedded volume data and rewrites urls, leaving meshes embedded", () => {
    const doc = decodeDocument(encode(makeSampleDoc()));
    stripEmbeddedData(doc, { volumeUrls: ["/data/vol/brain.nii.gz"] });

    const volumes = doc.volumes as Record<string, unknown>[];
    expect(volumes[0].data).toBeUndefined();
    expect(volumes[0].url).toBe("/data/vol/brain.nii.gz");
    // Meshes keep their embedded geometry.
    const meshes = doc.meshes as Record<string, unknown>[];
    expect((meshes[0].data as Record<string, unknown>).positions).toBeDefined();
  });

  it("leaves the url unchanged when the mapped entry is null", () => {
    const doc = decodeDocument(encode(makeSampleDoc()));
    stripEmbeddedData(doc, { volumeUrls: [null] });
    const volumes = doc.volumes as Record<string, unknown>[];
    expect(volumes[0].url).toBe("brain.nii.gz");
    expect(volumes[0].data).toBeUndefined();
  });

  it("keeps toJsonSafe output stable after stripping", () => {
    const doc = decodeDocument(encode(makeSampleDoc()));
    stripEmbeddedData(doc, { volumeUrls: ["/data/vol/brain.nii.gz"] });
    const json = toJsonSafe(doc);
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});
