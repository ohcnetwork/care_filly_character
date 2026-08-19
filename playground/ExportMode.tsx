/**
 * `?export=1` — builds an idle-posed FillyModel (no contact shadow) and exposes
 * `window.__fillyExportGLB(): Promise<ArrayBuffer>` (binary glTF, textures
 * embedded, invisible decorations skipped). Sets `window.__fillyReady = true`.
 */
import { useEffect, useState } from "react";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STATE_TARGETS } from "../src/animation/states";
import { FillyModel } from "../src/model/FillyModel";

declare global {
  interface Window {
    __fillyExportGLB?: () => Promise<ArrayBuffer>;
    __fillyReady?: boolean;
  }
}

export function exportFillyGLB(model: FillyModel): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      model,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error("GLTFExporter returned JSON; expected binary"));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true, onlyVisible: true, embedImages: true, maxTextureSize: 512 },
    );
  });
}

export function ExportMode() {
  const [status, setStatus] = useState("building model…");
  useEffect(() => {
    const model = new FillyModel({ shadow: false });
    model.name = "FillyMascot";
    model.applyPose(STATE_TARGETS.idle, 0);
    model.updateMatrixWorld(true);
    window.__fillyExportGLB = () => exportFillyGLB(model);
    window.__fillyReady = true;
    setStatus("ready — call window.__fillyExportGLB()");
    return () => {
      window.__fillyReady = false;
      delete window.__fillyExportGLB;
      model.dispose();
    };
  }, []);
  return <div className="export">Filly GLB export: {status}</div>;
}
