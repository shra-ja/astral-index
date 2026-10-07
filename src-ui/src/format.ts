import type { SoftPity, StoredRoll } from './commands'
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

const percent = new Intl.NumberFormat('en', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "1.48%": `count` as a share of `total`, never shown as none when there is some; none without a total. */
export function rate(count: number, total: number) {
  if (total === 0) return undefined
  const shown = percent.format(count / total)
  return count > 0 && shown === '0.00%' ? '<0.01%' : shown
}

/**
 * "26 Apr 2023 –", "28 Sep 2026": the dates of the oldest and newest stored rolls,
 * split so the range only breaks at its dash, or "None yet" without rolls.
 */
export function storedPeriod(first: string | null, last: string | null) {
  if (first === null || last === null) return ['None yet']
  return [`${serverDate(first)} –`, serverDate(last)]
}

/** A day as `YYYY-MM-DD`, from a date read in UTC. */
const isoDay = (date: Date) => date.toISOString().slice(0, 10)

/** Year, month (1–12) and day of a `YYYY-MM-DD` day. */
const partsOf = (day: string) => day.split('-').map(Number) as [number, number, number]

/**
 * Today's date in the server's time when its UTC offset in hours is known,
 * otherwise this device's, as `YYYY-MM-DD`.
 */
export function serverToday(timezone: number | null, now = new Date()) {
  if (timezone !== null) return isoDay(new Date(now.getTime() + timezone * 3_600_000))
  return isoDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

/** The day `count` days before `day`. */
function daysBefore(day: string, count: number) {
  const [year, month, date] = partsOf(day)
  return isoDay(new Date(Date.UTC(year, month - 1, date - count)))
}

/** The same day `count` months before `day`, or that month's last day if it is shorter. */
function monthsBefore(day: string, count: number) {
  const [year, month, date] = partsOf(day)
  const last = new Date(Date.UTC(year, month - count, 0)).getUTCDate()
  return isoDay(new Date(Date.UTC(year, month - 1 - count, Math.min(date, last))))
}

/** A date range: its first and last days, each left open when absent. */
export interface DateRange {
  from?: string
  to?: string
}

/** The date filter's quick ranges, each counting today and open at its end. */
export function quickRanges(today: string): (DateRange & { label: string })[] {
  return [
    { label: 'All dates', from: undefined, to: undefined },
    { label: 'Last 7 days', from: daysBefore(today, 6), to: undefined },
    { label: 'Last 30 days', from: daysBefore(today, 29), to: undefined },
    { label: 'Last 6 months', from: monthsBefore(today, 6), to: undefined },
    { label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: undefined },
  ]
}

/** The date filter button's text: a quick range's name, or the days chosen. */
export function dateRangeLabel(from: string | undefined, to: string | undefined, today: string) {
  const quick = quickRanges(today).find((range) => range.from === from && range.to === to)
  if (quick) return quick.label
  if (from && to) return `${serverDate(from)} – ${serverDate(to)}`
  if (from) return `From ${serverDate(from)}`
  // With neither day chosen, the first quick range names it, so only `to` is left.
  return `Until ${serverDate(String(to))}`
}

/** How close a 5★ came to soft pity (decision 0020). */
export type PityBand = 'early' | 'near' | 'soft'

/** The band of a 5★'s pity by the category's thresholds; none when they aren't known. */
export function pityBand(pity: number, softPity: SoftPity | null): PityBand | undefined {
  if (!softPity) return undefined
  if (pity >= softPity.soft) return 'soft'
  return pity >= softPity.near ? 'near' : 'early'
}

/** A roll's pity band: only 5★ pity has one (decision 0013). */
export const rollBand = (
  roll: Pick<StoredRoll, 'rank_type' | 'pity'>,
  softPity?: SoftPity | null,
) => (roll.rank_type === '5' ? pityBand(roll.pity, softPity ?? null) : undefined)

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

/** The History screen's layouts, in the switch's order (decision 0013). */
export const layouts = [
  { id: 'list', label: 'List' },
  { id: 'grid', label: 'Grid' },
] as const
export type Layout = (typeof layouts)[number]['id']

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
