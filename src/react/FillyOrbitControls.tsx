/** Optional inspection controls; the embedded mascot keeps its fixed camera. */
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CAMERA_TARGET } from "./FillyScene";

export function FillyOrbitControls() {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(...CAMERA_TARGET);
    const distance = camera.position.distanceTo(controls.target);
    controls.minDistance = distance * 0.82;
    controls.maxDistance = distance * 1.25;
    controls.minPolarAngle = Math.PI / 4;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.enablePan = false;
    controls.rotateSpeed = 0.7;
    // Every interaction produces a change event, so paused/frozen canvases
    // render on demand without keeping a damping animation loop alive.
    controls.enableDamping = false;
    controls.update();
    controls.saveState();
    const requestFrame = () => invalidate();
    controls.addEventListener("change", requestFrame);
    invalidate();

    return () => {
      controls.removeEventListener("change", requestFrame);
      controls.reset();
      controls.dispose();
      invalidate();
    };
  }, [camera, canvas, invalidate]);

  return null;
}
