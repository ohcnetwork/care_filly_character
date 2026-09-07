/**
 * Inner react-three-fiber scene: one {@link FillyModel} driven by one
 * {@link FillyAnimator}, lights, a procedural PMREM environment and the
 * per-frame update. Rendered inside `<Canvas>` by {@link FillyCharacter}.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { FillyAnimator } from "../animation/FillyAnimator";
import { FillyModel } from "../model/FillyModel";

/** Where the camera looks (slightly below the body centre so the feet/shadow read). */
export const CAMERA_TARGET: readonly [number, number, number] = [0, 0.085, 0];
/** The slight elevation reveals the pads' pillowy depth without distorting the shell. */
/** Default camera placement — matches the reference sheet framing. */
export const CAMERA_POSITION: readonly [number, number, number] = [
  0, 0.22, 9,
];
/** Long-ish lens: the illustration reads almost orthographic. */
export const CAMERA_FOV = 16.2;
/** Brightness of the procedural RoomEnvironment reflections. */
export const ENVIRONMENT_INTENSITY = 0.42;

export interface FillyFreeze {
  /** Deterministic time to step the animator to (after `reset()`). */
  at: number;
  /** Trigger a blink before stepping, so the frame lands mid-blink. */
  blink?: boolean;
  /** Optional audio level applied before stepping (e.g. talking screenshots). */
  audioLevel?: number | null;
}

export interface FillyScenePropsInternal {
  animator: FillyAnimator;
  /** When false the animator is not advanced (the last pose stays on screen). */
  running: boolean;
  /** Static deterministic frame; when set `running` is ignored. */
  freeze?: FillyFreeze;
  /** Called once the first frame with the character has been rendered. */
  onReady?: () => void;
}

const TARGET = new THREE.Vector3(...CAMERA_TARGET);

/** Builds the PMREM room environment once per renderer; disposes on unmount. */
function useRoomEnvironment(): void {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
    pmrem.dispose();
    room.dispose(); // the room's box geometries/materials are no longer needed once baked
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    };
  }, [gl, scene]);
}

/** Points the camera at {@link CAMERA_TARGET} and applies renderer colour settings. */
function useCameraAndRenderer(): void {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    // Neutral tone mapping keeps the pastel greens while rolling the broad
    // vinyl highlights off softly instead of clipping them to flat white.
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    camera.lookAt(TARGET);
    camera.updateProjectionMatrix();
    invalidate();
  }, [gl, camera, invalidate]);
}

/**
 * The character itself. Creates the model inside an effect (StrictMode-safe:
 * the model is disposed and rebuilt on the double-invoke) and advances the
 * animator every rendered frame.
 */
export function FillyScene({
  animator,
  running,
  freeze,
  onReady,
}: FillyScenePropsInternal) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const modelRef = useRef<FillyModel | null>(null);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useRoomEnvironment();
  useCameraAndRenderer();

  // Model lifecycle.
  useEffect(() => {
    const model = new FillyModel();
    model.applyPose(animator.pose, animator.time);
    scene.add(model);
    modelRef.current = model;
    invalidate();
    return () => {
      modelRef.current = null;
      scene.remove(model);
      model.dispose();
    };
  }, [scene, animator, invalidate]);

  // Deterministic freeze frame: reset → (blink) → stepTo → request one render.
  const freezeAt = freeze?.at;
  const freezeBlink = freeze?.blink ?? false;
  const freezeAudio = freeze?.audioLevel;
  useEffect(() => {
    if (freezeAt === undefined) return;
    animator.reset();
    if (freezeAudio !== undefined) animator.setAudioLevel(freezeAudio);
    if (freezeBlink) animator.blink();
    animator.stepTo(freezeAt);
    modelRef.current?.applyPose(animator.pose, animator.time);
    invalidate();
  }, [animator, freezeAt, freezeBlink, freezeAudio, invalidate]);

  const frozen = freezeAt !== undefined;
  useFrame((_state, dt) => {
    const model = modelRef.current;
    if (!model) return;
    if (!frozen && running) animator.update(dt);
    model.applyPose(animator.pose, animator.time);
    if (!readyRef.current) {
      readyRef.current = true;
      // The frame is rendered synchronously after this callback; notify on the next tick.
      const notify = () => onReadyRef.current?.();
      if (typeof requestAnimationFrame === "function")
        requestAnimationFrame(notify);
      else setTimeout(notify, 0);
    }
  });

  return (
    <>
      {/* A warm key and quieter ambient fill reveal the sculpted cushions.
          The room environment supplies broad highlights on the satin clay. */}
      <hemisphereLight args={["#fffdf3", "#b0cba0", 0.9]} />
      <directionalLight
        position={[-3.5, 5, 8]}
        color="#fffdf5"
        intensity={2.2}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-1.8}
        shadow-camera-right={1.8}
        shadow-camera-top={1.8}
        shadow-camera-bottom={-1.8}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-normalBias={0.012}
        shadow-bias={-0.0002}
        shadow-radius={12}
        shadow-blurSamples={12}
      />
      <directionalLight position={[3, 1, 4]} color="#e7f1e7" intensity={0.45} />
      <directionalLight position={[-1, -2, 5]} color="#e3f4cf" intensity={0.4} />
      <directionalLight
        position={[0, 3, -4]}
        color="#f8ffe8"
        intensity={0.65}
      />
    </>
  );
}
