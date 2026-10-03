// Shared display text, kept out of components so screens can be rearranged freely.

/** Warp names by `gacha_type`, as the game shows them. */
export const warps: Record<string, string> = {
  1: 'Stellar Warp',
  2: 'Departure Warp',
  11: 'Character Event Warp',
  12: 'Light Cone Event Warp',
  21: 'Character Collaboration Warp',
  22: 'Light Cone Collaboration Warp',
}

/** "1 roll", "1,532 rolls". */
export const plural = (count: number, noun: string) =>
  `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`

/** Supported games by ID, as their names are written. */
export const games = {
  'genshin-impact': 'Genshin Impact',
  'honkai-star-rail': 'Honkai: Star Rail',
} as const
export type Game = keyof typeof games

/** The screens each game has. */
export type Screen = 'history' | 'import'

/** What each game calls a roll, as in "Warp History". */
export const terms: Record<Game, 'Wish' | 'Warp'> = {
  'genshin-impact': 'Wish',
  'honkai-star-rail': 'Warp',
}

/** Short marks that stand for each game where its name does not fit. */
export const monograms: Record<Game, string> = {
  'genshin-impact': 'GI',
  'honkai-star-rail': 'SR',
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/**
 * "21 Sep 2026, 14:13" for a time in Unix seconds, in the device's time zone unless
 * another is given.
 */
export function localDateTime(seconds: number, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(seconds * 1000)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)!.value
  return `${part('day')} ${months[Number(part('month')) - 1]} ${part('year')}, ${part('hour')}:${part('minute')}`
}

/** "2 Apr 2026", from a server time such as "2026-04-02 10:00:00", read as written. */
export function serverDate(time: string) {
  const [year, month, day] = time.slice(0, 10).split('-')
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`
}

/** "28 Sep 2026, 21:14:03", from a server time, read as written. */
export const serverDateTime = (time: string) => `${serverDate(time)}, ${time.slice(11)}`

/** "UTC+8" for a server's offset in hours, or "server time" when it is unknown. */
export function utcOffset(timezone: number | null) {
  if (timezone === null) return 'server time'
  if (timezone === 0) return 'UTC'
  return `UTC${timezone > 0 ? '+' : '−'}${Math.abs(timezone)}`
}

/** The History screen's category tabs, in the design's order, with short names. */
export const categoryTabs = [
  { gacha_type: '11', label: 'Character Event' },
  { gacha_type: '12', label: 'Light Cone Event' },
  { gacha_type: '1', label: 'Stellar' },
  { gacha_type: '2', label: 'Departure' },
  { gacha_type: '21', label: 'Character Collab' },
  { gacha_type: '22', label: 'Light Cone Collab' },
] as const

/** Up to two initials for an item's placeholder icon, skipping words without letters. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

/** Star Rail servers by the `region` HoYoverse reports, as the game names them. */
const servers: Record<string, string> = {
  prod_official_usa: 'America',
  prod_official_eur: 'Europe',
  prod_official_asia: 'Asia',
  prod_official_cht: 'TW, HK, MO',
  prod_gf_cn: 'China',
  prod_qd_cn: 'China (Bilibili)',
}
/** "Asia" for `prod_official_asia`; a server we don't know shows as given. */
export const serverName = (server: string) => servers[server] ?? server

/** The `gacha_type` codes in the order retrieval requests them. */
export const retrievalOrder = ['1', '2', '11', '12', '21', '22']
