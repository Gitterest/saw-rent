import { expect } from "@playwright/test"

export const ADMIN_WORKSPACE_STORAGE_KEY = "saw-rent-admin-workspace-v2"

const SHELL_STORAGE_KEYS = [
  ADMIN_WORKSPACE_STORAGE_KEY,
  "saw-rent-admin-workspace-v3",
]

export const dashboardPayload = {
  settings: {
    businessName: "Saw Rent Test Desk",
    contactPhone: "555-0100",
    contactEmail: "ops@sawrent.test",
    location: "Smoke Test Yard",
    defaultPickupPreference: "pickup",
    defaultRentalDays: 2,
    maintenanceLeadDays: 3,
  },
  saws: [
    {
      id: "saw-1",
      name: "MS 261 Test Unit",
      category: "Pro saw",
      barSize: "20 in",
      engineCc: 50,
      dailyRateCents: 6500,
      depositCents: 15000,
      status: "available",
      notes: "Smoke fixture unit.",
    },
  ],
  requests: [],
  bookings: [],
  maintenanceRecords: [],
}

export async function mockAdminShellApis(page, dashboard = dashboardPayload) {
  await page.route("https://sketchfab.com/**", (route) => route.abort())
  await page.route("**/api/admin/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true }),
  }))
  await page.route("**/api/admin/dashboard", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(dashboard),
  }))
  await page.route("**/api/public/inventory", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      saws: dashboard.saws,
      paymentsEnabled: false,
      settings: dashboard.settings,
    }),
  }))
}

export async function clearPersistedShellState(page) {
  await page.addInitScript((storageKeys) => {
    for (const storageKey of storageKeys) {
      window.localStorage.removeItem(storageKey)
    }

    for (const storageKey of Object.keys(window.localStorage)) {
      if (storageKey.toLowerCase().includes("workspace")) {
        window.localStorage.removeItem(storageKey)
      }
    }
  }, SHELL_STORAGE_KEYS)
}

export async function seedAdminWorkspaceState(page, workspaceState) {
  await page.addInitScript(
    ({ storageKey, state }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(state))
    },
    { storageKey: ADMIN_WORKSPACE_STORAGE_KEY, state: workspaceState },
  )
}

export async function gotoAdminShell(page) {
  await page.goto("/admin")
  await expect(page.getByTestId("shell-root")).toBeVisible()
  await expect(page.getByTestId("shell-desktop")).toBeVisible()
  await expect(page.getByTestId("shell-workspace")).toBeVisible()
  await expect(page.getByTestId("admin-shell-window-grid")).toBeVisible()
  await expect(page.getByTestId("shell-taskbar")).toBeVisible()
  await expect(page.getByTestId("shell-start-button")).toBeVisible()
}

export async function openStart(page) {
  await page.getByTestId("shell-start-button").click()
  await expect(page.getByTestId("shell-start-menu")).toBeVisible()
}

export async function launchFromStart(page, key) {
  await openStart(page)
  await page.getByTestId(`shell-launcher-item-${key}`).click()
}

export function windowShell(page, key) {
  return page.getByTestId(`shell-window-${key}`)
}

export function taskbarItem(page, key) {
  return page.getByTestId(`shell-taskbar-item-${key}`)
}

export function workspaceAction(page, action) {
  return page.getByTestId(`shell-workspace-action-${action}`)
}

export function windowShells(page) {
  return page.locator("[data-testid^='shell-window-'][data-window-key]")
}

export function taskbarItems(page) {
  return page.locator("[data-testid^='shell-taskbar-item-']")
}
