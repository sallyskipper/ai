-- Per-division minimum prices for Solo and Duo Rank Up.
-- Replaces the whole-tier division rules (kept, deactivated) with one rule per
-- division step, keyed by the starting rank, and lowers the rank-up floor to $6.
-- Fresh databases get the same rules from prisma/seed.ts.

UPDATE "PricingRule" r
SET "active" = false, "updatedAt" = now()
FROM "Service" s
WHERE r."serviceId" = s.id
  AND s.slug IN ('valorant-solo-rank-up', 'valorant-duo-rank-up')
  AND r.unit = 'DIVISION'
  AND r.tier IN ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant');

INSERT INTO "PricingRule" (id, "serviceId", unit, tier, variant, "amountCents", active, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s.id, 'DIVISION', l.rank, NULL, l.cents, true, now(), now()
FROM "Service" s
CROSS JOIN (VALUES
  ('Iron 1', 600),
  ('Iron 2', 650),
  ('Iron 3', 700),
  ('Bronze 1', 800),
  ('Bronze 2', 850),
  ('Bronze 3', 900),
  ('Silver 1', 1000),
  ('Silver 2', 1100),
  ('Silver 3', 1200),
  ('Gold 1', 1300),
  ('Gold 2', 1400),
  ('Gold 3', 1500),
  ('Platinum 1', 1600),
  ('Platinum 2', 1750),
  ('Platinum 3', 1900),
  ('Diamond 1', 2000),
  ('Diamond 2', 2150),
  ('Diamond 3', 2300),
  ('Ascendant 1', 2500),
  ('Ascendant 2', 2750),
  ('Ascendant 3', 4000),
  ('Immortal 1', 7000),
  ('Immortal 2', 8500),
  ('Immortal 3', 15000)
) AS l(rank, cents)
WHERE s.slug IN ('valorant-solo-rank-up', 'valorant-duo-rank-up')
  AND NOT EXISTS (
    SELECT 1 FROM "PricingRule" x
    WHERE x."serviceId" = s.id AND x.unit = 'DIVISION' AND x.tier = l.rank AND x.variant IS NULL
  );

UPDATE "Service"
SET "floorPriceCents" = 600, "updatedAt" = now()
WHERE slug IN ('valorant-solo-rank-up', 'valorant-duo-rank-up');
