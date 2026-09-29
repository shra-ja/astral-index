// Shared display text, kept out of components so screens can be rearranged freely.

/** Warp names by `gacha_type`, as the game shows them. */
export const warps: Record<string, string> = {
  1: 'Stellar Warp', 2: 'Departure Warp', 11: 'Character Event Warp', 12: 'Light Cone Event Warp',
  21: 'Character Collaboration Warp', 22: 'Light Cone Collaboration Warp',
};

/** "1 roll", "1,532 rolls". */
export const plural = (count: number, noun: string) =>
  `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`;
