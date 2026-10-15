// Smoke-tests the release executable on Windows, the first release's only OS, without
// WebDriver: it opens its window with the app's icon and no console, keeps its data
// in the local data folder or, in portable mode, beside itself, and closes cleanly
// (decision 0029). The UI is tested end to end on Linux.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { outputs } from '../../tooling/outputs'

const release = resolve('src-tauri/target/release/astral-index.exe')
const icon = resolve('src-tauri/icons/icon.ico')
const local = join(process.env.LOCALAPPDATA ?? '', 'Astral-Index')
// A copy of the executable in a folder of its own, where a `data` folder switches on
// portable mode.
const folder = resolve(outputs().results, 'windows-smoke')
const executable = join(folder, 'astral-index.exe')
const portable = join(folder, 'data')
// WebView2's processes let go of the folders shortly after the app exits.
const remove = (path: string) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })

beforeAll(() => {
  // The app uses the machine's own local data folder, so run only on a disposable runner.
  if (process.platform !== 'win32' || process.env.CI !== 'true') {
    throw new Error('run the Windows smoke test only in Windows CI')
  }
  remove(folder)
  mkdirSync(folder, { recursive: true })
  copyFileSync(release, executable)
})

// Stop at the first error, which PowerShell would otherwise report and carry on after.
const powershell = (script: string) =>
  execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'\n${script}`],
    {
      encoding: 'utf8',
    },
  ).trim()

let app: ChildProcess | undefined
afterEach(() => {
  if (app?.exitCode === null) execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'])
  app = undefined
})

/** Start the copied executable and wait for its window. */
async function start() {
  app = spawn(executable, [], { stdio: 'ignore' })
  const pid = app.pid!
  await expect
    .poll(() => powershell(`(Get-Process -Id ${pid}).MainWindowTitle`), { timeout: 30000 })
    .toBe('Astral Index')
  return pid
}

/** Close the window as its close button does, and wait for a clean exit. */
async function close(pid: number) {
  const exited = once(app!, 'exit')
  powershell(`[void](Get-Process -Id ${pid}).CloseMainWindow()`)
  const [code] = (await exited) as [number | null]
  expect(code).toBe(0)
}

/**
 * The committed icon.ico's image at `size`, saved as a PNG file. Its images are
 * PNG-compressed, which System.Drawing's Icon misreads, so the entry is read here.
 */
function committedIcon(size: number) {
  const ico = readFileSync(icon)
  for (let entry = 0; entry < ico.readUInt16LE(4); entry++) {
    const at = 6 + 16 * entry
    if ((ico[at] || 256) !== size) continue
    const path = join(folder, `icon-${size}.png`)
    writeFileSync(
      path,
      ico.subarray(ico.readUInt32LE(at + 12), ico.readUInt32LE(at + 12) + ico.readUInt32LE(at + 8)),
    )
    return path
  }
  throw new Error(`icon.ico has no ${size}px image`)
}

// How many pixels differ by more than rounding (2 in any channel) between the
// committed icon and one the system draws at `size`, with the first that differs: the
// window's or the executable's, as Explorer shows it. Tauri gives the window one icon,
// loaded at the system's large icon size, which tao sets in the window's small slot,
// the one its title bar draws; the large slot stays empty.
const iconDifference = (pid: number, source: 'window' | 'executable', size: number) =>
  powershell(`
      Add-Type -AssemblyName System.Drawing
      Add-Type @'
        using System;
        using System.Runtime.InteropServices;
        public static class Win32 {
          [DllImport("user32.dll", EntryPoint = "SendMessageW")] public static extern IntPtr SendMessage(IntPtr window, int message, IntPtr w, IntPtr l);
          [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")] public static extern IntPtr GetClassLongPtr(IntPtr window, int index);
          [DllImport("user32.dll", EntryPoint = "GetClassNameW", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr window, System.Text.StringBuilder name, int size);
        }
'@
      if ('${source}' -eq 'window') {
        $window = (Get-Process -Id ${pid}).MainWindowHandle
        $sent = [Win32]::SendMessage($window, 0x7F, [IntPtr]0, [IntPtr]0)
        $class = [Win32]::GetClassLongPtr($window, -34)
        $handle = if ($sent -ne [IntPtr]::Zero) { $sent } else { $class }
        if ($handle -eq [IntPtr]::Zero) {
          $name = New-Object System.Text.StringBuilder 256
          [void][Win32]::GetClassName($window, $name, 256)
          throw "no icon: window $window of class '$name', WM_GETICON $sent, class icon $class"
        }
        $actual = [System.Drawing.Icon]::FromHandle($handle)
      } else {
        $actual = [System.Drawing.Icon]::ExtractAssociatedIcon('${executable}')
      }
      $drawn = New-Object System.Drawing.Bitmap ${size}, ${size}
      [System.Drawing.Graphics]::FromImage($drawn).DrawIcon($actual, (New-Object System.Drawing.Rectangle 0, 0, ${size}, ${size}))
      $expected = New-Object System.Drawing.Bitmap '${committedIcon(size)}'
      $different = 0
      $first = ''
      for ($x = 0; $x -lt ${size}; $x++) {
        for ($y = 0; $y -lt ${size}; $y++) {
          $a = $drawn.GetPixel($x, $y); $e = $expected.GetPixel($x, $y)
          $apart = [Math]::Max([Math]::Max([Math]::Abs($a.A - $e.A), [Math]::Abs($a.R - $e.R)), [Math]::Max([Math]::Abs($a.G - $e.G), [Math]::Abs($a.B - $e.B)))
          if ($apart -gt 2) {
            $different++
            if (-not $first) { $first = " first at $x,$y $a, expected $e ($($actual.Width)x$($actual.Height))" }
          }
        }
      }
      "$different$first"
    `)

test('the release executable is a windowed app, with no console', () => {
  // The PE header's subsystem: 2 is the Windows GUI, 3 the console.
  const image = readFileSync(release)
  const header = image.readUInt32LE(0x3c)
  expect(image.toString('latin1', header, header + 4)).toBe('PE\0\0')
  expect(image.readUInt16LE(header + 24 + 68)).toBe(2)
})

test('installed, it keeps its history and webview profile in the local data folder, shows its icon and closes cleanly', async () => {
  remove(portable)
  remove(local)
  const pid = await start()
  // The History screen reads saved history on opening, which creates the database.
  await expect.poll(() => existsSync(join(local, 'history.sqlite')), { timeout: 15000 }).toBe(true)
  expect(existsSync(join(local, 'EBWebView'))).toBe(true)
  expect(existsSync(portable)).toBe(false)
  // Explorer and the title bar show the committed icon.
  expect(iconDifference(pid, 'executable', 32)).toBe('0')
  expect(iconDifference(pid, 'window', 32)).toBe('0')
  await close(pid)
}, 90000)

test('with a data folder beside it, it keeps everything there and leaves the local data folder alone', async () => {
  remove(local)
  mkdirSync(portable, { recursive: true })
  const pid = await start()
  await expect
    .poll(() => existsSync(join(portable, 'history.sqlite')), { timeout: 15000 })
    .toBe(true)
  expect(existsSync(join(portable, 'EBWebView'))).toBe(true)
  await close(pid)
  expect(existsSync(local)).toBe(false)
}, 90000)

test('it reopens on the history it saved, and still closes cleanly', async () => {
  // The portable run's database, now in place for a second start.
  const saved = readFileSync(join(portable, 'history.sqlite'))
  const pid = await start()
  await close(pid)
  expect(readFileSync(join(portable, 'history.sqlite')).equals(saved)).toBe(true)
}, 90000)
