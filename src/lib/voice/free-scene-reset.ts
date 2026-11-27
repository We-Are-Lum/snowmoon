/** The admins' reset of a person's free Ephelion picture (Nate, 2026-11-27). DRAFT wording (the agent's), admins only. */
export const RESET_WORDING = {
  heading: 'Ephelion: reset a free picture',
  intro: 'For someone who lost their free picture of their own scene. They can make one again; the reset is logged with who and when.',
  label: 'Their number (FID, or a wallet, Lens or Bluesky account’s number)',
  button: 'Reset',
  ask: (n: string) => `Reset the free picture of ${n}? They can make one again.`,
  yes: 'Reset it',
  no: 'Cancel',
  done: (n: string) => `Reset: ${n} can make their free picture again.`,
  nothing: (n: string) => `Nothing to reset: ${n} hasn’t made or started one.`,
  badNumber: 'A person’s number: digits, with a minus for a wallet, Lens or Bluesky account; not 0.',
  failed: 'The reset didn’t go through (it needs NEXT_ephelion_scene_reset.sql). Nothing changed.',
  notHere: 'Not available here.',
} as const;
