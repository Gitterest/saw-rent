export const SAW_RENT_CONTACT = {
  displayPhone: "219-851-9675",
  telHref: "tel:2198519675",
  smsHref: "sms:2198519675",
  emailToLabel: "Saw Rent Dispatch",
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())
}

export function validateContactDraft(draft) {
  const errors = {}
  const fromName = String(draft?.fromName || "").trim()
  const fromEmail = String(draft?.fromEmail || "").trim()
  const subject = String(draft?.subject || "").trim()
  const message = String(draft?.message || "").trim()

  if (fromName.length < 2) {
    errors.fromName = "Add your name."
  }

  if (!isEmailLike(fromEmail)) {
    errors.fromEmail = "Use a valid email address."
  }

  if (subject.length < 4) {
    errors.subject = "Add a short subject."
  }

  if (message.length < 12) {
    errors.message = "Add a little more detail."
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    normalized: {
      fromName,
      fromEmail,
      subject,
      message,
    },
  }
}

// Adapter boundary for a future backend contact endpoint.
export async function submitContactEmail(draft) {
  const validation = validateContactDraft(draft)
  if (!validation.ok) {
    return {
      ok: false,
      status: "validation_error",
      errors: validation.errors,
      message: "Check the highlighted message fields before sending.",
    }
  }

  return {
    ok: false,
    status: "not_configured",
    errors: {},
    payload: validation.normalized,
    message: `Email delivery is not connected yet. Call or text ${SAW_RENT_CONTACT.displayPhone} for the fastest response.`,
  }
}
