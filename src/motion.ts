/**
 * Shaft phase and display-alias decisions shared by every rotating propeller.
 * No Babylon dependency: callers integrate simulated time only.
 */
export const DISC_HYSTERESIS = .8;
export function maxReadableRadPerSec(repeats: number, frameSeconds: number): number {
    return repeats < 1 || frameSeconds <= 0 ? Infinity : Math.PI / repeats / frameSeconds;
}
export function smoothFrameSeconds(previous: number, dt: number): number {
    return Number.isFinite(dt) && dt > 0 ? previous + (dt - previous) * .15 : previous;
}
export interface PropMotion {
    angleRad: number;
    /** True once the blades turn too fast for the display to draw them honestly. */
    blurred: boolean;
}
/** What a propeller draws. `sweep` is the default high-RPM look; `disc` is the opt-in flat optimization. */
export type PropPresentation = 'blades' | 'sweep' | 'disc';
/**
 * Integrate simulated shaft motion and decide whether the blades still read.
 * Above π / blades / frameSeconds (0.8 hysteresis) the caller shows a swept
 * volume instead of strobing blades; the phase keeps advancing either way.
 */
export function stepRotatingProp(state: PropMotion, rate: number, dt: number, frameSeconds: number, blades: number, held: boolean): PropMotion {
    const speed = Number.isFinite(rate) ? rate : 0;
    const limit = maxReadableRadPerSec(blades, frameSeconds);
    return {
        angleRad: !held && Number.isFinite(dt) && dt > 0 ? (state.angleRad + speed * dt) % (2 * Math.PI) : state.angleRad,
        blurred: Math.abs(speed) > limit * (state.blurred ? DISC_HYSTERESIS : 1),
    };
}
export function propPresentation(blurred: boolean, flatDisc: boolean): PropPresentation {
    return !blurred ? 'blades' : flatDisc ? 'disc' : 'sweep';
}
