# Testing Environment

Use a separate MySQL database for testing. Do not seed the production database.

## Recommended Setup

1. Create a test database, for example `risetexco_test`.
2. Load the schema from `schema-dump.sql`.
3. Create a `.env.test` file with the same keys as `.env`, but point `DB_NAME` to the test database and set `NODE_ENV=test`.
4. Validate the schema:

```bash
npm run seed:test -- --env-file=.env.test --check-schema
```

5. Fill the database with deterministic test data:

```bash
npm run seed:test -- --env-file=.env.test
```

If you are using your current local `.env`, run:

```bash
npm run seed:test
```

The seeder refuses `NODE_ENV=production`, database names containing `prod` or `production`, and non-local DB hosts unless you pass `--allow-remote`. Only use `--allow-remote` for a disposable remote test database.

## What The Seeder Creates

- Four test users: `test_admin`, `test_ceo`, `test_manager`, and `test_accountant`
- Shared password for all test users: `Test123!`
- Test fabrics, colors, lots, customers, salespersons, sales, partial returns, low-stock inventory, and weight-based inventory
- A printed accuracy summary after every run
- A generated JSON summary at `data/test-seed-summary.json`

The seed data uses the marker `TEST_SEED_RISETEXCO_2026_04` and test prefixes like `TST-` and `TEST -`. Re-running the seeder removes only previous records with those test markers, then recreates the same dataset.

## Accuracy Checks

After seeding, compare your frontend, API, or AI/n8n answers against the summary printed by the script or the generated JSON file.

Useful API checks:

```bash
curl http://localhost:5000/api/health
```

Login with `test_admin / Test123!`, then compare these areas:

- Top fabric by sold meters
- Top customer by sold meters
- Top salesperson by sold meters
- Lowest length-based stock color
- Monthly sell and return totals

Useful SQL checks:

```sql
SELECT f.fabric_name, SUM(l.amount_meters) AS sold_meters
FROM logs l
JOIN fabrics f ON f.fabric_id = l.fabric_id
WHERE l.notes LIKE '%TEST_SEED_RISETEXCO_2026_04%' AND l.type = 'sell'
GROUP BY f.fabric_id, f.fabric_name
ORDER BY sold_meters DESC;

SELECT c.customer_name, SUM(l.amount_meters) AS sold_meters
FROM logs l
JOIN customers c ON c.customer_id = l.customer_id
WHERE l.notes LIKE '%TEST_SEED_RISETEXCO_2026_04%' AND l.type = 'sell'
GROUP BY c.customer_id, c.customer_name
ORDER BY sold_meters DESC;
```

The older `simulate-textile-data.js` targets extra BI tables that are not present in the current local schema, so use `seed-test-data.js` for the core local system.
