import { expect, test } from "@playwright/test"

const settings = {
  businessName: "Saw Rent Test Desk",
  contactPhone: "555-0100",
  contactEmail: "ops@sawrent.test",
  location: "Smoke Test Yard",
  defaultPickupPreference: "pickup",
  defaultRentalDays: 1,
  maintenanceLeadDays: 3,
}

const saw = {
  id: "saw-crypto-1",
  name: "MS 261 Crypto Unit",
  category: "Pro saw",
  barSize: "20 in",
  engineCc: 50,
  dailyRateCents: 6500,
  depositCents: 15000,
  status: "available",
  notes: "Smoke fixture unit.",
}

function buildRequest(overrides = {}) {
  return {
    id: "request-crypto-smoke",
    sawId: saw.id,
    sawName: saw.name,
    customerName: "Crypto Renter",
    phone: "5550100",
    startDate: "2026-04-20",
    endDate: "2026-04-20",
    pickupPreference: "pickup",
    notes: "Smoke test",
    rentalDays: 1,
    rentalTotalCents: saw.dailyRateCents,
    depositCents: saw.depositCents,
    status: "requested",
    paymentMethod: "",
    paymentStatus: "pending",
    createdAt: "2026-04-11T12:00:00.000Z",
    updatedAt: "2026-04-11T12:00:00.000Z",
    bookingId: null,
    ...overrides,
  }
}

async function mockPublicApis(page, { expiredCrypto = false } = {}) {
  await page.route("https://sketchfab.com/**", (route) => route.abort())
  await page.route("**/api/public/inventory", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      saws: [saw],
      paymentsEnabled: true,
      cryptoPaymentsEnabled: true,
      settings,
    }),
  }))
  await page.route("**/api/public/requests", (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ request: buildRequest() }),
  }))
  await page.route("**/api/public/requests/request-crypto-smoke/crypto-payment", (route) => {
    const request = buildRequest({
      paymentMethod: "crypto",
      paymentStatus: expiredCrypto ? "expired" : "awaiting_crypto_payment",
      cryptoCurrency: "BTC",
      cryptoAddress: "bc1qxs4rfy727304uya8wh02e79xll6dsq2zqjvvql",
      cryptoAmount: "0.00272727",
      cryptoAmountFiatSnapshot: {
        currency: "USD",
        amountCents: saw.depositCents,
        amount: 150,
        rateUsd: 55000,
        rateSource: "kraken",
        ratePair: "XXBTZUSD",
        quotedAt: "2026-04-11T12:00:00.000Z",
      },
      cryptoRateSource: "kraken",
      cryptoRateUsd: 55000,
      cryptoRateQuotedAt: "2026-04-11T12:00:00.000Z",
      cryptoQrData: "bitcoin:bc1qxs4rfy727304uya8wh02e79xll6dsq2zqjvvql?amount=0.00272727&label=Saw%20Rent%20request-crypto-smoke",
      cryptoPaymentId: "crypto-smoke-1",
      cryptoAttempt: 1,
      paymentExpiresAt: expiredCrypto ? "2026-04-10T12:00:00.000Z" : "2099-04-11T12:30:00.000Z",
      paymentConfirmedAt: null,
      blockchainTxid: "",
      depositUsdAmount: 150,
      refundableUsdAmount: 150,
    })

    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ request }),
    })
  })
}

async function submitRentalRequest(page) {
  await page.goto("/")
  await expect(page.getByTestId("shell-root")).toBeVisible()
  await page.getByTestId("shell-desktop-icon-reservation").click()
  await expect(page.getByTestId("shell-window-reservation")).toBeVisible()
  await page.getByLabel("Full name").fill("Crypto Renter")
  await page.getByLabel("Phone").fill("5550100")
  await page.getByRole("button", { name: "Submit rental request" }).click()
  await expect(page.getByText("Finalize your reservation")).toBeVisible()
}

test("card checkout still calls the Stripe session endpoint from the public shell", async ({ page }) => {
  await mockPublicApis(page)
  let checkoutCalled = false
  await page.route("**/api/public/checkout-session", async (route) => {
    checkoutCalled = true
    const payload = route.request().postDataJSON()
    expect(payload.requestId).toBe("request-crypto-smoke")
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessionUrl: "/stripe-smoke-session" }),
    })
  })

  await submitRentalRequest(page)
  await page.getByRole("button", { name: "Pay by Card" }).click()
  await expect.poll(() => checkoutCalled).toBe(true)
})

test("crypto checkout opens a native shell window and supports taskbar restore", async ({ page }) => {
  await mockPublicApis(page, { expiredCrypto: true })

  await submitRentalRequest(page)
  await page.getByRole("button", { name: "Pay with Crypto" }).click()

  await expect(page.getByTestId("shell-window-crypto")).toBeVisible()
  await expect(page.getByTestId("shell-taskbar-item-crypto")).toBeVisible()
  await expect(page.getByText("BTC rental deposit")).toBeVisible()
  await expect(page.getByText("USD deposit basis")).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh Quote" })).toBeVisible()

  await page.getByTestId("shell-window-crypto-minimize").click()
  await expect(page.getByTestId("shell-window-crypto")).toBeHidden()
  await page.getByTestId("shell-taskbar-item-crypto").click()
  await expect(page.getByTestId("shell-window-crypto")).toBeVisible()
  await expect(page.getByTestId("shell-window-crypto")).toHaveAttribute("data-active", "true")
})
