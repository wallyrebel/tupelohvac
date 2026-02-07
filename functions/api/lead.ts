interface Env {
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  LEAD_TO_EMAIL?: string;
  LEAD_FROM_EMAIL?: string;
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_WEBHOOK_SECRET?: string;
}

type LeadPayload = {
  timestamp: string;
  full_name: string;
  phone: string;
  email: string;
  zip: string;
  service_type: string;
  message: string;
  consent: string;
  page_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  ip: string;
  user_agent: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type TurnstileVerifyResult = {
  success: boolean;
  errorCodes: string[];
};

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function verifyTurnstileOnce(token: string, secret: string, ip?: string): Promise<TurnstileVerifyResult> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });
  if (!response.ok) {
    return { success: false, errorCodes: ["siteverify-http-error"] };
  }
  const data = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
  return {
    success: Boolean(data.success),
    errorCodes: Array.isArray(data["error-codes"]) ? data["error-codes"] : []
  };
}

async function verifyTurnstile(token: string, ip: string, secret: string): Promise<TurnstileVerifyResult> {
  const firstAttempt = await verifyTurnstileOnce(token, secret, ip || undefined);
  if (firstAttempt.success || !ip) return firstAttempt;

  // Fallback for edge cases where remote IP context is unstable (mobile relay/proxy hops).
  const secondAttempt = await verifyTurnstileOnce(token, secret);
  if (secondAttempt.success) return secondAttempt;

  return {
    success: false,
    errorCodes: [...firstAttempt.errorCodes, ...secondAttempt.errorCodes]
  };
}

async function sendLeadEmail(lead: LeadPayload, env: Env) {
  const to = env.LEAD_TO_EMAIL || "myersgrouponline@gmail.com";
  const from = env.LEAD_FROM_EMAIL || "TupeloHVAC Leads <onboarding@resend.dev>";
  const subject = `New HVAC lead: ${lead.service_type} (${lead.full_name})`;
  const text = [
    `Timestamp: ${lead.timestamp}`,
    `Name: ${lead.full_name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    `ZIP: ${lead.zip || "(not provided)"}`,
    `Service Type: ${lead.service_type}`,
    `Message: ${lead.message}`,
    "",
    "Metadata",
    `Page URL: ${lead.page_url}`,
    `UTM Source: ${lead.utm_source}`,
    `UTM Medium: ${lead.utm_medium}`,
    `UTM Campaign: ${lead.utm_campaign}`,
    `UTM Term: ${lead.utm_term}`,
    `UTM Content: ${lead.utm_content}`,
    `IP: ${lead.ip}`,
    `User Agent: ${lead.user_agent}`
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text
    })
  });

  if (!response.ok) {
    const failure = await response.text();
    throw new Error(`Email send failed: ${failure}`);
  }
}

async function appendToGoogleSheets(lead: LeadPayload, env: Env) {
  if (!env.GOOGLE_SHEETS_WEBHOOK_URL) return;
  const response = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: env.GOOGLE_SHEETS_WEBHOOK_SECRET || "",
      ...lead
    })
  });
  if (!response.ok) {
    const failure = await response.text();
    throw new Error(`Sheets append failed: ${failure}`);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY) {
      return jsonResponse({ error: "Server is missing required environment variables." }, 500);
    }

    const form = await request.formData();
    const full_name = clean(form.get("full_name"));
    const phone = clean(form.get("phone"));
    const email = clean(form.get("email"));
    const zip = clean(form.get("zip"));
    const service_type = clean(form.get("service_type"));
    const message = clean(form.get("message"));
    const consent = clean(form.get("consent"));
    const page_url = clean(form.get("page_url"));
    const utm_source = clean(form.get("utm_source"));
    const utm_medium = clean(form.get("utm_medium"));
    const utm_campaign = clean(form.get("utm_campaign"));
    const utm_term = clean(form.get("utm_term"));
    const utm_content = clean(form.get("utm_content"));

    const honeypot = clean(form.get("company_website"));
    if (honeypot) {
      return jsonResponse({ error: "Spam detected." }, 400);
    }

    const startedRaw = clean(form.get("form_started_at"));
    const startedAt = Number.parseInt(startedRaw, 10);
    const elapsed = Date.now() - startedAt;
    if (!startedAt || Number.isNaN(startedAt) || elapsed < 3000) {
      return jsonResponse({ error: "Submission rejected by anti-spam policy." }, 400);
    }

    if (!full_name || !phone || !email || !message || consent !== "yes") {
      return jsonResponse({ error: "Please complete all required fields." }, 400);
    }

    if (!emailRegex.test(email)) {
      return jsonResponse({ error: "Please provide a valid email address." }, 400);
    }

    if (message.length < 10) {
      return jsonResponse({ error: "Please provide more detail in your message." }, 400);
    }

    const token = clean(form.get("cf-turnstile-response"));
    if (!token) {
      return jsonResponse({ error: "Turnstile verification is required." }, 400);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "";
    const user_agent = request.headers.get("User-Agent") || "";
    const turnstileResult = await verifyTurnstile(token, ip, env.TURNSTILE_SECRET_KEY);
    if (!turnstileResult.success) {
      return jsonResponse(
        {
          error: "Turnstile validation failed. Please retry the verification challenge.",
          turnstile_codes: turnstileResult.errorCodes.slice(0, 4)
        },
        400
      );
    }

    const lead: LeadPayload = {
      timestamp: new Date().toISOString(),
      full_name,
      phone,
      email,
      zip,
      service_type,
      message,
      consent,
      page_url,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      ip,
      user_agent
    };

    await sendLeadEmail(lead, env);
    if (env.GOOGLE_SHEETS_WEBHOOK_URL) {
      await appendToGoogleSheets(lead, env);
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown submission error.";
    return jsonResponse({ error: message }, 500);
  }
};
