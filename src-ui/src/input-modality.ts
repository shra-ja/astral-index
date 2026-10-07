// Whether the latest press came from the keyboard, so focus it caused can show
// keyboard-only cues such as tooltips. The browser's `:focus-visible` makes the same
// call, but WebKitGTK's automation never sets it, so it could not be tested natively.
let keyboard = false
const record = (event: Event) => (keyboard = event.type === 'keydown')
// Captured before any handler can stop them.
document.addEventListener('keydown', record, true)
document.addEventListener('pointerdown', record, true)

export function keyboardInput() {
  return keyboard
}
