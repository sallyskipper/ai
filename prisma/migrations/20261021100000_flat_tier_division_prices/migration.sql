-- Flat price per division within each rank tier (prices stack per division climbed).
-- Updates the per-division rules created by 20261021090000_rank_ladder_pricing.
UPDATE "PricingRule" r
SET "amountCents" = t.cents, "updatedAt" = now()
FROM "Service" s,
  (VALUES
    ('Iron', 600), ('Bronze', 800), ('Silver', 1000), ('Gold', 1300),
    ('Platinum', 1600), ('Diamond', 2000), ('Ascendant', 2500), ('Immortal', 7000)
  ) AS t(tier, cents)
WHERE r."serviceId" = s.id
  AND s.slug IN ('valorant-solo-rank-up', 'valorant-duo-rank-up')
  AND r.unit = 'DIVISION'
  AND r.variant IS NULL
  AND r.tier IN (t.tier || ' 1', t.tier || ' 2', t.tier || ' 3');
