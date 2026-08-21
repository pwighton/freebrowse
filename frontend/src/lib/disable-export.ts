/**
 * Neutralize niivue's public save-to-disk API for secure deployments.
 *
 * STUB during the niivue-mono migration: the old prototype-patching approach
 * targeted `NVImage.prototype` (NVImage is now a type, not a class) and
 * `NiiVue.prototype.{saveImage,saveScene,saveHTML,saveDocument}` (the class was
 * renamed to NiiVue and the method names changed), none of which exist in the
 * new API. Re-implementing the real export lockdown is deferred to P6.
 */
export function applyExportLockdown(): void {
  console.warn(
    "applyExportLockdown: disabled during niivue-mono migration (P6)",
  );
  // MIGRATION-TODO(P6): re-implement export lockdown by patching NiiVue.prototype.{saveVolume,saveDrawing,saveMesh,saveBitmap,saveDocument,serializeDocument}
}
