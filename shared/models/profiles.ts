// Built-in course profiles and working modes. A profile configures the
// environment (expected runtime, defaults, tools); it never changes what a
// program means. See docs/COURSE_PROFILES.md.

export type Mode = "course" | "htdp" | "racket";

export interface StepperProviderInfo {
  id: string;
  /** Tool name shown in the UI. */
  name: string;
}

/** Stepper providers. Only the official HtDP stepper exists; a course
 * provider is added only when its rules are implemented and verified. */
export const STEPPER_PROVIDERS: Record<string, StepperProviderInfo> = {
  htdp: { id: "htdp", name: "HtDP Stepper" },
};

export interface CourseProfile {
  id: string;
  name: string;
  /** Status-bar label. */
  short: string;
  mode: Mode;
  /** Racket version the course uses, when known. */
  expectedRacketVersion?: string;
  /** Language preselected for new files. */
  defaultLanguage?: string;
  stepperProvider: keyof typeof STEPPER_PROVIDERS | null;
  tools: { stepper: boolean; tests: boolean; interactions: boolean; preflight: boolean };
}

export const PROFILES: CourseProfile[] = [
  {
    id: "waterloo-cs145",
    name: "Waterloo CS145",
    short: "CS145",
    mode: "course",
    expectedRacketVersion: "9.3",
    defaultLanguage: "beginner",
    stepperProvider: "htdp",
    tools: { stepper: true, tests: true, interactions: true, preflight: true },
  },
  {
    id: "waterloo-cs135",
    name: "Waterloo CS135",
    short: "CS135",
    mode: "course",
    // Not set: the course's Racket version has not been confirmed.
    defaultLanguage: "beginner",
    stepperProvider: "htdp",
    tools: { stepper: true, tests: true, interactions: true, preflight: true },
  },
  {
    id: "htdp",
    name: "Generic HtDP",
    short: "HtDP",
    mode: "htdp",
    defaultLanguage: "beginner",
    stepperProvider: "htdp",
    tools: { stepper: true, tests: true, interactions: true, preflight: false },
  },
  {
    id: "racket",
    name: "Racket",
    short: "Racket",
    mode: "racket",
    defaultLanguage: "racket",
    stepperProvider: "htdp",
    tools: { stepper: true, tests: true, interactions: true, preflight: false },
  },
];

export const DEFAULT_PROFILE_ID = "waterloo-cs145";

export function profileById(id: string | undefined): CourseProfile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID)!;
}

/** Short mismatch text, or null when the runtime matches or nothing is expected. */
export function versionMismatch(profile: CourseProfile, actual: string | undefined): string | null {
  if (!profile.expectedRacketVersion || !actual || actual === profile.expectedRacketVersion) return null;
  return `Expected Racket ${profile.expectedRacketVersion}`;
}
