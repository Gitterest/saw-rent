export const PAYPAL_DONATION_URL = "https://www.paypal.me/bimmerpal"
export const CASH_APP_DONATION_URL = "https://cash.app/$bimmerpal"

const PLACEHOLDER_ADDRESS_PATTERN = /\b(placeholder|replace|example|todo|not configured|unavailable)\b/i

export const DONATION_METHODS = [
  { key: "paypal", label: "PayPal", type: "link", url: PAYPAL_DONATION_URL },
  { key: "cashapp", label: "Cash App", type: "link", url: CASH_APP_DONATION_URL },
  { key: "BTC", label: "BTC", type: "crypto" },
  { key: "XMR", label: "XMR", type: "crypto" },
]

export function normalizeDonationAddress(value) {
  const address = String(value || "").trim()
  if (!address || PLACEHOLDER_ADDRESS_PATTERN.test(address)) {
    return ""
  }
  return address
}

export function normalizeDonationConfig(payload = {}) {
  const crypto = payload.crypto && typeof payload.crypto === "object" ? payload.crypto : {}

  return {
    paypalUrl: typeof payload.paypalUrl === "string" && payload.paypalUrl.trim()
      ? payload.paypalUrl.trim()
      : PAYPAL_DONATION_URL,
    cashAppUrl: typeof payload.cashAppUrl === "string" && payload.cashAppUrl.trim()
      ? payload.cashAppUrl.trim()
      : CASH_APP_DONATION_URL,
    crypto: {
      BTC: {
        address: normalizeDonationAddress(crypto.BTC?.address),
        source: crypto.BTC?.source || "",
      },
      XMR: {
        address: normalizeDonationAddress(crypto.XMR?.address),
        source: crypto.XMR?.source || "",
      },
    },
  }
}

export async function fetchDonationConfig() {
  const response = await fetch("/api/public/donations")
  if (!response.ok) {
    throw new Error("Donation options could not be loaded.")
  }
  return normalizeDonationConfig(await response.json())
}
