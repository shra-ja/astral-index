// Runs before each frontend test file. The wall clock can step back, as under WSL
// every 30 seconds while the host corrects it, and `trigger` stamps each event with
// `Date.now() + 1`: Vue drops an event stamped no later than its handler was
// attached, so a step back between mounting and a click lost the click. Keeping
// `Date.now` from running backwards keeps every triggered event.
import { monotonic } from './monotonic-clock'

Date.now = monotonic(Date.now.bind(Date))
