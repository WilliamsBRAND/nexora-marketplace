// NEXORA payment config endpoint (Marketplace)
const TIERS = {
  marketplace: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: '2500000', // Standard price: ₦25,000
    priceNaira: '25,000',
  },
  partner: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: '2000000', // 20% partner discount on ₦25,000 = ₦20,000
    priceNaira: '20,000',
    discountPercent: 20,
    originalPriceNaira: '25,000',
  },
  };

export default function handler(req, res) {
  const currency = process.env.PAYSTACK_CURRENCY || 'NGN';
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pp = url.searchParams.get('pp') || url.searchParams.get('partner') || url.searchParams.get('ref') || '';
  const requestedTier = url.searchParams.get('tier') || '';
  
  // If a partner referral code is present or partner tier requested, apply the 20% partner discount (₦20,000)
  let tier = 'marketplace';
  if (pp || requestedTier === 'partner') {
    tier = 'partner';
  } else if (requestedTier && TIERS[requestedTier]) {
    tier = requestedTier;
  }
  
  const active = TIERS[tier];
  const publicKey = active.publicKey || process.env.PAYSTACK_PUBLIC_KEY || '';

  if (!publicKey) {
    return res.status(500).json({
      error: 'Paystack public key is not configured yet.',
      ok: false,
    });
  }

  return res.status(200).json({
    ok: true,
    publicKey,
    currency,
    tier,
    amount: active.amountKobo,
    priceNaira: active.priceNaira,
    discountPercent: active.discountPercent || 0,
    originalPriceNaira: active.originalPriceNaira || active.priceNaira,
    partnerCode: pp || null,
  });
}
