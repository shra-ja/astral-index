// Drives a built app binary through tauri-driver and WebDriver, inside Xvfb, for the
// end-to-end tests. Each launch starts its own driver, so run one app at a time.
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { globSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect } from 'vitest'

const driverUrl = 'http://127.0.0.1:4444'

/** The Enter key, as WebDriver names it. */
export const ENTER = ''
/** The Down Arrow key, as WebDriver names it. */
export const DOWN = ''
/** The Escape key, as WebDriver names it. */
export const ESCAPE = '\uE00C'
/** The Tab key, as WebDriver names it. */
export const TAB = '\uE004'

export interface AppSession {
  /** Send a WebDriver command for this session; `path` follows the session's URL. */
  command<T = unknown>(path: string, method?: string, body?: unknown): Promise<T>
  /** Run a script in the real webview and return its result. */
  execute<T = unknown>(script: string): Promise<T>
  /** Run a script that calls its last argument with the result. */
  executeAsync<T = unknown>(script: string): Promise<T>
  /** Press keys on whatever has focus. */
  press(...keys: string[]): Promise<void>
  /** Scroll the first element matching `selector` into view and move the mouse pointer to its middle. */
  hover(selector: string): Promise<void>
  /** Choose a file in a file input, as the native file dialog would. */
  chooseFile(selector: string, path: string): Promise<void>
  /** Save a screenshot of the window under `test-results/`. */
  screenshot(name: string): Promise<void>
  /** Close the window as a user would, and wait for its coverage data. */
  close(): Promise<void>
  /** End the session and the driver, whether or not the window closed. */
  dispose(): Promise<void>
}

// Surface WebDriver failures at the request boundary instead of later UI assertions.
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${driverUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  // A WebDriver response's `value` has a different shape for each command, and
  // carries an `error` when the command failed.
  const result = (await response.json()) as { value?: { error?: unknown } }
  expect(result.value?.error, JSON.stringify(result)).toBeUndefined()
  return result.value as T
}

/** Start `src-tauri/target/debug/<binary>` with `env`, once its driver is ready. */
export async function launch(binary: string, env: NodeJS.ProcessEnv): Promise<AppSession> {
  const driver = spawn('tauri-driver', [], { env, stdio: 'inherit' })
  let session = ''
  const dispose = async () => {
    if (session) {
      await fetch(`${driverUrl}/session/${session}`, { method: 'DELETE' }).catch(() => {})
    }
    driver.kill('SIGTERM')
    await once(driver, 'exit')
  }
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${driverUrl}/status`)).ok
          } catch {
            return false
          }
        },
        { timeout: 10000 },
      )
      .toBe(true)
    const created = await request<{ sessionId: string }>('/session', 'POST', {
      capabilities: {
        alwaysMatch: {
          'tauri:options': { application: resolve(`src-tauri/target/debug/${binary}`) },
        },
      },
    })
    session = created.sessionId
  } catch (error) {
    await dispose()
    throw error
  }
  const command = <T>(path: string, method = 'GET', body?: unknown) =>
    request<T>(`/session/${session}${path}`, method, body)
  const find = (selector: string) =>
    command<Record<string, string>>('/element', 'POST', { using: 'css selector', value: selector })
  return {
    command,
    execute: <T>(script: string) => command<T>('/execute/sync', 'POST', { script, args: [] }),
    executeAsync: <T>(script: string) => command<T>('/execute/async', 'POST', { script, args: [] }),
    press: async (...keys: string[]) => {
      await command('/actions', 'POST', {
        actions: [
          {
            type: 'key',
            id: 'keyboard',
            actions: keys.flatMap((value) => [
              { type: 'keyDown', value },
              { type: 'keyUp', value },
            ]),
          },
        ],
      })
    },
    hover: async (selector: string) => {
      await command('/execute/sync', 'POST', {
        script: 'document.querySelector(arguments[0]).scrollIntoView({ block: "center" })',
        args: [selector],
      })
      await command('/actions', 'POST', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [
              { type: 'pointerMove', duration: 0, origin: await find(selector), x: 0, y: 0 },
            ],
          },
        ],
      })
    },
    chooseFile: async (selector: string, path: string) => {
      const element = await find(selector)
      await command(`/element/${Object.values(element)[0]}/value`, 'POST', { text: path })
    },
    screenshot: async (name: string) => {
      mkdirSync('test-results', { recursive: true })
      // Wait for the next paint, or the capture can show the screen before the last change.
      await command('/execute/async', 'POST', {
        script:
          'const done = arguments[arguments.length - 1]; requestAnimationFrame(() => requestAnimationFrame(() => done()))',
        args: [],
      })
      const image = await command<string>('/screenshot')
      writeFileSync(`test-results/${name}.png`, Buffer.from(image, 'base64'))
    },
    close: async () => {
      const window = execFileSync('xdotool', ['search', '--name', '^Astral Index$'], {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')[0]
      const pid = execFileSync('xdotool', ['getwindowpid', window], { encoding: 'utf8' }).trim()
      execFileSync('python3', ['tests/close-window-helper.py', window])
      await expect
        .poll(() => globSync(`src-tauri/target/src-tauri-${pid}-*.profraw`).length, {
          timeout: 10000,
        })
        .toBeGreaterThan(0)
    },
    dispose,
  }
}
