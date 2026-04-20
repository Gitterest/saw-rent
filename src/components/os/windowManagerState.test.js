import assert from "node:assert/strict"
import test from "node:test"

import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  buildDefaultFrame,
  clearWorkspaceState,
  closeWindowState,
  createInitialWindowState,
  focusWindowState,
  minimizeWindowState,
  normalizeWindowState,
  resetWindowPositionsState,
  restoreWindowState,
  restoreWorkspaceState,
  tileVisibleWindowState,
  toggleMaximizeWindowState,
  updateFrameWindowState,
} from "./windowManagerState.js"

const DEFINITIONS = [
  { key: "dashboard", label: "Dashboard", size: "wide" },
  { key: "reservations", label: "Chainsaw Rentals", size: "wide" },
  { key: "checkout", label: "Checkout", size: "wide" },
  { key: "inventory", label: "Inventory", size: "wide" },
  { key: "settings", label: "Settings", size: "standard" },
]

function assertValidFrames(state) {
  for (const definition of DEFINITIONS) {
    const frame = state.frames[definition.key]
    assert.ok(frame, `${definition.key} should have a frame`)
    assert.equal(Number.isFinite(frame.x), true)
    assert.equal(Number.isFinite(frame.y), true)
    assert.ok(frame.width >= MIN_WINDOW_WIDTH)
    assert.ok(frame.height >= MIN_WINDOW_HEIGHT)
    assert.equal(typeof frame.maximized, "boolean")
  }
}

test("clean admin boot starts with no open windows and valid frames", () => {
  const state = createInitialWindowState({
    definitions: DEFINITIONS,
    defaultOpenKeys: [],
    defaultActiveKey: "",
    urlWindow: "",
  })

  assert.deepEqual(state.openWindows, [])
  assert.deepEqual(state.minimizedWindows, [])
  assert.equal(state.activeWindow, "")
  assert.deepEqual(state.windowOrder, [])
  assertValidFrames(state)
})

test("saved workspace state does not reopen unless supplied as an intentional restore source", () => {
  const savedWorkspace = {
    openWindows: ["dashboard", "reservations"],
    activeWindow: "reservations",
    windowOrder: ["dashboard", "reservations"],
  }

  const cleanBoot = createInitialWindowState({
    definitions: DEFINITIONS,
    persistedState: null,
    defaultOpenKeys: [],
    defaultActiveKey: "",
    urlWindow: "",
  })

  const explicitRestoreBoot = createInitialWindowState({
    definitions: DEFINITIONS,
    persistedState: savedWorkspace,
    defaultOpenKeys: [],
    defaultActiveKey: "",
    urlWindow: "",
  })

  assert.deepEqual(cleanBoot.openWindows, [])
  assert.equal(cleanBoot.activeWindow, "")
  assert.deepEqual(explicitRestoreBoot.openWindows, ["dashboard", "reservations"])
  assert.equal(explicitRestoreBoot.activeWindow, "reservations")
})

test("approved module launch flow opens only the requested module", () => {
  const state = createInitialWindowState({
    definitions: DEFINITIONS,
    defaultOpenKeys: [],
    defaultActiveKey: "",
    urlWindow: "reservations",
  })

  assert.deepEqual(state.openWindows, ["reservations"])
  assert.deepEqual(state.windowOrder, ["reservations"])
  assert.equal(state.activeWindow, "reservations")
  assertValidFrames(state)
})

test("restore workspace sanitizes stale keys, stale active windows, and invalid frame data", () => {
  const result = restoreWorkspaceState(
    {
      openWindows: ["ghost", "dashboard", "reservations"],
      minimizedWindows: ["ghost", "reservations"],
      activeWindow: "ghost",
      windowOrder: ["ghost", "reservations", "dashboard"],
      frames: {
        dashboard: {
          x: "bad",
          y: 44,
          width: 12,
          height: 9,
          maximized: true,
          restoreFrame: { x: 4, y: "bad", width: 10, height: 11 },
        },
      },
    },
    DEFINITIONS,
  )

  assert.equal(result.ok, true)
  assert.deepEqual(result.state.openWindows, ["dashboard", "reservations"])
  assert.deepEqual(result.state.minimizedWindows, ["reservations"])
  assert.deepEqual(result.state.windowOrder, ["reservations", "dashboard"])
  assert.equal(result.state.activeWindow, "dashboard")
  assert.ok(result.state.frames.dashboard.width >= MIN_WINDOW_WIDTH)
  assert.ok(result.state.frames.dashboard.height >= MIN_WINDOW_HEIGHT)
  assert.ok(result.state.frames.dashboard.restoreFrame.width >= MIN_WINDOW_WIDTH)
  assert.ok(result.state.frames.dashboard.restoreFrame.height >= MIN_WINDOW_HEIGHT)
  assertValidFrames(result.state)
})

test("restore workspace returns a clear no-op result when no saved workspace is valid", () => {
  assert.equal(restoreWorkspaceState(null, DEFINITIONS).ok, false)

  const result = restoreWorkspaceState({ openWindows: ["ghost"], activeWindow: "ghost" }, DEFINITIONS)
  assert.equal(result.ok, false)
  assert.deepEqual(result.state.openWindows, [])
})

test("launch, focus, minimize, restore, close, frame update, and maximize keep state coherent", () => {
  let state = createInitialWindowState({ definitions: DEFINITIONS, defaultOpenKeys: [] })

  state = focusWindowState(state, DEFINITIONS, "reservations")
  assert.deepEqual(state.openWindows, ["reservations"])
  assert.equal(state.activeWindow, "reservations")
  assert.deepEqual(state.windowOrder, ["reservations"])

  state = focusWindowState(state, DEFINITIONS, "checkout")
  assert.deepEqual(state.openWindows, ["reservations", "checkout"])
  assert.equal(state.activeWindow, "checkout")
  assert.deepEqual(state.windowOrder, ["reservations", "checkout"])

  state = minimizeWindowState(state, DEFINITIONS, "checkout")
  assert.deepEqual(state.openWindows, ["reservations", "checkout"])
  assert.deepEqual(state.minimizedWindows, ["checkout"])
  assert.equal(state.activeWindow, "reservations")

  state = restoreWindowState(state, DEFINITIONS, "checkout")
  assert.deepEqual(state.minimizedWindows, [])
  assert.equal(state.activeWindow, "checkout")
  assert.deepEqual(state.windowOrder, ["reservations", "checkout"])

  state = updateFrameWindowState(state, DEFINITIONS, "checkout", { width: 1, height: 1, x: 24, y: 32 })
  assert.ok(state.frames.checkout.width >= MIN_WINDOW_WIDTH)
  assert.ok(state.frames.checkout.height >= MIN_WINDOW_HEIGHT)
  assert.equal(state.frames.checkout.x, 24)
  assert.equal(state.frames.checkout.y, 32)

  state = toggleMaximizeWindowState(state, DEFINITIONS, "checkout")
  assert.equal(state.frames.checkout.maximized, true)
  assert.ok(state.frames.checkout.restoreFrame)
  assert.equal(state.activeWindow, "checkout")

  state = toggleMaximizeWindowState(state, DEFINITIONS, "checkout")
  assert.equal(state.frames.checkout.maximized, false)
  assert.equal(state.frames.checkout.restoreFrame, null)
  assert.equal(state.activeWindow, "checkout")

  state = closeWindowState(state, DEFINITIONS, "reservations")
  assert.deepEqual(state.openWindows, ["checkout"])
  assert.deepEqual(state.windowOrder, ["checkout"])
  assert.equal(state.activeWindow, "checkout")
  assertValidFrames(state)
})

test("normalization prevents invalid active, minimized, order, and frame state drift", () => {
  const state = normalizeWindowState(
    {
      openWindows: ["dashboard", "ghost", "checkout"],
      minimizedWindows: ["dashboard", "ghost"],
      activeWindow: "dashboard",
      windowOrder: ["ghost", "dashboard", "checkout"],
      frames: {
        checkout: { x: Number.NaN, y: "bad", width: -20, height: 0 },
      },
    },
    DEFINITIONS,
  )

  assert.deepEqual(state.openWindows, ["dashboard", "checkout"])
  assert.deepEqual(state.minimizedWindows, ["dashboard"])
  assert.deepEqual(state.windowOrder, ["dashboard", "checkout"])
  assert.equal(state.activeWindow, "checkout")
  assertValidFrames(state)
})

test("tiling zero visible windows is a safe no-op", () => {
  const state = createInitialWindowState({ definitions: DEFINITIONS, defaultOpenKeys: [] })
  const result = tileVisibleWindowState(state, DEFINITIONS, { width: 1000, height: 720 })

  assert.equal(result.ok, false)
  assert.deepEqual(result.state.openWindows, [])
  assert.deepEqual(result.state.windowOrder, [])
})

test("tiling one visible window creates a usable frame without corrupting state", () => {
  const state = focusWindowState(
    createInitialWindowState({ definitions: DEFINITIONS, defaultOpenKeys: [] }),
    DEFINITIONS,
    "dashboard",
  )
  const result = tileVisibleWindowState(state, DEFINITIONS, { width: 1000, height: 720 })

  assert.equal(result.ok, true)
  assert.deepEqual(result.state.openWindows, ["dashboard"])
  assert.equal(result.state.activeWindow, "dashboard")
  assert.equal(result.state.frames.dashboard.x, 18)
  assert.equal(result.state.frames.dashboard.y, 18)
  assert.ok(result.state.frames.dashboard.width >= MIN_WINDOW_WIDTH)
  assert.ok(result.state.frames.dashboard.height >= MIN_WINDOW_HEIGHT)
})

test("tiling several windows skips minimized windows and keeps task order coherent", () => {
  let state = createInitialWindowState({ definitions: DEFINITIONS, defaultOpenKeys: [] })
  for (const key of ["dashboard", "reservations", "checkout", "inventory"]) {
    state = focusWindowState(state, DEFINITIONS, key)
  }
  const minimizedBeforeTile = state.frames.reservations
  state = minimizeWindowState(state, DEFINITIONS, "reservations")

  const result = tileVisibleWindowState(state, DEFINITIONS, { width: 1200, height: 800 })

  assert.equal(result.ok, true)
  assert.deepEqual(result.state.openWindows, ["dashboard", "reservations", "checkout", "inventory"])
  assert.deepEqual(result.state.minimizedWindows, ["reservations"])
  assert.deepEqual(result.state.windowOrder, ["dashboard", "reservations", "checkout", "inventory"])
  assert.equal(result.state.activeWindow, "inventory")
  assert.deepEqual(result.state.frames.reservations, minimizedBeforeTile)

  for (const key of ["dashboard", "checkout", "inventory"]) {
    assert.ok(result.state.frames[key].width >= MIN_WINDOW_WIDTH)
    assert.ok(result.state.frames[key].height >= MIN_WINDOW_HEIGHT)
    assert.equal(result.state.frames[key].maximized, false)
    assert.equal(result.state.frames[key].restoreFrame, null)
  }
})

test("reset window positions preserves open and minimized state while restoring default frames", () => {
  let state = createInitialWindowState({ definitions: DEFINITIONS, defaultOpenKeys: [] })
  for (const key of ["dashboard", "reservations", "checkout"]) {
    state = focusWindowState(state, DEFINITIONS, key)
    state = updateFrameWindowState(state, DEFINITIONS, key, { x: 300, y: 220, width: 440, height: 300 })
  }
  state = minimizeWindowState(state, DEFINITIONS, "reservations")

  const result = resetWindowPositionsState(state, DEFINITIONS)

  assert.equal(result.ok, true)
  assert.deepEqual(result.state.openWindows, ["dashboard", "reservations", "checkout"])
  assert.deepEqual(result.state.minimizedWindows, ["reservations"])
  assert.equal(result.state.activeWindow, "checkout")
  assert.deepEqual(result.state.frames.dashboard, buildDefaultFrame("wide", 0))
  assert.deepEqual(result.state.frames.reservations, buildDefaultFrame("wide", 1))
  assert.deepEqual(result.state.frames.checkout, buildDefaultFrame("wide", 2))
})

test("clear workspace closes shell windows only and leaves valid frame data", () => {
  let state = createInitialWindowState({ definitions: DEFINITIONS, defaultOpenKeys: ["dashboard", "checkout"] })
  state = clearWorkspaceState(state, DEFINITIONS)

  assert.deepEqual(state.openWindows, [])
  assert.deepEqual(state.minimizedWindows, [])
  assert.equal(state.activeWindow, "")
  assert.deepEqual(state.windowOrder, [])
  assertValidFrames(state)
})
