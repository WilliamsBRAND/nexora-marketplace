// NEXORA payment config endpoint (Marketplace)
const TIERS = {
  marketplace: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: '770600', // ₦7,490 base + ₦216 Paystack processing fee = ₦7,706
    priceNaira: '7,706',
  },
  ads: {
    publicKey: process.env.PAYSTACK_ADS_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: '517800', // ₦4,997 base + ₦181 Paystack processing fee = ₦5,178
    priceNaira: '5,178',
  },
};

export default function handler(req, res) {
  const currency = process.env.PAYSTACK_CURRENCY || 'NGN';
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestedTier = url.searchParams.get('tier') || 'marketplace';
  const tier = TIERS[requestedTier] ? requestedTier : 'marketplace';
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
  });
}
