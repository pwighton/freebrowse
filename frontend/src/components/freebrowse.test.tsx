import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@niivue/niivue", () => import("@/__mocks__/niivue"));

import { useFreeBrowseStore } from "@/store";
import FreeBrowse from "./freebrowse";

/**
 * Mount smoke + the event-driven contract: the Zustand store is a derived view
 * of niivue state, so driving the instance through niivue's API (as an external
 * caller would via `window.freebrowse.nv`) must update the UI with no app code
 * in the loop.
 */
describe("FreeBrowse", () => {
  beforeEach(() => {
    // The app probes the backend on mount (AI model list, /data listings).
    // Answer every request with an empty JSON list; nothing here needs a server.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("mounts empty (drop zone, no volumes) and exposes the instance on window.freebrowse", async () => {
    await act(async () => {
      render(<FreeBrowse />);
    });
    // Before any volume is loaded the shell shows the uploader, not the canvas.
    expect(screen.getByText("Load Medical Images")).toBeInTheDocument();
    expect(screen.getByText("No images")).toBeInTheDocument();
    expect(window.freebrowse?.nv).toBeDefined();
    expect(window.freebrowse?.nv.volumes).toHaveLength(0);
  });

  it("a volume added through the niivue API shows up in the sidebar", async () => {
    await act(async () => {
      render(<FreeBrowse />);
    });
    const nv = window.freebrowse!.nv;
    await act(async () => {
      await nv.addVolume({ url: "https://x/brain.nii.gz", name: "brain.nii.gz" });
    });
    expect(screen.getByText("brain.nii.gz")).toBeInTheDocument();
    expect(screen.queryByText("No images")).not.toBeInTheDocument();
  });

  it("a slice-type change on the instance is mirrored into the store's view mode", async () => {
    await act(async () => {
      render(<FreeBrowse />);
    });
    const nv = window.freebrowse!.nv;
    await act(async () => {
      nv.sliceType = 4; // SLICE_TYPE.RENDER
      nv.showRender = 1; // SHOW_RENDER.ALWAYS
    });
    expect(useFreeBrowseStore.getState().viewerOptions.viewMode).toBe("render");
  });
});
