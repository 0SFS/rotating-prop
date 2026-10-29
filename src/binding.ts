import { Quaternion, Vector3, type Mesh, type TransformNode } from '@babylonjs/core';
import { createPropellerDisc } from './disc';
import { propPresentation, smoothFrameSeconds, stepRotatingProp, type PropMotion, type PropPresentation } from './motion';
import { createPropellerSweep, measureSweepProfile, sweepRadius, type SweepProfile } from './sweep';
export interface RotatingPropBinding {
    node: TransformNode;
    axis: Vector3;
    radius: number;
    blades: number;
    direction?: number;
}
/**
 * Binds one authored blade pivot. Below the alias limit the blades turn; above
 * it they hide behind the 3D sweep, or the flat disc when the caller opts in.
 * Owns only the generated sweep/disc; the airframe owns the blades and pivot.
 * `radius` is in metres and is used only when the pivot has no geometry.
 */
export function createRotatingProp(binding: RotatingPropBinding) {
    const { node, axis, radius, blades } = binding;
    const rest = node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation);
    node.computeWorldMatrix(true);
    // The flat disc is a sibling of the blade pivot, so only its parent's scale
    // applies; the sweep copies the pivot's transform, so the pivot's applies.
    const scale = Vector3.One();
    node.parent?.getWorldMatrix().decompose(scale);
    const metresPerParentUnit = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) || 1;
    node.getWorldMatrix().decompose(scale);
    const metresPerNodeUnit = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) || 1;
    let disc: Mesh | null = null, sweep: Mesh | null = null;
    // Measured once, on first need: the sweep's shape and both looks' radius.
    let profile: SweepProfile | null | undefined;
    const measure = () => profile === undefined ? (profile = measureSweepProfile(node, axis)) : profile;
    let state: PropMotion = { angleRad: 0, blurred: false }, frameSeconds = 1 / 60;
    let shown: PropPresentation = 'blades';
    const turn = Quaternion.Identity();
    return {
        /** `flatDisc` opts into the lower-cost flat stand-in; the default high-RPM look is the 3D sweep. */
        update(rate: number, dt: number, held = false, flatDisc = false) {
            frameSeconds = smoothFrameSeconds(frameSeconds, dt);
            state = stepRotatingProp(state, rate * (binding.direction ?? 1), dt, frameSeconds, blades, held);
            Quaternion.RotationAxisToRef(axis, state.angleRad, turn);
            node.rotationQuaternion ??= Quaternion.Identity();
            rest.multiplyToRef(turn, node.rotationQuaternion);
            shown = propPresentation(state.blurred, flatDisc);
            if (shown === 'sweep' && !sweep) sweep = createPropellerSweep(node, node.getScene(), radius / metresPerNodeUnit, axis, measure());
            if (shown === 'disc' && !disc) {
                // The blades' own extent wins over a declared radius, so both looks match the geometry.
                const measured = measure(), metres = measured ? sweepRadius(measured) * metresPerNodeUnit : radius;
                disc = createPropellerDisc(node, node.getScene(), metres / metresPerParentUnit, axis, rest);
            }
            if (sweep && sweep.isEnabled() !== (shown === 'sweep')) sweep.setEnabled(shown === 'sweep');
            if (disc && disc.isEnabled() !== (shown === 'disc')) disc.setEnabled(shown === 'disc');
            node.setEnabled(shown === 'blades');
        },
        getState: () => ({ ...state, presentation: shown }),
        dispose() {
            for (const mesh of [disc, sweep]) { mesh?.material?.dispose(); mesh?.dispose(); }
            disc = sweep = null;
            // The airframe owns the authored blades; never leave them disabled
            // when a binding is replaced after changing LOD or aircraft.
            if (!node.isDisposed()) node.setEnabled(true);
        },
    };
}
