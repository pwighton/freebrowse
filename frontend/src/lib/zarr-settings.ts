/**
 * The zarr view's streaming settings: how a streamed store spends its budget.
 * Each maps onto niivue's budget plan for a chunked volume
 * (`@niivue/niivue` `BudgetPlan`), which can be changed on a running stream.
 */
import type { BudgetPlan, BudgetPlanName, SwapPolicy } from "@niivue/niivue";
import type { RenderBackend } from "@/lib/rendering";

export interface ZarrSettings {
  /** GPU memory for streamed bricks, chosen per backend (see rendering.ts). */
  gpuMemory: Partial<Record<RenderBackend, number>>;
  /** Where the detail goes. */
  detailPreset: BudgetPlanName;
  /** Ceiling on the brick count; null takes the preset's own. */
  maxBricks: number | null;
  /** How fast detail falls off away from the focus (1 = slowest). */
  detailFalloff: number;
  /** What a refocus does with the bricks it replaces (3D render). */
  swapPolicy: SwapPolicy;
  /** Keep downloaded chunks in the browser's storage across sessions. */
  diskCache: boolean;
}

export const DEFAULT_ZARR_SETTINGS: ZarrSettings = {
  gpuMemory: {},
  detailPreset: "focus",
  maxBricks: null,
  detailFalloff: 1,
  swapPolicy: "replace",
  diskCache: false,
};

/** niivue's renderers draw at most 1024 bricks per tile. */
export const MAX_BRICKS_LIMIT = 1000;
export const MIN_BRICKS_LIMIT = 16;
export const MIN_DETAIL_FALLOFF = 0.25;

/**
 * The detail presets, as niivue defines them (`BUDGET_PLANS`). Spelled out
 * here because a plan is applied whole: FreeBrowse layers its own brick
 * ceiling, falloff and memory over the preset and hands niivue the result.
 */
export const DETAIL_PRESETS: Record<
  BudgetPlanName,
  Pick<BudgetPlan, "focus" | "radius" | "maxBricks"> & {
    label: string;
    description: string;
  }
> = {
  focus: {
    focus: "crosshair",
    radius: "auto",
    maxBricks: 240,
    label: "Focus",
    description: "Finest detail around the crosshair.",
  },
  interactive: {
    focus: "crosshair",
    radius: "auto",
    maxBricks: 128,
    label: "Interactive",
    description: "Fewer bricks, for smoother rotation and zoom.",
  },
  uniform: {
    focus: "none",
    radius: "volume",
    maxBricks: 240,
    label: "Uniform",
    description: "One even picture of the whole volume; does not follow the crosshair.",
  },
};

/** The budget plan niivue is given for these settings. */
export function budgetPlanFor(
  settings: ZarrSettings,
  budgetBytes: number,
): Pick<BudgetPlan, "focus" | "radius" | "detail" | "budgetBytes" | "maxBricks"> {
  const preset = DETAIL_PRESETS[settings.detailPreset] ?? DETAIL_PRESETS.focus;
  const maxBricks =
    settings.maxBricks === null
      ? preset.maxBricks
      : Math.min(MAX_BRICKS_LIMIT, Math.max(MIN_BRICKS_LIMIT, Math.round(settings.maxBricks)));
  const falloff = Number.isFinite(settings.detailFalloff)
    ? Math.min(1, Math.max(MIN_DETAIL_FALLOFF, settings.detailFalloff))
    : 1;
  return {
    focus: preset.focus,
    radius: preset.radius,
    detail: falloff,
    budgetBytes,
    maxBricks,
  };
}
