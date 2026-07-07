import { decode, encode } from "cbor-x";

import { uint8ArrayToBase64 } from "@/lib/niivue-helpers";

/**
 * JSON <-> CBOR adapter for niivue-mono NVDocuments.
 *
 * niivue-mono serializes NVDocuments as CBOR (`cbor-x`), which round-trips
 * binary data (typed arrays) and non-finite numbers losslessly. FreeBrowse
 * keeps its `.nvd` files as JSON. Plain `JSON.stringify` on a decoded document
 * would corrupt two field kinds that the niivue schema legitimately contains:
 *
 *   1. Binary buffers (`ArrayBufferView`s) — e.g. `drawingBitmapRLE`, embedded
 *      volume `img` bytes, mesh `positions/indices/colors`, label-colormap
 *      `lut`, mesh-layer `data`. `JSON.stringify` turns a typed array into an
 *      index-keyed object.
 *   2. Non-finite numbers — `calMinNeg`/`calMaxNeg` default to `NaN`, and some
 *      fields (e.g. mesh `thicknessOn2D`) can be `Infinity`. `JSON.stringify`
 *      silently rewrites these to `null`.
 *
 * This module performs a generic, schema-agnostic walk of the decoded document
 * tree, tagging those two kinds so the JSON is lossless and reversible. It does
 * NOT hard-code niivue field names (except `stripEmbeddedData`), so it tolerates
 * additive schema changes across niivue-mono release candidates.
 *
 * Marker objects it introduces:
 *   - `{ $nvd: "ta", type: "Uint8Array", b64: "..." }`  — a typed array / DataView
 *   - `{ $nvd: "num", v: "NaN" | "Infinity" | "-Infinity" }` — a non-finite number
 */

/** Marker key used to tag values that JSON cannot represent natively. */
const MARKER = "$nvd";

type TaggedView = { [MARKER]: "ta"; type: string; b64: string };
type TaggedNum = { [MARKER]: "num"; v: "NaN" | "Infinity" | "-Infinity" };

/** Constructors for every `ArrayBufferView` type, keyed by `constructor.name`. */
const VIEW_CTORS: Record<string, new (buffer: ArrayBuffer) => ArrayBufferView> =
  {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    DataView,
  };

/**
 * Decode a base64 string to a fresh `Uint8Array`. Chunked so it stays within
 * argument-count limits on large buffers (mirrors {@link uint8ArrayToBase64}).
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

/**
 * Walk a CBOR-decoded document tree and return a structurally-identical tree
 * containing only JSON-safe values (binary buffers and non-finite numbers are
 * replaced by {@link MARKER} objects).
 */
export function toJsonSafe(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
    const tagged: TaggedView = {
      [MARKER]: "ta",
      type: value.constructor.name,
      b64: uint8ArrayToBase64(bytes),
    };
    return tagged;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    const v: TaggedNum["v"] = Number.isNaN(value)
      ? "NaN"
      : value > 0
        ? "Infinity"
        : "-Infinity";
    const tagged: TaggedNum = { [MARKER]: "num", v };
    return tagged;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (isPlainRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      // Drop `undefined` (JSON omits it anyway; keeps the tree canonical).
      if (v === undefined) continue;
      out[key] = toJsonSafe(v);
    }
    return out;
  }
  return value;
}

function isTaggedView(value: Record<string, unknown>): value is TaggedView {
  return value[MARKER] === "ta" && typeof value.b64 === "string";
}

function isTaggedNum(value: Record<string, unknown>): value is TaggedNum {
  return value[MARKER] === "num";
}

/**
 * Inverse of {@link toJsonSafe}: revive tagged buffers and non-finite numbers
 * back into their native representations.
 */
export function fromJsonSafe(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(fromJsonSafe);
  }
  if (isPlainRecord(value)) {
    if (isTaggedView(value)) {
      const bytes = base64ToUint8Array(value.b64);
      const Ctor = VIEW_CTORS[value.type];
      if (!Ctor) {
        throw new Error(`nvd-json: unknown ArrayBufferView type "${value.type}"`);
      }
      // Uint8Array can reuse the decoded buffer directly; wider element types
      // reinterpret the same bytes (byteLength is always a whole multiple).
      return new Ctor(bytes.buffer);
    }
    if (isTaggedNum(value)) {
      switch (value.v) {
        case "NaN":
          return NaN;
        case "Infinity":
          return Infinity;
        case "-Infinity":
          return -Infinity;
      }
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = fromJsonSafe(v);
    }
    return out;
  }
  return value;
}

/** Decode raw CBOR document bytes into a mutable document object. */
export function decodeDocument(cborBytes: Uint8Array): Record<string, unknown> {
  return decode(cborBytes) as Record<string, unknown>;
}

/** Encode a document object back into CBOR bytes. */
export function encodeDocument(doc: unknown): Uint8Array {
  return encode(doc);
}

/**
 * Convert raw CBOR document bytes (from `nv.serializeDocument()`) into a
 * JSON-serializable object suitable for `JSON.stringify` and the FreeBrowse
 * backend's `json.dump` passthrough.
 */
export function documentToJson(cborBytes: Uint8Array): unknown {
  return toJsonSafe(decodeDocument(cborBytes));
}

/**
 * Convert a JSON object (as produced by {@link documentToJson}, possibly after
 * `JSON.parse`) back into CBOR document bytes that `nv.loadDocument` accepts.
 */
export function documentFromJson(json: unknown): Uint8Array {
  return encodeDocument(fromJsonSafe(json));
}

/**
 * Wrap JSON document data in a `File` of CBOR bytes for `nv.loadDocument(file)`,
 * which fetches the source, reads its bytes, and CBOR-decodes them.
 */
export function jsonToDocumentFile(json: unknown, name = "scene.nvd"): File {
  return new File([documentFromJson(json)], name, { type: "application/cbor" });
}

/**
 * Strip embedded volume data for URL-referencing (backend) save mode, operating
 * on a decoded document object (run between {@link decodeDocument} and
 * {@link toJsonSafe}). Deletes each volume's embedded `data` and rewrites its
 * `url` from `volumeUrls[i]` (skipped when the entry is `null`/absent). Meshes
 * are intentionally left embedded (URL-only mesh entries do not restore their
 * scalar-overlay layers on load). Mutates and returns `doc`.
 */
export function stripEmbeddedData(
  doc: Record<string, unknown>,
  { volumeUrls }: { volumeUrls: (string | null)[] },
): Record<string, unknown> {
  const volumes = doc.volumes;
  if (Array.isArray(volumes)) {
    volumes.forEach((vol, i) => {
      if (!isPlainRecord(vol)) return;
      delete vol.data;
      const url = volumeUrls[i];
      if (url != null) vol.url = url;
    });
  }
  return doc;
}
