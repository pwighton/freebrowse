import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@niivue/niivue", () => import("@/__mocks__/niivue"));

import { NiiVue } from "@niivue/niivue";
import { mountFreeBrowse } from "./mount";
import {
  deploymentConfig,
  getFreeBrowseConfig,
  resetFreeBrowseConfig,
} from "@/lib/deployment-config";

describe("mountFreeBrowse", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    resetFreeBrowseConfig();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.freebrowse;
  });

  test("renders into the container with library defaults and destroys cleanly", async () => {
    const nv = new NiiVue();
    let handle!: ReturnType<typeof mountFreeBrowse>;
    await act(async () => {
      handle = mountFreeBrowse(container, { nv });
    });
    expect(handle.nv).toBe(nv);
    expect(container.querySelector(".freebrowse-root")).not.toBeNull();
    // library defaults: no backend, no url params, no global
    expect(deploymentConfig.serverless).toBe(true);
    expect(getFreeBrowseConfig().readUrlParams).toBe(false);
    expect(window.freebrowse).toBeUndefined();
    await act(async () => {
      handle.destroy();
    });
    expect(container.innerHTML).toBe("");
  });

  test("a second concurrent mount throws; after destroy a new mount works", async () => {
    let first!: ReturnType<typeof mountFreeBrowse>;
    await act(async () => {
      first = mountFreeBrowse(container);
    });
    const other = document.createElement("div");
    expect(() => mountFreeBrowse(other)).toThrow(/already mounted/);
    await act(async () => {
      first.destroy();
    });
    let second!: ReturnType<typeof mountFreeBrowse>;
    await act(async () => {
      second = mountFreeBrowse(other);
    });
    expect(other.querySelector(".freebrowse-root")).not.toBeNull();
    await act(async () => {
      second.destroy();
    });
  });

  test("creates an instance when none is given", async () => {
    let handle!: ReturnType<typeof mountFreeBrowse>;
    await act(async () => {
      handle = mountFreeBrowse(container);
    });
    expect(handle.nv).toBeInstanceOf(NiiVue);
    await act(async () => {
      handle.destroy();
    });
  });

  test("options flow into the runtime config", async () => {
    let handle!: ReturnType<typeof mountFreeBrowse>;
    await act(async () => {
      handle = mountFreeBrowse(container, {
        nv: new NiiVue(),
        backend: { dataUrl: "https://h/data", aiUrl: "https://h/ai" },
        persist: false,
        exposeGlobal: true,
        readUrlParams: true,
      });
    });
    const c = getFreeBrowseConfig();
    expect(c.backend).toEqual({ dataUrl: "https://h/data", aiUrl: "https://h/ai" });
    expect(c.persist).toBe(false);
    expect(c.readUrlParams).toBe(true);
    expect(window.freebrowse?.nv).toBe(handle.nv);
    await act(async () => {
      handle.destroy();
    });
  });
});
