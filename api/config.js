// NEXORA payment config endpoint.
// Returns only NON-SECRET values the browser needs to open the Paystack popup.
// Same offer, two prices, two separate Paystack integrations + separate tracking sheets:
//  - marketplace (default): ₦7,490  -> 749000 kobo   (PAYSTACK_PUBLIC_KEY / SHEET_WEBHOOK_URL)
//  - ads / sales page:      ₦4,987  -> 498700 kobo   (PAYSTACK_ADS_PUBLIC_KEY / SHEET_ADS_WEBHOOK_URL)

const TIERS = {
  marketplace: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: process.env.PAYSTACK_AMOUNT_KOBO || '749000',
    priceNaira: process.env.PAYSTACK_PRICE_NAIRA || '7,490',
  },
  ads: {
    publicKey: process.env.PAYSTACK_ADS_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || '',
    amountKobo: process.env.PAYSTACK_ADS_AMOUNT_KOBO || '498700',
    priceNaira: '4,987',
  },
};

export default function handler(req, res) {
  const currency = process.env.PAYSTACK_CURRENCY || 'NGN';

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestedTier = url.searchParams.get('tier') || 'marketplace';
  const isKnownTier = Object.prototype.hasOwnProperty.call(TIERS, requestedTier);
  const tier = isKnownTier ? requestedTier : 'marketplace';
  const active = TIERS[tier];

  if (!active.publicKey) {
    return res.status(500).json({
      error: tier === 'ads'
        ? 'Paystack ads public key (PAYSTACK_ADS_PUBLIC_KEY) is not configured yet.'
        : 'Paystack public key is not configured yet.',
      ok: false,
    });
  }

  return res.status(200).json({
    ok: true,
    publicKey: active.publicKey,
    currency,
    tier,
    amount: active.amountKobo,
    priceNaira: active.priceNaira,
    tiers: {
      marketplace: TIERS.marketplace.amountKobo,
      ads: TIERS.ads.amountKobo,
    },
  });
}