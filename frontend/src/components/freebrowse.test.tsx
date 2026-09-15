import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@niivue/niivue", () => import("@/__mocks__/niivue"));

import { NiiVue } from "@niivue/niivue";
import { useFreeBrowseStore } from "@/store";
import FreeBrowse from "./freebrowse";
import { createFreeBrowseInstance } from "@/lib/default-niivue-options";

type Nv = InstanceType<typeof NiiVue>;

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
    delete window.freebrowse;
  });

  it("mounts empty (drop zone, no volumes) and exposes the given instance on window.freebrowse", async () => {
    const nv = createFreeBrowseInstance();
    await act(async () => {
      render(<FreeBrowse nv={nv} />);
    });
    // Before any volume is loaded the shell shows the uploader, not the canvas.
    expect(screen.getByText("Load Medical Images")).toBeInTheDocument();
    expect(screen.getByText("No images")).toBeInTheDocument();
    expect(window.freebrowse?.nv).toBe(nv);
    expect(nv.volumes).toHaveLength(0);
  });

  it("exposeGlobal={false} leaves window.freebrowse unset; unmount clears it when set", async () => {
    const nv = createFreeBrowseInstance();
    const view = await act(async () => render(<FreeBrowse nv={nv} exposeGlobal={false} />));
    expect(window.freebrowse).toBeUndefined();
    view.unmount();

    const nv2 = createFreeBrowseInstance();
    const view2 = await act(async () => render(<FreeBrowse nv={nv2} />));
    expect(window.freebrowse?.nv).toBe(nv2);
    view2.unmount();
    expect(window.freebrowse).toBeUndefined();
  });

  it("a volume added through the niivue API shows up in the sidebar", async () => {
    const nv: Nv = createFreeBrowseInstance();
    await act(async () => {
      render(<FreeBrowse nv={nv} />);
    });
    await act(async () => {
      await nv.addVolume({ url: "https://x/brain.nii.gz", name: "brain.nii.gz" });
    });
    expect(screen.getByText("brain.nii.gz")).toBeInTheDocument();
    expect(screen.queryByText("No images")).not.toBeInTheDocument();
  });

  it("dark mode is a class on the .freebrowse-root element, never on <html>", async () => {
    const nv = createFreeBrowseInstance();
    await act(async () => {
      render(<FreeBrowse nv={nv} />);
    });
    const root = document.querySelector(".freebrowse-root");
    expect(root).not.toBeNull();
    await act(async () => {
      useFreeBrowseStore.setState({ darkMode: true });
    });
    expect(root!.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await act(async () => {
      useFreeBrowseStore.setState({ darkMode: false });
    });
    expect(root!.classList.contains("dark")).toBe(false);
  });

  it("opening a dialog does not touch the host page's body styles", async () => {
    const nv = createFreeBrowseInstance();
    await act(async () => {
      render(<FreeBrowse nv={nv} />);
    });
    await act(async () => {
      useFreeBrowseStore.setState({ settingsDialogOpen: true });
    });
    expect(document.body.style.overflow).toBe("");
    const overlay = document.querySelector(".freebrowse-root .absolute.inset-0");
    expect(overlay).not.toBeNull();
    await act(async () => {
      useFreeBrowseStore.setState({ settingsDialogOpen: false });
    });
  });

  it("a slice-type change on the instance is mirrored into the store's view mode", async () => {
    const nv: Nv = createFreeBrowseInstance();
    await act(async () => {
      render(<FreeBrowse nv={nv} />);
    });
    await act(async () => {
      nv.sliceType = 4; // SLICE_TYPE.RENDER
      nv.showRender = 1; // SHOW_RENDER.ALWAYS
    });
    expect(useFreeBrowseStore.getState().viewerOptions.viewMode).toBe("render");
  });
});
