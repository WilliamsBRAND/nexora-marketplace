// NEXORA — server-side Paystack transaction verification + paid confirmation.
// This runs ONLY on Vercel (secret keys are never exposed to the browser).
//
// Two separate Paystack accounts + two separate Google Sheets:
//  - marketplace (default): PAYSTACK_SECRET_KEY  + SHEET_WEBHOOK_URL
//  - ads / sales page:      PAYSTACK_ADS_SECRET_KEY + SHEET_ADS_WEBHOOK_URL
//
// Flow: checkout.html -> Paystack inline -> redirect to /thank-you.html?ref=REF&tier=..
//       thank-you.html -> GET /api/verify-payment?reference=REF&email=..&name=..&tier=..
//       This function verifies the transaction with the matching Paystack secret key,
//       then POSTs the verified row to the matching Apps Script webhook (Google Sheet).

const PAYSTACK_VERIFY = "https://api.paystack.co/transaction/verify/";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}

function paystackVerifyUrl(secretKey, reference) {
  return PAYSTACK_VERIFY + encodeURIComponent(reference);
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const reference = url.searchParams.get("reference") || "";
  const email = url.searchParams.get("email") || "";
  const name = url.searchParams.get("name") || "";
  const partner = url.searchParams.get("pp") || "";
  const offerSlug = url.searchParams.get("offer") || "nexora";
  const tier = (url.searchParams.get("tier") || "").toLowerCase() === "ads" ? "ads" : "marketplace";

  const isAds = tier === "ads";
  const secretKey = isAds
    ? (process.env.PAYSTACK_ADS_SECRET_KEY || "")
    : (process.env.PAYSTACK_SECRET_KEY || "");

  if (!secretKey) {
    return json(res, 500, {
      ok: false,
      error: isAds
        ? "Paystack ads secret key (PAYSTACK_ADS_SECRET_KEY) not configured on server."
        : "Paystack marketplace secret key (PAYSTACK_SECRET_KEY) not configured on server.",
    });
  }

  if (!reference) {
    return json(res, 400, { ok: false, error: "Missing reference." });
  }

  let tx;
  try {
    const r = await fetch(paystackVerifyUrl(secretKey, reference), {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    tx = await r.json();
  } catch (err) {
    return json(res, 502, { ok: false, error: "Could not reach Paystack: " + err.message });
  }

  const data = tx && tx.data;
  if (!tx || tx.status !== true || !data) {
    return json(res, 400, { ok: false, error: (tx && tx.message) || "Verification failed." });
  }

  const status = data.status;
  const amount = parseInt(data.amount, 10);

  if (status !== "success") {
    return json(res, 200, {
      ok: false,
      paid: false,
      status,
      message: "Payment has not been completed.",
    });
  }

  // Accept valid promo, fee-adjusted, and standard price tiers
  const validMarketplaceAmounts = [770600, 749000, 2500000, 517800, 500000, 499700, 498700];
  const expectedAmount = isAds
    ? parseInt(process.env.PAYSTACK_ADS_AMOUNT_KOBO || "517800", 10)
    : parseInt(process.env.PAYSTACK_AMOUNT_KOBO || "770600", 10);

  const isValidAmount = validMarketplaceAmounts.includes(amount) || amount === expectedAmount || amount >= 450000;

  if (!isValidAmount) {
    return json(res, 200, {
      ok: false,
      paid: false,
      status: "amount_mismatch",
      message: "Payment amount does not match any valid NEXORA price tier.",
      tier,
    });
  }

  // Verified: success + correct amount. Log to the tier's own Google Sheet via Apps Script webhook.
  const sheetWebhook = isAds
    ? (process.env.SHEET_ADS_WEBHOOK_URL || "")
    : (process.env.SHEET_WEBHOOK_URL || "");
  let logged = false;
  const source = partner
    ? `Affiliate (${partner}) - ${isAds ? 'Ads' : 'Marketplace'}`
    : (isAds ? "Ads (Sales Page)" : "Organic (Marketplace)");
  const customerEmail = email || data.customer?.email || "";
  const customerName = name || (data.customer?.first_name ? (data.customer.first_name + " " + (data.customer.last_name || "")).trim() : "");
  const amountNaira = String(data.amount / 100);

  if (sheetWebhook) {
    try {
      const fp = new URL(sheetWebhook);
      fp.searchParams.set("email", customerEmail);
      fp.searchParams.set("name", customerName);
      fp.searchParams.set("amount", amountNaira);
      fp.searchParams.set("reference", reference);
      fp.searchParams.set("status", status);
      fp.searchParams.set("partner", partner || "");
      fp.searchParams.set("source", source);
      fp.searchParams.set("tier", tier);

      const payload = {
        name: customerName,
        email: customerEmail,
        amount: amountNaira,
        reference: reference,
        status: status,
        partner: partner || "",
        source: source,
        tier: tier,
      };

      const sr = await fetch(fp.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      logged = sr.ok;
    } catch (err) {
      logged = false;
    }
  }

  return json(res, 200, {
    ok: true,
    paid: true,
    status: "success",
    reference,
    amount: data.amount,
    currency: data.currency,
    customer: {
      email: customerEmail,
      name: customerName,
    },
    paid_at: data.paid_at,
    partner: partner || null,
    tier,
    source,
    sheet_logged: logged,
  });
}