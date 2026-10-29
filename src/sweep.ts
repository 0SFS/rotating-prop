/**
 * Three-dimensional high-RPM propeller volume: measure the solid a set of
 * blades sweeps in one turn and draw it as a semi-transparent lens. This is the
 * shared default look for fast propellers (C172 fallback, drones); a flat disc
 * is only an opt-in optimization.
 */
import { Color3, Matrix, Mesh, Quaternion, StandardMaterial, Vector3, VertexBuffer, VertexData, type Scene, type TransformNode } from '@babylonjs/core';
const SWEEP_BINS = 16;
const SWEEP_SEGMENTS = 48;
/** Thinnest half-thickness, as a fraction of radius, so the volume never collapses to a flat disc. */
const MIN_HALF_THICKNESS = .006;
/** Radial profile of the solid a blade set sweeps in one turn, in the pivot's local units. */
export interface SweepProfile {
    /** Ascending radii from the axis. */
    radius: number[];
    /** Furthest forward (+axis) and aft (-axis) reach at each radius. */
    front: number[];
    back: number[];
}
/**
 * Radial envelope of the geometry under `node`, about `axis` through its
 * origin. Each triangle is sampled finely enough that a long blade spanning
 * many radii contributes to all of them, not only at its vertices.
 */
export function measureSweepProfile(node: TransformNode, axis: Vector3): SweepProfile | null {
    const a = axis.normalizeToNew();
    node.computeWorldMatrix(true);
    const toLocal = Matrix.Invert(node.getWorldMatrix());
    const meshes = [...(node instanceof Mesh ? [node] : []), ...node.getChildMeshes(false)]
        .filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0);
    const p = new Vector3(), m = new Matrix();
    const shells: { local: Float32Array; indices: ArrayLike<number> }[] = [];
    let rMax = 0;
    for (const mesh of meshes) {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!positions) continue;
        mesh.computeWorldMatrix(true).multiplyToRef(toLocal, m);
        const local = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i += 3) {
            Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i + 1], positions[i + 2], m, p);
            local[i] = p.x; local[i + 1] = p.y; local[i + 2] = p.z;
            const h = Vector3.Dot(p, a);
            rMax = Math.max(rMax, Math.sqrt(Math.max(0, p.lengthSquared() - h * h)));
        }
        shells.push({ local, indices: mesh.getIndices() ?? Array.from({ length: local.length / 3 }, (_, i) => i) });
    }
    if (!(rMax > 0)) return null;
    const lo = new Array<number>(SWEEP_BINS).fill(Infinity), hi = new Array<number>(SWEEP_BINS).fill(-Infinity);
    const bin = (x: number, y: number, z: number) => {
        const h = a.x * x + a.y * y + a.z * z;
        const r = Math.sqrt(Math.max(0, x * x + y * y + z * z - h * h));
        const i = Math.min(SWEEP_BINS - 1, Math.floor(r / rMax * SWEEP_BINS));
        if (h < lo[i]) lo[i] = h;
        if (h > hi[i]) hi[i] = h;
    };
    for (const shell of shells) sampleTriangles(shell.local, shell.indices, rMax / SWEEP_BINS, bin);
    const filled = lo.map((value, i) => Number.isFinite(value) ? i : -1).filter(i => i >= 0);
    if (filled.length === 0) return null;
    const first = filled[0], last = filled[filled.length - 1];
    const minHalf = MIN_HALF_THICKNESS * rMax;
    const profile: SweepProfile = { radius: [], front: [], back: [] };
    for (let i = first; i <= last; i++) {
        if (!Number.isFinite(lo[i])) {
            // Interpolate across a radial gap between two measured bins.
            const below = filled.filter(j => j < i).pop()!, above = filled.find(j => j > i)!;
            const t = (i - below) / (above - below);
            lo[i] = lo[below] + (lo[above] - lo[below]) * t; hi[i] = hi[below] + (hi[above] - hi[below]) * t;
        }
        const mid = (lo[i] + hi[i]) / 2, half = Math.max(minHalf, (hi[i] - lo[i]) / 2);
        profile.radius.push(i === first ? first * rMax / SWEEP_BINS : (i + .5) * rMax / SWEEP_BINS);
        profile.front.push(mid + half); profile.back.push(mid - half);
    }
    profile.radius.push(rMax);
    const tip = (profile.front[profile.front.length - 1] + profile.back[profile.back.length - 1]) / 2;
    profile.front.push(tip + minHalf); profile.back.push(tip - minHalf);
    return profile;
}
function sampleTriangles(local: Float32Array, indices: ArrayLike<number>, spacing: number, visit: (x: number, y: number, z: number) => void): void {
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const i0 = indices[t] * 3, i1 = indices[t + 1] * 3, i2 = indices[t + 2] * 3;
        const edge = Math.max(
            Math.hypot(local[i1] - local[i0], local[i1 + 1] - local[i0 + 1], local[i1 + 2] - local[i0 + 2]),
            Math.hypot(local[i2] - local[i1], local[i2 + 1] - local[i1 + 1], local[i2 + 2] - local[i1 + 2]),
            Math.hypot(local[i0] - local[i2], local[i0 + 1] - local[i2 + 1], local[i0 + 2] - local[i2 + 2]));
        const n = spacing > 0 ? Math.min(24, Math.max(1, Math.ceil(edge / spacing))) : 1;
        for (let u = 0; u <= n; u++) for (let v = 0; u + v <= n; v++) {
            const b1 = u / n, b2 = v / n, b0 = 1 - b1 - b2;
            visit(local[i0] * b0 + local[i1] * b1 + local[i2] * b2,
                local[i0 + 1] * b0 + local[i1 + 1] * b1 + local[i2 + 1] * b2,
                local[i0 + 2] * b0 + local[i1 + 2] * b1 + local[i2 + 2] * b2);
        }
    }
}
/** Outer radius of a profile, in the same units. */
export function sweepRadius(profile: SweepProfile): number {
    return profile.radius[profile.radius.length - 1] ?? 0;
}
/** A blade-like lens when there is no geometry to measure: thick at the hub, thin at the tip, like the C172's authored sweep. */
export function fallbackSweepProfile(radius: number): SweepProfile {
    const r = [.12, .4, .7, 1].map(f => f * radius);
    const half = [.07, .05, .03, .012].map(f => f * radius);
    return { radius: r, front: half, back: half.map(h => -h) };
}
/**
 * Default high-RPM look: a semi-transparent, three-dimensional solid of
 * revolution enclosing everything the blades pass through in one turn. Unlike
 * a flat disc it keeps its thickness, twist envelope and coning when seen
 * edge-on. It is a sibling of the blade pivot with the pivot's own local
 * transform, so it is measured and drawn in the pivot's units and needs no
 * rotation of its own. `radius` (pivot-local units) is used only when the
 * pivot has no geometry to measure. Pass `measured` to reuse a profile.
 */
export function createPropellerSweep(node: TransformNode, scene: Scene, radius: number, axis = Vector3.Forward(), measured?: SweepProfile | null): Mesh {
    const a = axis.normalizeToNew();
    const profile = (measured === undefined ? measureSweepProfile(node, a) : measured) ?? fallbackSweepProfile(radius);
    // Closed loop: out along the front face, round the tip, back along the rear face.
    const loop: [number, number][] = [
        ...profile.radius.map((r, i): [number, number] => [r, profile.front[i]]),
        ...profile.radius.map((r, i): [number, number] => [r, profile.back[i]]).reverse(),
    ];
    const u = Math.abs(a.y) < .9 ? Vector3.Cross(a, Vector3.Up()).normalize() : Vector3.Cross(a, Vector3.Right()).normalize();
    const v = Vector3.Cross(a, u).normalize();
    const positions: number[] = [], indices: number[] = [];
    for (let s = 0; s < SWEEP_SEGMENTS; s++) {
        const angle = 2 * Math.PI * s / SWEEP_SEGMENTS, c = Math.cos(angle), sn = Math.sin(angle);
        for (const [r, h] of loop) {
            positions.push(a.x * h + (u.x * c + v.x * sn) * r, a.y * h + (u.y * c + v.y * sn) * r, a.z * h + (u.z * c + v.z * sn) * r);
        }
    }
    const m = loop.length;
    for (let s = 0; s < SWEEP_SEGMENTS; s++) {
        const next = (s + 1) % SWEEP_SEGMENTS;
        for (let k = 0; k < m; k++) {
            const k1 = (k + 1) % m;
            indices.push(s * m + k, s * m + k1, next * m + k1, s * m + k, next * m + k1, next * m + k);
        }
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const sweep = new Mesh('propeller-sweep', scene);
    Object.assign(new VertexData(), { positions, indices, normals }).applyToMesh(sweep);
    sweep.parent = node.parent;
    sweep.position.copyFrom(node.position);
    sweep.rotationQuaternion = (node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation)).clone();
    sweep.scaling.copyFrom(node.scaling);
    sweep.isPickable = false;
    const material = new StandardMaterial('propeller-sweep-mat', scene);
    // Both faces are drawn so either handedness reads the same; together they
    // give roughly the C172 authored sweep's 0.3 opacity.
    material.diffuseColor = new Color3(.1, .11, .12);
    material.specularColor = new Color3(.12, .12, .12);
    material.emissiveColor = new Color3(.04, .045, .05);
    material.alpha = .17;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    sweep.material = material;
    sweep.setEnabled(false);
    return sweep;
}
