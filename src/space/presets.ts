import { sampleInclination } from './sampling';

export type GalaxyClass = 'Sa' | 'Sb' | 'Sc' | 'SBa' | 'SBb' | 'SBc' | 'S0' | 'E' | 'Irr';

export type GalaxyPreset = {
  cls: GalaxyClass;
  /** Inclusive pitch-angle range in degrees; smaller = more tightly wound. */
  pitchDeg: [number, number];
  /** Allowed arm counts. */
  arms: number[];
  /** Bulge share of total light, B/T. */
  bulgeFraction: number;
  /** Disk scale height as a fraction of the radial scale length. */
  heightRatio: number;
  /** Relative number of HII knots, 0..1. */
  hiiAbundance: number;
  /** Peak extinction of the dust layer, 0..1. */
  dustOpacity: number;
  barred: boolean;
  coreColor: string;
  armColor: string;
};

/**
 * Morphology presets. Pitch angle and bulge fraction are what actually separate
 * the Hubble classes: Sa is tightly wound with a big red bulge, Sc is open-armed
 * with almost no bulge and vigorous star formation.
 */
export const GALAXY_PRESETS: Record<GalaxyClass, GalaxyPreset> = {
  Sa:  { cls: 'Sa',  pitchDeg: [8, 12],  arms: [2],    bulgeFraction: 0.50, heightRatio: 0.10, hiiAbundance: 0.20, dustOpacity: 0.75, barred: false, coreColor: '#ffd9a0', armColor: '#e8d0b0' },
  Sb:  { cls: 'Sb',  pitchDeg: [14, 20], arms: [2],    bulgeFraction: 0.25, heightRatio: 0.09, hiiAbundance: 0.55, dustOpacity: 0.55, barred: false, coreColor: '#ffe9c4', armColor: '#b8c8e8' },
  Sc:  { cls: 'Sc',  pitchDeg: [22, 28], arms: [2, 3, 4], bulgeFraction: 0.08, heightRatio: 0.08, hiiAbundance: 0.90, dustOpacity: 0.35, barred: false, coreColor: '#fff3e0', armColor: '#9cc0f0' },
  SBa: { cls: 'SBa', pitchDeg: [8, 12],  arms: [2],    bulgeFraction: 0.45, heightRatio: 0.10, hiiAbundance: 0.20, dustOpacity: 0.75, barred: true,  coreColor: '#ffd9a0', armColor: '#e8d0b0' },
  SBb: { cls: 'SBb', pitchDeg: [14, 20], arms: [2],    bulgeFraction: 0.22, heightRatio: 0.09, hiiAbundance: 0.55, dustOpacity: 0.55, barred: true,  coreColor: '#ffe9c4', armColor: '#b8c8e8' },
  SBc: { cls: 'SBc', pitchDeg: [22, 28], arms: [2, 3], bulgeFraction: 0.07, heightRatio: 0.08, hiiAbundance: 0.90, dustOpacity: 0.35, barred: true,  coreColor: '#fff3e0', armColor: '#9cc0f0' },
  S0:  { cls: 'S0',  pitchDeg: [0, 0],   arms: [0],    bulgeFraction: 0.60, heightRatio: 0.12, hiiAbundance: 0.00, dustOpacity: 0.25, barred: false, coreColor: '#ffe2b8', armColor: '#f0dcc0' },
  E:   { cls: 'E',   pitchDeg: [0, 0],   arms: [0],    bulgeFraction: 1.00, heightRatio: 0.00, hiiAbundance: 0.00, dustOpacity: 0.00, barred: false, coreColor: '#ffe2b8', armColor: '#ffe2b8' },
  Irr: { cls: 'Irr', pitchDeg: [0, 0],   arms: [0],    bulgeFraction: 0.02, heightRatio: 0.20, hiiAbundance: 1.00, dustOpacity: 0.30, barred: false, coreColor: '#e8f0ff', armColor: '#9cc4f0' },
};

/**
 * Spawn weights. Ratios WITHIN the galaxy category are the real bright-end mix
 * — spirals : ellipticals+S0 : irregulars of about 60 : 25 : 15. Weights ACROSS
 * categories (see the hero scheduler) are curated, because strict realism would
 * show mostly faint dwarfs and almost never anything dramatic.
 */
export const MORPHOLOGY_WEIGHTS: Record<GalaxyClass, number> = {
  Sa: 0.10, Sb: 0.16, Sc: 0.14,
  SBa: 0.06, SBb: 0.08, SBc: 0.06,
  S0: 0.10, E: 0.15,
  Irr: 0.15,
};

export function rollGalaxyClass(rng: () => number): GalaxyClass {
  const roll = rng();
  let acc = 0;
  for (const [cls, weight] of Object.entries(MORPHOLOGY_WEIGHTS) as [GalaxyClass, number][]) {
    acc += weight;
    if (roll < acc) return cls;
  }
  return 'Sb';
}

export type GalaxyInstance = {
  preset: GalaxyPreset;
  pitchRad: number;
  arms: number;
  bulgeFraction: number;
  inclination: number;
  /** Rotation of the disk's major axis in the sky plane, radians. */
  positionAngle: number;
  /** Overall size multiplier, 0.7..1.4. */
  scale: number;
};

/**
 * Roll one concrete galaxy: a preset plus per-instance jitter. Inclination uses
 * the true random-orientation distribution, so edge-on views turn up at their
 * real ~17% rate rather than being a special case.
 */
export function rollGalaxyInstance(rng: () => number): GalaxyInstance {
  const preset = GALAXY_PRESETS[rollGalaxyClass(rng)];
  const [lo, hi] = preset.pitchDeg;
  const pitchDeg = lo + rng() * (hi - lo);
  return {
    preset,
    pitchRad: (pitchDeg * Math.PI) / 180,
    arms: preset.arms[Math.floor(rng() * preset.arms.length)],
    // B/T jitter of +/-20%, clamped so it stays a fraction.
    bulgeFraction: Math.min(1, Math.max(0, preset.bulgeFraction * (0.8 + rng() * 0.4))),
    inclination: sampleInclination(rng),
    positionAngle: rng() * Math.PI * 2,
    scale: 0.7 + rng() * 0.7,
  };
}
