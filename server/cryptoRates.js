export const CRYPTO_USD_RATE_PAIRS = {
  BTC: {
    krakenPair: "XBTUSD",
  },
  XMR: {
    krakenPair: "XMRUSD",
  },
}

function rateProviderError(message, status = 503) {
  const error = new Error(message)
  error.status = status
  return error
}

function assertSupportedCurrency(currency) {
  if (!CRYPTO_USD_RATE_PAIRS[currency]) {
    throw rateProviderError("Crypto currency must be BTC or XMR.", 400)
  }
}

function parseKrakenRate(payload, currency) {
  const result = payload?.result && typeof payload.result === "object" ? payload.result : null
  const [pairKey, ticker] = result ? Object.entries(result)[0] || [] : []
  const lastTrade = Array.isArray(ticker?.c) ? Number(ticker.c[0]) : NaN

  if (!pairKey || !Number.isFinite(lastTrade) || lastTrade <= 0) {
    throw rateProviderError(`Kraken did not return a usable ${currency}/USD ticker.`)
  }

  return {
    source: "kraken",
    pair: pairKey,
    rateUsd: lastTrade,
  }
}

export class KrakenCryptoRateProvider {
  constructor({
    baseUrl = "https://api.kraken.com/0/public/Ticker",
    fetchImpl = globalThis.fetch,
    timeoutMs = 8000,
  } = {}) {
    this.baseUrl = baseUrl
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async getUsdRate(currency) {
    assertSupportedCurrency(currency)

    if (typeof this.fetchImpl !== "function") {
      throw rateProviderError("Server fetch is unavailable for crypto rate lookup.")
    }

    const url = new URL(this.baseUrl)
    url.searchParams.set("pair", CRYPTO_USD_RATE_PAIRS[currency].krakenPair)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw rateProviderError(`Kraken rate lookup failed (${response.status}).`)
      }

      const payload = await response.json()
      if (Array.isArray(payload?.error) && payload.error.length > 0) {
        throw rateProviderError(`Kraken rate lookup failed: ${payload.error.join(", ")}`)
      }

      return parseKrakenRate(payload, currency)
    } catch (error) {
      if (error.name === "AbortError") {
        throw rateProviderError("Kraken rate lookup timed out.")
      }
      if (error.status) {
        throw error
      }
      throw rateProviderError("Kraken rate lookup failed.")
    } finally {
      clearTimeout(timeout)
    }
  }
}

export class StaticCryptoRateProvider {
  constructor(rates = {}, source = "test") {
    this.rates = rates
    this.source = source
  }

  async getUsdRate(currency) {
    assertSupportedCurrency(currency)
    const rateUsd = Number(this.rates[currency])
    if (!Number.isFinite(rateUsd) || rateUsd <= 0) {
      throw rateProviderError(`No ${currency}/USD rate is configured.`)
    }

    return {
      source: this.source,
      pair: `${currency}USD`,
      rateUsd,
    }
  }
}

export class CompositeCryptoRateProvider {
  constructor(providers = []) {
    this.providers = providers
  }

  async getUsdRate(currency) {
    let lastError = null

    for (const provider of this.providers) {
      try {
        return await provider.getUsdRate(currency)
      } catch (error) {
        lastError = error
      }
    }

    throw lastError || rateProviderError("No crypto rate providers are configured.")
  }
}

export function createCryptoRateProvider(options = {}) {
  return new CompositeCryptoRateProvider([
    new KrakenCryptoRateProvider(options),
  ])
}
