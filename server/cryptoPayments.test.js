import assert from "node:assert/strict"
import test from "node:test"

import {
  applyCryptoTransition,
  createCryptoPayment,
  getEffectivePaymentStatus,
  readCryptoConfig,
  StubCryptoAddressProvider,
  submitCryptoTxid,
} from "./cryptoPayments.js"
import {
  BtcWalletServiceDestinationProvider,
  LocalDevCryptoDestinationProvider,
  MoneroWalletRpcDestinationProvider,
  StaticCryptoDestinationProvider,
} from "./cryptoDestinations.js"
import {
  applyCryptoPaymentObservation,
  CryptoPaymentMonitor,
  matchCryptoPaymentObservation,
  StaticCryptoMonitorProvider,
} from "./cryptoMonitoring.js"
import {
  CryptoMonitorRunner,
  CryptoMonitorScheduler,
} from "./cryptoMonitorWorker.js"
import { KrakenCryptoRateProvider, StaticCryptoRateProvider } from "./cryptoRates.js"

function buildRequest(overrides = {}) {
  return {
    id: "request-test-1",
    status: "requested",
    depositCents: 22000,
    paymentStatus: "pending",
    paymentMethod: "",
    cryptoAttempt: 0,
    paymentEvents: [],
    ...overrides,
  }
}

function cryptoTestConfig(overrides = {}) {
  return readCryptoConfig({
    CRYPTO_BTC_STATIC_ADDRESS: "bc1qteststaticreceiveaddress000000000000000000000",
    CRYPTO_XMR_STATIC_ADDRESS: "43TestStaticXmrReceiveAddressForSawRentUnitTesting000000000000000000000000000000000000000",
    ...overrides,
  })
}

test("crypto payments generate unique destinations per order attempt", async () => {
  const config = cryptoTestConfig({
    CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30",
  })
  const rateProvider = new StaticCryptoRateProvider({ BTC: 55000, XMR: 140 })
  const addressProvider = new StubCryptoAddressProvider()
  const first = await createCryptoPayment({ request: buildRequest(), currency: "BTC", config, rateProvider, addressProvider })
  const second = await createCryptoPayment({
    request: buildRequest({ paymentStatus: "expired", cryptoAttempt: 1 }),
    currency: "BTC",
    config,
    rateProvider,
    addressProvider,
  })

  assert.notEqual(first.cryptoPaymentId, second.cryptoPaymentId)
  assert.notEqual(first.cryptoAddress, second.cryptoAddress)
  assert.equal(first.cryptoAttempt, 1)
  assert.equal(second.cryptoAttempt, 2)
})

test("crypto amount and QR data are built from provider fiat snapshots", async () => {
  const config = cryptoTestConfig({
    CRYPTO_PAYMENT_EXPIRATION_MINUTES: "45",
  })
  const rateProvider = new StaticCryptoRateProvider({ BTC: 55000, XMR: 140 }, "unit-test")
  const btc = await createCryptoPayment({ request: buildRequest(), currency: "BTC", config, rateProvider })
  const xmr = await createCryptoPayment({ request: buildRequest(), currency: "XMR", config, rateProvider })

  assert.equal(btc.cryptoAmount, "0.004")
  assert.equal(btc.cryptoAmountFiatSnapshot.amountCents, 22000)
  assert.equal(btc.cryptoAmountFiatSnapshot.rateUsd, 55000)
  assert.equal(btc.cryptoRateSource, "unit-test")
  assert.equal(btc.cryptoRateUsd, 55000)
  assert.equal(btc.depositUsdAmount, 220)
  assert.equal(btc.refundableUsdAmount, 220)
  assert.match(btc.cryptoQrData, /^bitcoin:/)
  assert.match(btc.cryptoQrData, /amount=0.004/)
  assert.match(xmr.cryptoQrData, /^monero:/)
  assert.match(xmr.cryptoQrData, /tx_amount=/)
})

test("static destination provider uses configured BTC and XMR receive addresses", async () => {
  const config = cryptoTestConfig({
    CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30",
    CRYPTO_MODE: "static_txid",
    CRYPTO_BTC_STATIC_ADDRESS: "bc1qstaticreceiveaddress0000000000000000000000",
    CRYPTO_XMR_STATIC_ADDRESS: "43StaticMoneroReceiveAddressForSawRentTestingOnly000000000000000000000000000000000000000000",
  })
  const rateProvider = new StaticCryptoRateProvider({ BTC: 55000, XMR: 140 }, "unit-test")
  const provider = new StaticCryptoDestinationProvider(config.destinationProvider.static)

  const btc = await createCryptoPayment({ request: buildRequest({ id: "static-btc" }), currency: "BTC", config, rateProvider, addressProvider: provider })
  const xmr = await createCryptoPayment({ request: buildRequest({ id: "static-xmr" }), currency: "XMR", config, rateProvider, addressProvider: provider })

  assert.equal(btc.cryptoAddress, "bc1qstaticreceiveaddress0000000000000000000000")
  assert.equal(xmr.cryptoAddress, "43StaticMoneroReceiveAddressForSawRentTestingOnly000000000000000000000000000000000000000000")
  assert.equal(btc.destinationUnique, false)
  assert.equal(xmr.destinationUnique, false)
  assert.equal(btc.destinationProvider, "static-btc-address")
  assert.equal(xmr.destinationProvider, "static-xmr-address")
  assert.equal(btc.destinationAllocationState, "static_configured")
})

test("btc wallet service allocates unique addresses with derivation metadata", async () => {
  let index = 41
  const provider = new BtcWalletServiceDestinationProvider({
    allocateUrl: "https://wallet.test",
    token: "secret",
    account: "saw-rent",
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body)
      index += 1
      return {
        ok: true,
        json: async () => ({
          address: `bc1qtestaddress${index}`,
          derivationIndex: index,
          derivationPath: `m/84'/0'/0'/0/${index}`,
          account: body.account,
          walletReference: "btc-hot-watch-wallet",
        }),
      }
    },
  })
  const config = cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" })
  const rateProvider = new StaticCryptoRateProvider({ BTC: 55000 })

  const first = await createCryptoPayment({ request: buildRequest({ id: "btc-1" }), currency: "BTC", config, rateProvider, addressProvider: provider })
  const second = await createCryptoPayment({ request: buildRequest({ id: "btc-2" }), currency: "BTC", config, rateProvider, addressProvider: provider })

  assert.notEqual(first.cryptoAddress, second.cryptoAddress)
  assert.equal(first.destinationProvider, "btc-wallet-service")
  assert.equal(first.destinationUnique, true)
  assert.equal(first.destinationAllocationState, "allocated")
  assert.equal(first.btcDerivationIndex, 42)
  assert.equal(second.btcDerivationIndex, 43)
  assert.equal(first.destinationAllocation.account, "saw-rent")
})

test("xmr wallet rpc allocates unique subaddresses with account metadata", async () => {
  let index = 6
  const provider = new MoneroWalletRpcDestinationProvider({
    rpcUrl: "http://wallet-rpc.test:18083",
    accountIndex: 2,
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body)
      assert.equal(body.method, "create_address")
      assert.equal(body.params.account_index, 2)
      index += 1
      return {
        ok: true,
        json: async () => ({
          result: {
            address: `89xmrtestsubaddress${index}`,
            address_index: index,
          },
        }),
      }
    },
  })
  const config = cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" })
  const rateProvider = new StaticCryptoRateProvider({ XMR: 140 })

  const first = await createCryptoPayment({ request: buildRequest({ id: "xmr-1" }), currency: "XMR", config, rateProvider, addressProvider: provider })
  const second = await createCryptoPayment({ request: buildRequest({ id: "xmr-2" }), currency: "XMR", config, rateProvider, addressProvider: provider })

  assert.notEqual(first.cryptoAddress, second.cryptoAddress)
  assert.equal(first.destinationProvider, "xmr-wallet-rpc")
  assert.equal(first.destinationUnique, true)
  assert.equal(first.xmrAccountIndex, 2)
  assert.equal(first.xmrSubaddressIndex, 7)
  assert.equal(second.xmrSubaddressIndex, 8)
})

test("kraken provider parses live ticker-shaped USD quotes", async () => {
  const requests = []
  const provider = new KrakenCryptoRateProvider({
    fetchImpl: async (url) => {
      requests.push(String(url))
      return {
        ok: true,
        json: async () => ({
          error: [],
          result: {
            XXBTZUSD: {
              c: ["62500.50000", "0.01000000"],
            },
          },
        }),
      }
    },
  })

  const quote = await provider.getUsdRate("BTC")

  assert.equal(quote.source, "kraken")
  assert.equal(quote.pair, "XXBTZUSD")
  assert.equal(quote.rateUsd, 62500.5)
  assert.match(requests[0], /pair=XBTUSD/)
})

test("crypto status transitions reject duplicate and stale confirmation", async () => {
  const now = new Date("2026-04-11T12:00:00.000Z")
  const payment = await createCryptoPayment({
    request: buildRequest(),
    currency: "BTC",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" }),
    rateProvider: new StaticCryptoRateProvider({ BTC: 55000 }),
    now,
  })
  const request = { ...buildRequest(), ...payment }
  const noTxidReview = { ...buildRequest(), ...payment, paymentStatus: "awaiting_txid_review", blockchainTxid: "" }
  assert.throws(
    () => applyCryptoTransition(noTxidReview, "confirm", { now: new Date("2026-04-11T12:05:00.000Z") }),
    /requires a transaction ID/,
  )

  applyCryptoTransition(request, "detected", {
    blockchainTxid: "tx-test-1",
    note: "Desk saw the submitted hash",
    now: new Date("2026-04-11T12:10:00.000Z"),
  })
  assert.equal(request.paymentStatus, "awaiting_txid_review")
  assert.equal(request.blockchainTxid, "tx-test-1")
  assert.equal(request.paymentEvents[0].note, "Desk saw the submitted hash")

  applyCryptoTransition(request, "confirm", {
    note: "Explorer amount and address match quote",
    now: new Date("2026-04-11T12:20:00.000Z"),
  })
  assert.equal(request.paymentStatus, "paid")
  assert.ok(request.paymentConfirmedAt)
  assert.equal(request.paymentEvents[0].note, "Explorer amount and address match quote")
  assert.throws(() => applyCryptoTransition(request, "confirm"), /already confirmed/)

  const stale = { ...buildRequest(), ...payment, paymentStatus: "awaiting_crypto_payment" }
  assert.equal(getEffectivePaymentStatus(stale, new Date("2026-04-11T12:31:00.000Z")), "expired")
  assert.throws(
    () => applyCryptoTransition(stale, "detected", { now: new Date("2026-04-11T12:31:00.000Z") }),
    /expired/,
  )
})

test("customer txid submission moves static crypto payment into manual review", async () => {
  const now = new Date("2026-04-11T12:00:00.000Z")
  const payment = await createCryptoPayment({
    request: buildRequest(),
    currency: "XMR",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" }),
    rateProvider: new StaticCryptoRateProvider({ XMR: 140 }),
    now,
  })
  const request = { ...buildRequest(), ...payment }
  const txid = "a".repeat(64)

  submitCryptoTxid(request, {
    txid,
    note: "Sent from customer wallet",
    now: new Date("2026-04-11T12:05:00.000Z"),
  })

  assert.equal(request.paymentStatus, "awaiting_txid_review")
  assert.equal(request.customerSubmittedTxid, txid)
  assert.equal(request.blockchainTxid, txid)
  assert.equal(request.customerTxidNote, "Sent from customer wallet")
  assert.equal(request.depositUsdAmount, 220)
  assert.equal(request.refundableUsdAmount, 220)
  assert.throws(() => submitCryptoTxid(request, { txid: "b".repeat(64) }), /already awaiting review/)

  const expired = { ...buildRequest(), ...payment, paymentStatus: "awaiting_crypto_payment" }
  assert.throws(
    () => submitCryptoTxid(expired, {
      txid: "c".repeat(64),
      now: new Date("2026-04-11T12:31:00.000Z"),
    }),
    /expired/,
  )
})

test("chain observations match stored quote snapshots and protect duplicate processing", async () => {
  const now = new Date("2026-04-11T12:00:00.000Z")
  const payment = await createCryptoPayment({
    request: buildRequest(),
    currency: "BTC",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" }),
    rateProvider: new StaticCryptoRateProvider({ BTC: 55000 }),
    addressProvider: new LocalDevCryptoDestinationProvider(),
    now,
  })
  const request = { ...buildRequest(), ...payment }
  const observation = {
    currency: "BTC",
    address: request.cryptoAddress,
    amount: request.expectedCryptoAmount,
    txid: "tx-chain-1",
    confirmations: 1,
  }

  const match = matchCryptoPaymentObservation(request, observation, {
    now: new Date("2026-04-11T12:10:00.000Z"),
    minConfirmations: { BTC: 1 },
  })
  assert.equal(match.action, "confirm")

  applyCryptoPaymentObservation(request, observation, {
    now: new Date("2026-04-11T12:10:00.000Z"),
    minConfirmations: { BTC: 1 },
  })
  assert.equal(request.paymentStatus, "paid")
  assert.equal(request.monitoringState, "paid")
  assert.equal(request.receivedCryptoAmount, request.expectedCryptoAmount)
  assert.equal(request.depositUsdAmount, 220)

  const duplicate = applyCryptoPaymentObservation(request, observation, {
    now: new Date("2026-04-11T12:11:00.000Z"),
    minConfirmations: { BTC: 1 },
  })
  assert.equal(duplicate.action, "duplicate")
  assert.equal(request.paymentStatus, "paid")
})

test("chain observations reject expired quotes without confirming payment", async () => {
  const payment = await createCryptoPayment({
    request: buildRequest(),
    currency: "BTC",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" }),
    rateProvider: new StaticCryptoRateProvider({ BTC: 55000 }),
    addressProvider: new LocalDevCryptoDestinationProvider(),
    now: new Date("2026-04-11T12:00:00.000Z"),
  })
  const request = { ...buildRequest(), ...payment }

  const result = applyCryptoPaymentObservation(request, {
    currency: "BTC",
    address: request.cryptoAddress,
    amount: request.expectedCryptoAmount,
    txid: "tx-stale-quote",
    confirmations: 2,
  }, {
    now: new Date("2026-04-11T12:31:00.000Z"),
    minConfirmations: { BTC: 1 },
  })

  assert.equal(result.action, "rejected")
  assert.equal(result.reason, "quote_expired")
  assert.equal(request.paymentStatus, "awaiting_crypto_payment")
  assert.equal(request.monitoringState, "expired")
})

test("scheduled monitor runner auto-detects and confirms matching payments", async () => {
  const payment = await createCryptoPayment({
    request: buildRequest({ id: "scheduled-1" }),
    currency: "BTC",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" }),
    rateProvider: new StaticCryptoRateProvider({ BTC: 55000 }),
    addressProvider: new LocalDevCryptoDestinationProvider(),
    now: new Date("2026-04-11T12:00:00.000Z"),
  })
  const state = {
    requests: [{ ...buildRequest({ id: "scheduled-1" }), ...payment }],
    bookings: [],
  }
  const runner = new CryptoMonitorRunner({
    mutateState: async (mutator) => mutator(state),
    now: () => new Date("2026-04-11T12:05:00.000Z"),
    monitorFactory: () => new CryptoPaymentMonitor({
      provider: new StaticCryptoMonitorProvider([{
        requestId: "scheduled-1",
        currency: "BTC",
        address: payment.cryptoAddress,
        amount: payment.expectedCryptoAmount,
        txid: "tx-scheduled-1",
        confirmations: 1,
      }]),
      minConfirmations: { BTC: 1 },
    }),
  })

  const result = await runner.runOnce({ source: "scheduled" })

  assert.equal(result.skipped, false)
  assert.equal(result.checked, 1)
  assert.equal(state.requests[0].paymentStatus, "paid")
  assert.equal(state.requests[0].monitoringState, "paid")
  assert.equal(state.requests[0].depositUsdAmount, 220)
  assert.equal(runner.getStatus().lastRunSource, "scheduled")
})

test("monitor runner prevents overlapping executions", async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const payment = await createCryptoPayment({
    request: buildRequest({ id: "overlap-1" }),
    currency: "BTC",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" }),
    rateProvider: new StaticCryptoRateProvider({ BTC: 55000 }),
    addressProvider: new LocalDevCryptoDestinationProvider(),
    now: new Date("2026-04-11T12:00:00.000Z"),
  })
  const state = {
    requests: [{ ...buildRequest({ id: "overlap-1" }), ...payment }],
    bookings: [],
  }
  const runner = new CryptoMonitorRunner({
    mutateState: async (mutator) => mutator(state),
    now: () => new Date("2026-04-11T12:05:00.000Z"),
    monitorFactory: () => new CryptoPaymentMonitor({
      provider: {
        async findPayments() {
          await gate
          return []
        },
      },
    }),
  })

  const firstRun = runner.runOnce({ source: "scheduled" })
  const secondRun = await runner.runOnce({ source: "manual" })
  release()
  await firstRun

  assert.equal(secondRun.skipped, true)
  assert.equal(secondRun.reason, "monitor_already_running")
})

test("scheduler triggers configured monitor runs and can stop", async () => {
  let scheduledCallback = null
  let runCount = 0
  const runner = {
    configureScheduler() {},
    getStatus() {
      return {}
    },
    async runOnce({ source }) {
      assert.equal(source, "scheduled")
      runCount += 1
      return { checked: 0, results: [] }
    },
  }
  const scheduler = new CryptoMonitorScheduler({
    runner,
    enabled: true,
    intervalMs: 5000,
    setIntervalFn: (callback, intervalMs) => {
      assert.equal(intervalMs, 5000)
      scheduledCallback = callback
      return "timer-id"
    },
    clearIntervalFn: (timer) => {
      assert.equal(timer, "timer-id")
    },
  })

  assert.equal(scheduler.start(), true)
  await scheduledCallback()
  assert.equal(runCount, 1)
  assert.equal(scheduler.stop(), true)
})

test("scheduled monitoring records underpaid and expired alerts without completing payment", async () => {
  const underpaidPayment = await createCryptoPayment({
    request: buildRequest({ id: "underpaid-1" }),
    currency: "BTC",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "30" }),
    rateProvider: new StaticCryptoRateProvider({ BTC: 55000 }),
    addressProvider: new LocalDevCryptoDestinationProvider(),
    now: new Date("2026-04-11T12:00:00.000Z"),
  })
  const expiredPayment = await createCryptoPayment({
    request: buildRequest({ id: "expired-1" }),
    currency: "BTC",
    config: cryptoTestConfig({ CRYPTO_PAYMENT_EXPIRATION_MINUTES: "1" }),
    rateProvider: new StaticCryptoRateProvider({ BTC: 55000 }),
    addressProvider: new LocalDevCryptoDestinationProvider(),
    now: new Date("2026-04-11T12:00:00.000Z"),
  })
  const state = {
    requests: [
      { ...buildRequest({ id: "underpaid-1" }), ...underpaidPayment },
      { ...buildRequest({ id: "expired-1" }), ...expiredPayment },
    ],
    bookings: [],
  }
  const runner = new CryptoMonitorRunner({
    mutateState: async (mutator) => mutator(state),
    now: () => new Date("2026-04-11T12:05:00.000Z"),
    monitorFactory: () => new CryptoPaymentMonitor({
      provider: new StaticCryptoMonitorProvider([{
        requestId: "underpaid-1",
        currency: "BTC",
        address: underpaidPayment.cryptoAddress,
        amount: "0.0001",
        txid: "tx-underpaid-1",
        confirmations: 2,
      }]),
      minConfirmations: { BTC: 1 },
    }),
  })

  await runner.runOnce({ source: "scheduled" })

  assert.equal(state.requests[0].paymentStatus, "underpaid")
  assert.equal(state.requests[0].monitoringState, "underpaid")
  assert.equal(state.requests[1].paymentStatus, "awaiting_crypto_payment")
  assert.equal(state.requests[1].monitoringState, "expired")
})
