import { getDb } from "./_db.js";

// NEXORA — server-side Paystack transaction verification (Marketplace)
const PAYSTACK_VERIFY = "https://api.paystack.co/transaction/verify/";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}

function paystackVerifyUrl(secretKey, reference) {
  return PAYSTACK_VERIFY + encodeURIComponent(reference);
}

function extractPartnerCode(data, queryPartner) {
  if (queryPartner) return queryPartner.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
  const meta = data && data.metadata;
  if (!meta) return '';
  if (meta.partner) return String(meta.partner).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
  if (meta.pp) return String(meta.pp).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
  if (meta.partner_code) return String(meta.partner_code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
  const customFields = Array.isArray(meta.custom_fields) ? meta.custom_fields : [];
  for (const f of customFields) {
    const varName = String(f.variable_name || '').toLowerCase();
    const dispName = String(f.display_name || '').toLowerCase();
    if (varName === 'partner' || varName === 'pp' || varName === 'partner_code' ||
        dispName === 'partner' || dispName === 'partner code') {
      const v = String(f.value || '');
      if (v) return v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
    }
  }
  return '';
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const reference = url.searchParams.get("reference") || "";
  const email = url.searchParams.get("email") || "";
  const name = url.searchParams.get("name") || "";
  const partnerParam = url.searchParams.get("pp") || "";
  const phone = url.searchParams.get("phone") || "";

  const secretKey = process.env.PAYSTACK_SECRET_KEY || "";

  if (!secretKey) {
    return json(res, 500, {
      ok: false,
      error: "Paystack marketplace secret key (PAYSTACK_SECRET_KEY) not configured on server.",
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

  const customerEmail = email || data.customer?.email || "";
  const customerName = name || (data.customer?.first_name ? (data.customer.first_name + " " + (data.customer.last_name || "")).trim() : "");
  const customerPhone = phone || data.customer?.phone || (data.metadata && (data.metadata.phone || data.metadata.phone_number || data.metadata.custom_fields?.find(f => f.variable_name === 'phone')?.value)) || "";
  const amountNaira = String(data.amount / 100);
  const partnerCode = extractPartnerCode(data, partnerParam);
  const channel = "Marketplace";
  const source = partnerCode ? `Affiliate (${partnerCode}) - Marketplace` : "Marketplace (Direct/Organic)";

  // 1. Log to Google Sheet via Apps Script webhook
  const sheetWebhook = process.env.SHEET_WEBHOOK_URL || "";
  let logged = false;

  if (sheetWebhook) {
    try {
      const fp = new URL(sheetWebhook);

      // All field aliases in query parameters
      fp.searchParams.set("name", customerName);
      fp.searchParams.set("fullName", customerName);
      fp.searchParams.set("full_name", customerName);
      fp.searchParams.set("customer_name", customerName);

      fp.searchParams.set("email", customerEmail);
      fp.searchParams.set("customer_email", customerEmail);

      fp.searchParams.set("phone", customerPhone);
      fp.searchParams.set("phone_number", customerPhone);
      fp.searchParams.set("phoneNumber", customerPhone);
      fp.searchParams.set("customer_phone", customerPhone);
      fp.searchParams.set("whatsapp", customerPhone);

      fp.searchParams.set("amount", amountNaira);
      fp.searchParams.set("amount_paid", amountNaira);
      fp.searchParams.set("amountPaid", amountNaira);
      fp.searchParams.set("amount_naira", amountNaira);
      fp.searchParams.set("paid_amount", amountNaira);

      fp.searchParams.set("reference", reference);
      fp.searchParams.set("ref", reference);
      fp.searchParams.set("ref_code", reference);
      fp.searchParams.set("refCode", reference);
      fp.searchParams.set("reference_code", reference);
      fp.searchParams.set("paystack_reference", reference);

      fp.searchParams.set("status", status);
      fp.searchParams.set("partner", partnerCode || "None");
      fp.searchParams.set("partner_code", partnerCode || "None");
      fp.searchParams.set("partnerCode", partnerCode || "None");
      fp.searchParams.set("pp", partnerCode || "None");
      fp.searchParams.set("affiliate", partnerCode || "None");

      fp.searchParams.set("channel", channel);
      fp.searchParams.set("source", source);

      // Comprehensive JSON body payload
      const payload = {
        name: customerName,
        fullName: customerName,
        full_name: customerName,
        customer_name: customerName,

        email: customerEmail,
        customer_email: customerEmail,

        phone: customerPhone,
        phone_number: customerPhone,
        phoneNumber: customerPhone,
        customer_phone: customerPhone,
        whatsapp: customerPhone,

        amount: amountNaira,
        amount_paid: amountNaira,
        amountPaid: amountNaira,
        amount_naira: amountNaira,
        paid_amount: amountNaira,

        reference: reference,
        ref: reference,
        ref_code: reference,
        refCode: reference,
        reference_code: reference,
        paystack_reference: reference,

        status: status,

        partner: partnerCode || "None",
        partner_code: partnerCode || "None",
        partnerCode: partnerCode || "None",
        pp: partnerCode || "None",
        affiliate: partnerCode || "None",

        channel: channel,
        source: source,
        timestamp: new Date().toISOString(),
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

  // 2. Sync Order & Commission into Supabase
  let dbSynced = false;
  try {
    const db = getDb();
    if (db) {
      const { data: product } = await db.from('products')
        .select('id, slug, name, price_kobo, commission_type, commission_value')
        .eq('reference_prefix', 'NEXORA')
        .eq('status', 'active')
        .maybeSingle();

      if (product) {
        // Idempotent order record
        let orderId = null;
        const { data: existingOrder } = await db.from('orders')
          .select('id').eq('paystack_reference', reference).maybeSingle();

        if (existingOrder) {
          orderId = existingOrder.id;
        } else {
          const { data: newOrder } = await db.from('orders').insert({
            product_id: product.id,
            customer_email: customerEmail.toLowerCase(),
            customer_name: customerName.trim() || null,
            paystack_reference: reference,
            amount_kobo: amount,
            status: 'verified',
            webhook_event: 'verify_sync',
          }).select('id').single();
          if (newOrder) orderId = newOrder.id;
        }

        // Affiliate commission
        if (partnerCode) {
          let { data: partner } = await db.from('partners')
            .select('id, code, name, email')
            .eq('code', partnerCode)
            .eq('status', 'active')
            .maybeSingle();

          if (!partner && /^[0-9a-f-]{36}$/i.test(partnerCode)) {
            const { data: pById } = await db.from('partners')
              .select('id, code, name, email')
              .eq('id', partnerCode)
              .eq('status', 'active')
              .maybeSingle();
            if (pById) partner = pById;
          }

          if (partner) {
            // Auto-enroll partner if not already in affiliate_products
            await db.from('affiliate_products').upsert({
              partner_id: partner.id,
              product_id: product.id,
              status: 'active'
            }, { onConflict: 'partner_id,product_id' });

            const commissionKobo = product.commission_type === 'fixed'
              ? Math.round(parseFloat(product.commission_value || 0) * 100)
              : Math.round(amount * (parseFloat(product.commission_value || 0) / 100));

            const { data: existingComm } = await db.from('commissions')
              .select('id').eq('paystack_reference', reference).maybeSingle();

            if (!existingComm) {
              await db.from('commissions').insert({
                affiliate_id: partner.id,
                product_id: product.id,
                order_id: orderId,
                customer_email: customerEmail.toLowerCase(),
                paystack_reference: reference,
                amount_kobo: amount,
                commission_kobo: commissionKobo,
                status: 'pending',
              });
            }
          }
        }
        dbSynced = true;
      }
    }
  } catch (dbErr) {
    // Non-blocking fallback
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
      phone: customerPhone,
    },
    paid_at: data.paid_at,
    partner: partnerCode || null,
    channel,
    source,
    sheet_logged: logged,
    db_synced: dbSynced,
  });
}
