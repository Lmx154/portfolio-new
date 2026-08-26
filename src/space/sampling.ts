/**
 * Inverse-CDF samplers for the density laws the galaxy builder uses. Each is
 * exact — no rejection loops, no numerical inversion — which is why sampling a
 * 70k-point disk costs microseconds.
 *
 * Drawing positions from these distributions is also what makes the resolved
 * star density follow the light profile automatically: the dots ARE the
 * profile, rather than a uniform grid masked by brightness afterwards.
 */

/**
 * Exponential disk, Sigma(R) = Sigma0 * exp(-R/h).
 *
 * Mass in an annulus goes as Sigma(R) * 2*pi*R dR ∝ R*exp(-R/h) dR, which is
 * exactly Gamma(k=2, theta=h). A Gamma(2, h) draw is the sum of two Exp(h)
 * draws, and Exp(h) = -h*ln(u).
 */
export function sampleExponentialDiskRadius(rng: () => number, h: number): number {
  return -h * (Math.log(1 - rng()) + Math.log(1 - rng()));
}

/**
 * Isothermal sheet, rho(z) ∝ sech^2(z/z0).
 * CDF is (1 + tanh(z/z0))/2, so z = z0 * atanh(2u - 1).
 */
export function sampleSech2Height(rng: () => number, z0: number): number {
  // Guard the endpoints: atanh(±1) is infinite, and a PRNG returning exactly 0
  // would otherwise emit an infinite height that poisons the whole buffer.
  const t = Math.min(1 - 1e-12, Math.max(-1 + 1e-12, rng() * 2 - 1));
  return z0 * Math.atanh(t);
}

/**
 * Hernquist sphere, rho(r) = M*a / (2*pi*r*(r+a)^3).
 *
 * M(<r)/M = r^2/(r+a)^2, which inverts to r = a*sqrt(u)/(1 - sqrt(u)).
 * Chosen over a numerically-inverted Sersic because it has this closed form and
 * still projects to very nearly a de Vaucouleurs r^(1/4) profile.
 */
export function sampleHernquistRadius(rng: () => number, a: number): number {
  const s = Math.sqrt(rng());
  return (a * s) / (1 - s);
}

/**
 * Plummer sphere, rho(r) ∝ (1 + r^2/a^2)^(-5/2). Used for globular clusters.
 * M(<r)/M = r^3/(r^2+a^2)^(3/2) inverts to a*u^(1/3)/sqrt(1 - u^(2/3)).
 */
export function samplePlummerRadius(rng: () => number, a: number): number {
  const c = Math.cbrt(rng());
  return (a * c) / Math.sqrt(1 - c * c);
}

/**
 * Inclination of a randomly oriented disk, in radians on [0, pi/2].
 * For uniform orientation on the sphere cos(i) is uniform, so i = acos(u).
 * This yields edge-on (i > 80 deg) about 17% of the time and near-face-on
 * only about 6% — the real distribution, and the reason no separate "edge-on"
 * preset is needed.
 */
export function sampleInclination(rng: () => number): number {
  return Math.acos(rng());
}

/** A direction uniformly distributed on the unit sphere. */
export function sampleUnitVector(rng: () => number): [number, number, number] {
  const z = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(t), r * Math.sin(t), z];
}

/**
 * Stellar brightness from a power-law luminosity function with index `alpha`
 * (alpha < -1 → many faint, few bright). Inverse-CDF of a bounded power law.
 */
export function samplePowerLawBrightness(
  rng: () => number,
  min: number,
  max: number,
  alpha: number,
): number {
  const p = alpha + 1;
  // alpha === -1 makes the pdf 1/x, whose inverse-CDF is log-uniform. The
  // general form below divides by p, so it would return NaN here.
  if (p === 0) return min * Math.pow(max / min, rng());
  const lo = Math.pow(min, p);
  const hi = Math.pow(max, p);
  return Math.pow(lo + rng() * (hi - lo), 1 / p);
}

/**
 * Azimuth of a logarithmic spiral arm at `radius`: theta = ln(R/R0)/tan(p).
 * Smaller pitch angle `p` → more tightly wound (Sa ~10 deg, Sc ~25 deg).
 */
export function spiralArmAngle(radius: number, r0: number, pitchRad: number): number {
  return Math.log(Math.max(radius, 1e-6) / r0) / Math.tan(pitchRad);
}
