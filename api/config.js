// NEXORA payment config endpoint (Marketplace)
const TIERS = {
  marketplace: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: '760000', // Standard retail price: ₦7,600
    priceNaira: '7,600',
  },
  partner: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: '608000', // 20% partner discount on ₦7,600 = ₦6,080
    priceNaira: '6,080',
    discountPercent: 20,
    originalPriceNaira: '7,600',
  },
  ads: {
    publicKey: process.env.PAYSTACK_ADS_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: '517800',
    priceNaira: '5,178',
  },
};

export default function handler(req, res) {
  const currency = process.env.PAYSTACK_CURRENCY || 'NGN';
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pp = url.searchParams.get('pp') || url.searchParams.get('partner') || url.searchParams.get('ref') || '';
  const requestedTier = url.searchParams.get('tier') || '';
  
  // If a partner referral code is present or partner tier requested, apply the 20% partner discount (₦6,080)
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
