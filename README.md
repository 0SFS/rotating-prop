# Rotating prop

Shared rotating-propeller presentation for 0SFS aircraft: the C172 and the quadcopters. The declarative mod is `0sfs/rotating-prop`; the local package is `@0sfs/rotating-prop`. It draws propellers and never integrates physics or changes thrust.

This is a local Git repository with no commits or remote yet. It is meant to become `0SFS/rotating-prop`.

## What a propeller shows

| Shaft speed | Default | With **Aircraft → Flat propeller discs** (opt-in, Off by default) |
| --- | --- | --- |
| Below the display alias limit | Individual 3D blades, turning | Same |
| Above it | **Semi-transparent 3D swept volume**: the solid the blades pass through in one turn | Flat semi-transparent disc (cheaper) |

The alias limit is π / blades / frameSeconds, the speed at which the blades advance half a repeat per displayed frame (about 900 RPM for two blades at 60 fps). A 0.8 hysteresis keeps the choice steady. Above the limit, drawn blades would strobe, stand still or turn backwards. Phase keeps integrating under either look, and pause holds it.

The C172 ships an authored sweep, `Propeller_Disc`, generated from its blade sections (see `C172/planes/Cessna_172/agent_workspace/scripts/generate_c172.py`). Other propellers get the same kind of volume generated at runtime from their own blade meshes.

## Modules

- `src/motion.ts`: `stepRotatingProp` (phase, alias limit, hysteresis), `maxReadableRadPerSec`, `smoothFrameSeconds`, `propPresentation`. No Babylon dependency.
- `src/sweep.ts` (also exported as `@0sfs/rotating-prop/sweep`): the 3D swept-volume generator. `measureSweepProfile` samples every blade triangle under a pivot and records, per radius, the furthest forward and aft reach along the shaft. `createPropellerSweep` revolves that profile into a closed, double-sided, semi-transparent lens. The lens is thick where the blades are pitched and thin at the tips, and it keeps that thickness edge-on. A pivot with no geometry gets a C172-proportioned lens from the declared radius.
- `src/disc.ts`: `createPropellerDisc`, the opt-in flat look.
- `src/binding.ts`: `createRotatingProp`, one authored blade pivot. `update(rate, dt, held, flatDisc = false)` turns the blades, hides them above the alias limit, and lazily creates the sweep or disc. Both use the radius measured from the blades, so an undersized declared radius does not shrink them. `dispose()` frees the generated meshes and re-enables the authored blades.

Generated meshes are siblings of the blade pivot, so hiding the pivot does not hide them, and scaled imported assets keep metre sizes.

## Consumers

- `aircraft/src/aircraftAnimation.ts` (C172 and other propeller planes): authored `Propeller_Disc` if present, otherwise `createPropellerSweep`; optional flat disc.
- `fly/src/flight/drone/droneFeature.ts` (lazy drone chunk only): one `createRotatingProp` per declared rotor pivot, HD or procedural.
- Fly's shared setting `osfs.aircraft.propellerDiscs` (**Aircraft → Flat propeller discs**) selects the flat disc live for planes and drones.

Quadcopter RPM is each rotor's simulated speed from `@0sfs/multirotor`, the same speed that makes its thrust. The rotor follows the flight controller's command with a first-order lag; the ESC and motor are not simulated, so this is not ESC telemetry. Spin direction comes from the airframe's rotor layout.

`direction` is the sign of the turn about the binding's `axis`, by the right-hand rule, in the aircraft's right-handed model frame: +X left, +Y up, +Z forward. About an upward axis, +1 is counter-clockwise seen from above. A quadcopter rotor whose physical `spin` is +1, clockwise from above, therefore gets `direction: -1`. [SPEC-360-DRONE section 4.8](https://github.com/0SFS/docs/blob/main/proposals/SPEC-360-DRONE.md#48-frames-and-signs) has the frames.

## Tests

`tests/rotatingProp.test.ts` runs from the fly checkout, which includes `../rotating-prop/tests`:

```sh
cd ~/gh/0sfs/fly && npx vitest run --configLoader native ../rotating-prop/tests
```

Topics: `0sfs-mod` and `0sfs-component-mod`. [Modding guide](https://github.com/0SFS/docs/blob/main/modding.md) describes discovery and installation.
