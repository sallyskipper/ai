-- Duo Rank Up per-division minimums are double the solo ladder
-- (e.g. Ascendant 1 → Immortal 1 = 3 × $50 = $150). Floor doubles to $12.
UPDATE "PricingRule" r
SET "amountCents" = t.cents * 2, "updatedAt" = now()
FROM "Service" s,
  (VALUES
    ('Iron', 600), ('Bronze', 800), ('Silver', 1000), ('Gold', 1300),
    ('Platinum', 1600), ('Diamond', 2000), ('Ascendant', 2500), ('Immortal', 7000)
  ) AS t(tier, cents)
WHERE r."serviceId" = s.id
  AND s.slug = 'valorant-duo-rank-up'
  AND r.unit = 'DIVISION'
  AND r.variant IS NULL
  AND r.tier IN (t.tier || ' 1', t.tier || ' 2', t.tier || ' 3');

UPDATE "Service" SET "floorPriceCents" = 1200, "updatedAt" = now() WHERE slug = 'valorant-duo-rank-up';
