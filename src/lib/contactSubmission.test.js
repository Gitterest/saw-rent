import assert from "node:assert/strict"
import test from "node:test"

import {
  SAW_RENT_CONTACT,
  submitContactEmail,
  validateContactDraft,
} from "./contactSubmission.js"

test("contact draft validation requires a usable reply address and message", () => {
  const invalid = validateContactDraft({
    fromName: "A",
    fromEmail: "not-an-email",
    subject: "Hi",
    message: "short",
  })

  assert.equal(invalid.ok, false)
  assert.deepEqual(Object.keys(invalid.errors).sort(), [
    "fromEmail",
    "fromName",
    "message",
    "subject",
  ])

  const valid = validateContactDraft({
    fromName: "Jordan Renter",
    fromEmail: "jordan@example.com",
    subject: "Pickup timing",
    message: "I need to confirm pickup timing for a weekend rental.",
  })

  assert.equal(valid.ok, true)
  assert.deepEqual(valid.errors, {})
})

test("contact submission stays isolated until email transport is configured", async () => {
  const result = await submitContactEmail({
    fromName: "Jordan Renter",
    fromEmail: "jordan@example.com",
    subject: "Rental question",
    message: "Can you confirm availability for this weekend?",
  })

  assert.equal(SAW_RENT_CONTACT.telHref, "tel:2198519675")
  assert.equal(SAW_RENT_CONTACT.smsHref, "sms:2198519675")
  assert.equal(result.ok, false)
  assert.equal(result.status, "not_configured")
  assert.match(result.message, /219-851-9675/)
  assert.equal(result.payload.fromEmail, "jordan@example.com")
})
