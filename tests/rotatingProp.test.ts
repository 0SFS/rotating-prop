import { describe, it, expect } from 'vitest';
import { Mesh, MeshBuilder, NullEngine, Quaternion, Scene, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { createRotatingProp, measureSweepProfile, propPresentation, stepRotatingProp, maxReadableRadPerSec } from '../src';
/** Radius about, thickness along and centre offset along world Y through `hub`. */
function worldExtent(mesh: Mesh, hub: Vector3) {
    const world = mesh.computeWorldMatrix(true), positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    let radius = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        const p = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world).subtract(hub);
        radius = Math.max(radius, Math.hypot(p.x, p.z)); lo = Math.min(lo, p.y); hi = Math.max(hi, p.y);
    }
    return { radius, thickness: hi - lo, centre: (hi + lo) / 2 };
}
describe('rotating prop', () => {
    it('retains the C172 anti-alias threshold and hysteresis, and freezes phase when held', () => {
        const limit = maxReadableRadPerSec(2, 1 / 60);
        const high = stepRotatingProp({ angleRad: 0, blurred: false }, limit * 1.1, 1 / 60, 1 / 60, 2, false);
        expect(high.blurred).toBe(true);
        expect(stepRotatingProp(high, limit * .9, 1 / 60, 1 / 60, 2, true)).toEqual({ ...high, blurred: true });
        expect(stepRotatingProp(high, limit * .5, 0, 1 / 60, 2, false).blurred).toBe(false);
        expect(propPresentation(false, true)).toBe('blades');
        expect(propPresentation(true, false)).toBe('sweep');
        expect(propPresentation(true, true)).toBe('disc');
    });
    it('turns around any declared axis and swaps fast blades for a 3D sweep by default', () => {
        const engine = new NullEngine(), scene = new Scene(engine), node = new TransformNode('rotor', scene);
        const prop = createRotatingProp({ node, axis: Vector3.Up(), radius: .05, blades: 2 });
        try {
            prop.update(10, .05);
            expect(Math.abs(node.rotationQuaternion!.y)).toBeGreaterThan(0);
            expect(prop.getState().presentation).toBe('blades');
            prop.update(6000 * Math.PI / 30, 1 / 60);
            expect(prop.getState().presentation).toBe('sweep');
            expect(node.isEnabled()).toBe(false);
            expect(scene.getMeshByName('propeller-sweep')!.isEnabled()).toBe(true);
            expect(scene.getMeshByName('propeller-disc')).toBeNull();
            const state = prop.getState();
            prop.update(6000 * Math.PI / 30, .05, true);
            expect(prop.getState().angleRad).toBe(state.angleRad);
            prop.update(10, 1 / 60);
            expect(node.isEnabled()).toBe(true);
            expect(scene.getMeshByName('propeller-sweep')!.isEnabled()).toBe(false);
        }
        finally {
            prop.dispose();
            expect(scene.getMeshByName('propeller-sweep')).toBeNull();
            scene.dispose();
            engine.dispose();
        }
    });
    it('uses the flat disc only when opted in, live, without changing phase', () => {
        const engine = new NullEngine(), scene = new Scene(engine), node = new TransformNode('rotor', scene);
        const prop = createRotatingProp({ node, axis: Vector3.Up(), radius: .05, blades: 2 });
        try {
            prop.update(1000, 1 / 60, false, true);
            expect(prop.getState().presentation).toBe('disc');
            expect(scene.getMeshByName('propeller-disc')!.isEnabled()).toBe(true);
            expect(scene.getMeshByName('propeller-sweep')).toBeNull();
            const angle = prop.getState().angleRad;
            prop.update(1000, 0, true, false);
            expect(prop.getState().angleRad).toBe(angle);
            expect(scene.getMeshByName('propeller-disc')!.isEnabled()).toBe(false);
            expect(scene.getMeshByName('propeller-sweep')!.isEnabled()).toBe(true);
            expect(node.isEnabled()).toBe(false);
            prop.dispose();
            expect(node.isEnabled()).toBe(true);
            expect(scene.getMeshByName('propeller-disc')).toBeNull();
        } finally { prop.dispose(); scene.dispose(); engine.dispose(); }
    });
    it('keeps the blur radius in metres for scaled imported assets', () => {
        const engine = new NullEngine(), scene = new Scene(engine);
        const frame = new TransformNode('millimetre-asset', scene);
        frame.scaling.setAll(.0005);
        const node = new TransformNode('rotor', scene);
        node.parent = frame;
        const prop = createRotatingProp({ node, axis: Vector3.Up(), radius: .05, blades: 2 });
        try {
            prop.update(1000, 1 / 60, false, true);
            const disc = scene.getMeshByName('propeller-disc')!;
            disc.computeWorldMatrix(true);
            expect(disc.getBoundingInfo().boundingBox.extendSizeWorld.x).toBeCloseTo(.05);
            expect(disc.getBoundingInfo().boundingBox.extendSizeWorld.z).toBeCloseTo(.05);
            prop.update(1000, 1 / 60);
            const sweep = worldExtent(scene.getMeshByName('propeller-sweep')! as Mesh, Vector3.Zero());
            expect(sweep.radius).toBeCloseTo(.05, 4);
            // A volume, not a flat disc: it has thickness along the shaft.
            expect(sweep.thickness).toBeGreaterThan(.005);
        } finally { prop.dispose(); scene.dispose(); engine.dispose(); }
    });
    it('measures the sweep from the blades it replaces, including pitch thickness', () => {
        const engine = new NullEngine(), scene = new Scene(engine);
        const frame = new TransformNode('hd-asset', scene);
        frame.scaling.setAll(.001);
        const node = new TransformNode('rotor', scene);
        node.parent = frame;
        node.position.set(80, 20, -60);
        // Two pitched blades, 120 units tip to tip, 10 units deep along the shaft.
        const blades = MeshBuilder.CreateBox('blades', { width: 120, height: 2, depth: 14 }, scene);
        blades.parent = node;
        blades.rotation.x = .6;
        const profile = measureSweepProfile(node, Vector3.Up())!;
        expect(profile.radius[profile.radius.length - 1]).toBeCloseTo(Math.hypot(60, 7 * Math.cos(.6) + 1 * Math.sin(.6)), 0);
        const thickest = Math.max(...profile.front.map((front, i) => front - profile.back[i]));
        expect(thickest).toBeGreaterThan(8);
        expect(thickest).toBeLessThan(10);
        const prop = createRotatingProp({ node, axis: Vector3.Up(), radius: .06, blades: 2 });
        try {
            prop.update(6000 * Math.PI / 30, 1 / 60);
            const sweep = worldExtent(scene.getMeshByName('propeller-sweep')! as Mesh, new Vector3(.08, .02, -.06));
            expect(sweep.radius).toBeCloseTo(profile.radius[profile.radius.length - 1] / 1000, 5);
            expect(sweep.thickness).toBeCloseTo(thickest / 1000, 5);
            expect(Math.abs(sweep.centre)).toBeLessThan(.0005);
            expect(blades.isEnabled(false)).toBe(true);
            expect(node.isEnabled()).toBe(false);
        } finally { prop.dispose(); scene.dispose(); engine.dispose(); }
    });
    it('sizes the opt-in flat disc from the blades, not an undersized declared radius', () => {
        const engine = new NullEngine(), scene = new Scene(engine), node = new TransformNode('rotor', scene);
        const blades = MeshBuilder.CreateBox('blades', { width: .12, height: .002, depth: .012 }, scene);
        blades.parent = node;
        const prop = createRotatingProp({ node, axis: Vector3.Up(), radius: .045, blades: 2 });
        try {
            prop.update(1000, 1 / 60, false, true);
            const disc = worldExtent(scene.getMeshByName('propeller-disc')! as Mesh, Vector3.Zero());
            expect(disc.radius).toBeCloseTo(Math.hypot(.06, .006), 3);
            prop.update(1000, 1 / 60);
            expect(worldExtent(scene.getMeshByName('propeller-sweep')! as Mesh, Vector3.Zero()).radius).toBeCloseTo(disc.radius, 3);
        } finally { prop.dispose(); scene.dispose(); engine.dispose(); }
    });
});
