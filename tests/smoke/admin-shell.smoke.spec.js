import { expect, test } from "@playwright/test"

import {
  clearPersistedShellState,
  dashboardPayload,
  gotoAdminShell,
  launchFromStart,
  mockAdminShellApis,
  openStart,
  seedAdminWorkspaceState,
  taskbarItem,
  taskbarItems,
  windowShell,
  windowShells,
  workspaceAction,
} from "./adminShell.helpers.js"

test.beforeEach(async ({ page }) => {
  await mockAdminShellApis(page)
  await clearPersistedShellState(page)
})

test("clean admin boot renders the desktop shell with no open windows", async ({ page }) => {
  await gotoAdminShell(page)

  await expect(windowShells(page)).toHaveCount(0)
  await expect(taskbarItems(page)).toHaveCount(0)

  await openStart(page)
  await expect(workspaceAction(page, "restore")).toBeVisible()
  await expect(workspaceAction(page, "clear")).toBeVisible()
  await expect(workspaceAction(page, "tile")).toBeVisible()
  await expect(workspaceAction(page, "reset")).toBeVisible()
})

test("normal admin boot does not auto-restore a stale saved workspace", async ({ page }) => {
  await seedAdminWorkspaceState(page, {
    openWindows: ["dashboard", "reservations"],
    minimizedWindows: [],
    activeWindow: "reservations",
    windowOrder: ["dashboard", "reservations"],
    frames: {},
  })

  await gotoAdminShell(page)

  await expect(windowShells(page)).toHaveCount(0)
  await expect(taskbarItems(page)).toHaveCount(0)
})

test("Start launches an admin module and the taskbar reflects the active app", async ({ page }) => {
  await gotoAdminShell(page)

  await launchFromStart(page, "reservations")

  await expect(windowShell(page, "reservations")).toBeVisible()
  await expect(windowShell(page, "reservations")).toHaveAttribute("data-active", "true")
  await expect(windowShell(page, "reservations")).toHaveAttribute("data-window-state", "active")
  await expect(taskbarItem(page, "reservations")).toBeVisible()
  await expect(taskbarItem(page, "reservations")).toHaveAttribute("data-active", "true")
  await expect(taskbarItem(page, "reservations")).toHaveAttribute("data-minimized", "false")
})

test("taskbar minimize and restore update visible shell state", async ({ page }) => {
  await gotoAdminShell(page)
  await launchFromStart(page, "reservations")

  await page.getByTestId("shell-window-reservations-minimize").click()
  await expect(windowShell(page, "reservations")).toBeHidden()
  await expect(windowShell(page, "reservations")).toHaveAttribute("data-minimized", "true")
  await expect(windowShell(page, "reservations")).toHaveAttribute("data-window-state", "minimized")
  await expect(taskbarItem(page, "reservations")).toHaveAttribute("data-minimized", "true")

  await taskbarItem(page, "reservations").click()
  await expect(windowShell(page, "reservations")).toBeVisible()
  await expect(windowShell(page, "reservations")).toHaveAttribute("data-active", "true")
  await expect(windowShell(page, "reservations")).toHaveAttribute("data-window-state", "active")
  await expect(taskbarItem(page, "reservations")).toHaveAttribute("data-active", "true")
  await expect(taskbarItem(page, "reservations")).toHaveAttribute("data-minimized", "false")
})

test("workspace controls restore, tile, reset, and clear visible admin windows", async ({ page }) => {
  await seedAdminWorkspaceState(page, {
    openWindows: ["reservations"],
    minimizedWindows: [],
    activeWindow: "reservations",
    windowOrder: ["reservations"],
    frames: {
      reservations: { x: 320, y: 210, width: 500, height: 320, maximized: false, restoreFrame: null },
    },
  })
  await gotoAdminShell(page)

  await openStart(page)
  await workspaceAction(page, "restore").click()
  await expect(windowShell(page, "reservations")).toBeVisible()
  await expect(windowShell(page, "reservations")).toHaveAttribute("data-active", "true")

  await launchFromStart(page, "checkout")
  const reservationsBeforeTile = await windowShell(page, "reservations").boundingBox()
  const checkoutBeforeTile = await windowShell(page, "checkout").boundingBox()

  await openStart(page)
  await workspaceAction(page, "tile").click()

  const reservationsAfterTile = await windowShell(page, "reservations").boundingBox()
  const checkoutAfterTile = await windowShell(page, "checkout").boundingBox()
  expect(reservationsAfterTile).not.toEqual(reservationsBeforeTile)
  expect(checkoutAfterTile).not.toEqual(checkoutBeforeTile)
  await expect(windowShell(page, "reservations")).toBeVisible()
  await expect(windowShell(page, "checkout")).toBeVisible()

  await openStart(page)
  await workspaceAction(page, "reset").click()
  await expect(windowShell(page, "reservations")).toBeVisible()
  await expect(windowShell(page, "checkout")).toBeVisible()

  await openStart(page)
  await workspaceAction(page, "clear").click()
  await expect(windowShells(page)).toHaveCount(0)
  await expect(taskbarItems(page)).toHaveCount(0)
})

test("crypto admin review exposes explorer and copy helpers inside the shell", async ({ page }) => {
  const txid = "d".repeat(64)
  const cryptoDashboard = {
    ...dashboardPayload,
    requests: [
      {
        id: "request-crypto-admin",
        sawId: "saw-1",
        sawName: "MS 261 Test Unit",
        customerName: "Crypto Admin",
        phone: "555-0101",
        startDate: "2026-04-20",
        endDate: "2026-04-20",
        pickupPreference: "pickup",
        rentalDays: 1,
        rentalTotalCents: 6500,
        depositCents: 15000,
        status: "requested",
        paymentMethod: "crypto",
        paymentStatus: "awaiting_txid_review",
        cryptoCurrency: "BTC",
        cryptoAddress: "bc1qreviewaddress",
        cryptoAmount: "0.00272727",
        expectedCryptoAmount: "0.00272727",
        cryptoRateSource: "kraken",
        cryptoRateUsd: 55000,
        cryptoRateQuotedAt: "2026-04-11T12:00:00.000Z",
        paymentExpiresAt: "2099-04-11T12:30:00.000Z",
        customerSubmittedTxid: txid,
        customerTxidSubmittedAt: "2026-04-11T12:05:00.000Z",
        blockchainTxid: txid,
        depositUsdAmount: 150,
        refundableUsdAmount: 150,
        paymentEvents: [
          {
            id: "evt-txid",
            type: "crypto_txid_submitted",
            blockchainTxid: txid,
            createdAt: "2026-04-11T12:05:00.000Z",
            note: "Sent from wallet",
          },
        ],
        createdAt: "2026-04-11T11:55:00.000Z",
        updatedAt: "2026-04-11T12:05:00.000Z",
      },
    ],
    cryptoAlerts: [],
    cryptoMonitor: {},
  }

  await page.unroute("**/api/admin/dashboard")
  await page.unroute("**/api/public/inventory")
  await page.route("**/api/admin/dashboard", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(cryptoDashboard),
  }))
  await page.route("**/api/public/inventory", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      saws: cryptoDashboard.saws,
      paymentsEnabled: false,
      settings: cryptoDashboard.settings,
    }),
  }))
  await clearPersistedShellState(page)
  await page.addInitScript(() => {
    window.__copiedText = ""
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copiedText = value
        },
      },
    })
  })

  await gotoAdminShell(page)
  await launchFromStart(page, "reservations")

  await expect(page.getByText("Verification checklist")).toBeVisible()
  await expect(page.getByRole("link", { name: "Open explorer" })).toHaveAttribute("href", `https://mempool.space/tx/${txid}`)
  await page.getByRole("button", { name: "Copy TXID" }).click()
  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe(txid)
  await page.getByRole("button", { name: "Copy expected amount" }).click()
  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe("0.00272727 BTC")
  await expect(page.getByText("TXID submitted")).toBeVisible()
})
