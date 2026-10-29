import { Color3, CreateDisc, Mesh, Quaternion, StandardMaterial, Vector3, type Scene, type TransformNode } from '@babylonjs/core';
/** Opt-in flat, two-dimensional stand-in. The default high-RPM look is `createPropellerSweep`. */
export function createPropellerDisc(node: TransformNode, scene: Scene, radius: number, axis = Vector3.Forward(), restRotation?: Quaternion): Mesh {
    const disc = CreateDisc('propeller-disc', { radius, tessellation: 24, sideOrientation: Mesh.DOUBLESIDE }, scene);
    disc.parent = node.parent;
    disc.position.copyFrom(node.position);
    const turn = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(Vector3.Forward(), axis.normalizeToNew(), turn);
    disc.rotationQuaternion = (restRotation ?? node.rotationQuaternion ?? Quaternion.Identity()).multiply(turn);
    disc.isPickable = false;
    const material = new StandardMaterial('propeller-disc-mat', scene);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = new Color3(.07, .08, .09);
    material.disableLighting = true;
    material.alpha = .28;
    material.backFaceCulling = false;
    disc.material = material;
    disc.setEnabled(false);
    return disc;
}
