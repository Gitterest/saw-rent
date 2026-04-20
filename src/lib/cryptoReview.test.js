import assert from "node:assert/strict"
import test from "node:test"

import {
  getCryptoCopyFields,
  getCryptoExplorerUrl,
  normalizeCryptoTxid,
} from "./cryptoReview.js"

test("crypto explorer links are generated per currency from normalized txids", () => {
  const btcTxid = "A".repeat(64)
  const xmrTxid = "b".repeat(64)

  assert.equal(normalizeCryptoTxid(btcTxid), "a".repeat(64))
  assert.equal(getCryptoExplorerUrl("BTC", btcTxid), `https://mempool.space/tx/${"a".repeat(64)}`)
  assert.equal(getCryptoExplorerUrl("XMR", xmrTxid), `https://xmrchain.net/tx/${"b".repeat(64)}`)
  assert.equal(getCryptoExplorerUrl("DOGE", btcTxid), "")
  assert.equal(getCryptoExplorerUrl("BTC", "not-a-txid"), "")
})

test("crypto copy fields expose txid, amount, address, and USD basis values", () => {
  const fields = getCryptoCopyFields({
    cryptoCurrency: "BTC",
    cryptoAmount: "0.004",
    expectedCryptoAmount: "0.004",
    cryptoAddress: "bc1qcopytarget",
    depositUsdAmount: 220,
    customerSubmittedTxid: "c".repeat(64),
  })

  assert.deepEqual(fields.map((field) => field.key), [
    "txid",
    "expectedCryptoAmount",
    "walletAddress",
    "depositUsdAmount",
  ])
  assert.equal(fields.find((field) => field.key === "txid").value, "c".repeat(64))
  assert.equal(fields.find((field) => field.key === "expectedCryptoAmount").value, "0.004 BTC")
  assert.equal(fields.find((field) => field.key === "walletAddress").value, "bc1qcopytarget")
  assert.equal(fields.find((field) => field.key === "depositUsdAmount").value, "$220.00")
})
