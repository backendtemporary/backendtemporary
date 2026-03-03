# RisetexCo Business Intelligence & AI Agent Setup Guide

## 📚 Overview

This guide provides a complete Business Intelligence layer for RisetexCo's textile management system, including:

1. **Schema Analysis** - Assessment of existing temporal data
2. **Database Enhancements** - New tables for procurement, pricing, and analytics
3. **n8n AI Agent SQL Queries** - Ready-to-use queries for pattern analysis
4. **Implementation Strategy** - API vs Direct DB access recommendations
5. **Test Data Generator** - Realistic 6-month dataset for immediate testing

---

## 🚀 Quick Start (30 Minutes)

### Step 1: Run Database Migrations (5 min)

Connect to your Railway MySQL database and run these scripts in order:

```bash
# 1. Add procurement system (suppliers, orders, pricing)
mysql -h your-railway-host -u root -p risetexco < backend/migrate-bi-procurement-system.sql

# 2. Add analytics tables (daily metrics, snapshots)
mysql -h your-railway-host -u root -p risetexco < backend/migrate-bi-analytics-tables.sql
```

**Verify tables created:**
```sql
SHOW TABLES LIKE '%suppliers%';
SHOW TABLES LIKE '%sales_metrics%';
SHOW TABLES LIKE '%inventory_snapshots%';
```

---

### Step 2: Generate Test Data (10 min)

```bash
cd backend

# Ensure DB credentials are in .env
node simulate-textile-data.js
```

This will create:
- ✅ 20 realistic fabric types (cotton, silk, linen, wool)
- ✅ ~100 color variants
- ✅ 50 customers (VIP, Regular, Occasional tiers)
- ✅ 5 salespersons
- ✅ 4 suppliers (Turkey, China, Italy, Lebanon)
- ✅ ~1,200 sales transactions over 6 months
- ✅ ~50 procurement orders
- ✅ Weekly inventory snapshots

**Seasonal Patterns Built-In:**
- Summer fabrics (cotton, linen) peak sales in June-August
- Winter fabrics (wool, velvet) peak sales in December-February
- Realistic stock depletion based on popularity

---

### Step 3: Verify Data & Test Queries (5 min)

Run these queries to confirm data looks good:

```sql
-- Check total sales
SELECT COUNT(*) AS total_transactions, 
       SUM(amount_meters) AS total_meters_sold
FROM logs 
WHERE type = 'sell';

-- Top 5 selling fabrics
SELECT f.fabric_name, 
       SUM(l.amount_meters) AS total_sold
FROM fabrics f
JOIN logs l ON l.fabric_id = f.fabric_id
WHERE l.type = 'sell'
GROUP BY f.fabric_name
ORDER BY total_sold DESC
LIMIT 5;

-- Check seasonal trends
SELECT 
  CASE WHEN MONTH(timestamp) IN (6,7,8) THEN 'Summer'
       WHEN MONTH(timestamp) IN (12,1,2) THEN 'Winter'
       ELSE 'Other'
  END AS season,
  COUNT(*) AS transactions
FROM logs
WHERE type = 'sell'
GROUP BY season;
```

---

### Step 4: Set Up n8n AI Agent (10 min)

#### Option A: Direct DB Access (Recommended for MVP)

1. In n8n, create a new workflow
2. Add a **MySQL** node
3. Configure credentials:
   - **Host**: Your Railway MySQL host
   - **Database**: risetexco
   - **User**: `n8n_analyst` (create this - see Step 5)
   - **Password**: [secure password]

4. Test with a simple query:
```sql
SELECT * FROM v_top_selling_fabrics_30d LIMIT 10;
```

5. Add **AI Agent** node and configure:
   - Model: GPT-4 or Claude
   - System prompt: (see N8N_IMPLEMENTATION_GUIDE.md)
   - Tools: SQL queries from N8N_SQL_QUERIES.md

#### Option B: API Endpoints (Recommended for Production)

See `backend/N8N_IMPLEMENTATION_GUIDE.md` for full API implementation code.

---

### Step 5: Create Read-Only Database User for n8n (Security)

```sql
-- 1. Create user (change password!)
CREATE USER 'n8n_analyst'@'%' IDENTIFIED BY 'YourSecurePasswordHere_2026!';

-- 2. Grant SELECT only (no write permissions)
GRANT SELECT ON risetexco.* TO 'n8n_analyst'@'%';

-- 3. Exclude sensitive tables
REVOKE SELECT ON risetexco.users FROM 'n8n_analyst'@'%';
REVOKE SELECT ON risetexco.audit_logs FROM 'n8n_analyst'@'%';

-- 4. Apply changes
FLUSH PRIVILEGES;

-- 5. Test (should work)
-- Login as n8n_analyst and run:
SELECT * FROM fabrics LIMIT 1;

-- This should FAIL (no INSERT permission):
INSERT INTO fabrics (fabric_name, fabric_code) VALUES ('Test', 'TEST');
```

---

## 📂 File Reference

| File | Purpose |
|------|---------|
| `backend/BI_SCHEMA_ANALYSIS.md` | Analysis of existing schema + identified gaps |
| `backend/migrate-bi-procurement-system.sql` | Creates tables: suppliers, procurement_orders, pricing_history, reorder_rules |
| `backend/migrate-bi-analytics-tables.sql` | Creates tables: sales_metrics_daily, inventory_snapshots, customer_analytics, etc. |
| `backend/N8N_SQL_QUERIES.md` | **10 ready-to-use SQL queries** for n8n AI Agent |
| `backend/N8N_IMPLEMENTATION_GUIDE.md` | Deep dive: API vs Direct DB, security, code examples |
| `backend/simulate-textile-data.js` | Node.js script to generate realistic test data |

---

## 🤖 Example AI Agent Queries

Once your n8n AI Agent is configured, test with these prompts:

### 1. Sales Analysis
**Prompt:** *"What are our top 5 best-selling fabrics this month?"*

**Expected Output:**
> Based on sales data:
> 1. Turkish Cotton (TC-425) - 782 meters sold
> 2. Pure Silk (PS-819) - 645 meters sold
> 3. Belgian Linen (BL-203) - 521 meters sold
> ...

### 2. Inventory Alerts
**Prompt:** *"Which fabrics are critically low in stock?"*

**Expected Output:**
> 🚨 **3 fabrics need immediate attention:**
> - Egyptian Cotton (EC-157), Navy Blue - Only 12 meters left (5 days supply)
> - Silk Chiffon (SC-904), White - Only 8 meters left (3 days supply)
> - Merino Wool (MW-631), Charcoal - OUT OF STOCK

### 3. Customer Retention
**Prompt:** *"Which VIP customers haven't purchased in 60+ days?"*

**Expected Output:**
> 👥 **At-Risk VIP Customers:**
> 1. Boutique Chic Beirut - Last purchase 68 days ago ($12,400 lifetime value)
> 2. Elite Fabrics Store - Last purchase 73 days ago ($9,800 lifetime value)
> 
> **Recommendation:** Send personalized email with 10% loyalty discount.

### 4. Procurement Suggestions
**Prompt:** *"What should we order from suppliers this week?"*

**Expected Output:**
> 📦 **Recommended Procurement (Priority Order):**
> 
> **URGENT (Out of Stock):**
> - Turkish Cotton TC-425 → Order 400 meters from Turkish Textile Mills ($4,800)
> 
> **HIGH (< 1 week supply):**
> - Belgian Linen BL-203 → Order 250 meters from Italian Luxury Fabrics ($4,000)
> - Silk Blend SB-305 → Order 180 meters from Shanghai Silk Co. ($4,500)
> 
> **Total Investment:** $13,300
> **Expected ROI:** 45% margin = ~$19,300 revenue

### 5. Seasonal Predictions
**Prompt:** *"What fabrics should we stock up on for summer?"*

**Expected Output:**
> 🌞 **Summer Season Preparation (June-August):**
> 
> Based on last year's trends:
> - Cotton fabrics see 200% increase in sales
> - Linen (Belgian, Irish) peak in July (+180%)
> - Silk Chiffon popular for summer events (+120%)
> 
> **Recommended Pre-Season Orders:**
> 1. Turkish Cotton - 800 meters
> 2. Belgian Linen - 600 meters
> 3. Organic Cotton - 500 meters
> 
> Order by **May 1st** to ensure availability (45-day supplier lead time).

---

## 🎯 Key SQL Queries to Know

### Query 1: Top Selling Fabrics (Last 30 Days)
```sql
SELECT 
  f.fabric_name,
  COUNT(DISTINCT l.log_id) AS transactions,
  SUM(l.amount_meters) AS total_meters_sold,
  ROUND(SUM(l.amount_meters) / 30, 2) AS avg_meters_per_day
FROM fabrics f
INNER JOIN logs l ON l.fabric_id = f.fabric_id
WHERE l.type = 'sell'
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
GROUP BY f.fabric_name
ORDER BY total_meters_sold DESC
LIMIT 10;
```

### Query 2: Stock Depletion Velocity
```sql
SELECT 
  f.fabric_name,
  c.color_name,
  c.length_meters AS current_stock,
  ROUND(c.length_meters / (SUM(l.amount_meters) / 30), 0) AS days_until_stockout
FROM colors c
JOIN fabrics f ON f.fabric_id = c.fabric_id
LEFT JOIN logs l ON l.color_id = c.color_id 
  AND l.type = 'sell' 
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
WHERE c.sold = 0
GROUP BY c.color_id
HAVING days_until_stockout < 30
ORDER BY days_until_stockout ASC;
```

### Query 3: Customer Lifetime Value
```sql
SELECT 
  c.customer_name,
  COUNT(DISTINCT l.log_id) AS total_purchases,
  SUM(l.amount_meters) AS total_meters_purchased,
  DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) AS days_since_last_purchase,
  CASE 
    WHEN COUNT(DISTINCT l.log_id) >= 10 THEN 'VIP'
    WHEN COUNT(DISTINCT l.log_id) >= 5 THEN 'Regular'
    ELSE 'Occasional'
  END AS customer_tier
FROM customers c
LEFT JOIN logs l ON l.customer_id = c.customer_id AND l.type = 'sell'
GROUP BY c.customer_id
ORDER BY total_meters_purchased DESC;
```

**See `backend/N8N_SQL_QUERIES.md` for 7 more advanced queries!**

---

## 🔐 Security Best Practices

### For Direct DB Access:
- ✅ Use read-only MySQL user (`n8n_analyst`)
- ✅ Revoke access to sensitive tables (users, audit_logs)
- ✅ Set query timeout limits (30 seconds max)
- ✅ Enable MySQL slow query log
- ✅ Monitor query patterns for abuse

### For API Endpoints:
- ✅ Implement JWT authentication
- ✅ Add rate limiting (100 requests/15 min)
- ✅ Validate all input parameters
- ✅ Log all API requests to audit_logs
- ✅ Use HTTPS only (Railway handles this)

---

## 📊 Pre-Built Views Available

After running migrations, these views are automatically created:

| View Name | Purpose |
|-----------|---------|
| `v_top_selling_fabrics_30d` | Top 20 fabrics by sales volume |
| `v_customer_retention` | Customer status: Active/At-Risk/Lost |
| `v_stock_velocity` | Stock depletion rates & reorder alerts |
| `v_salesperson_performance` | Sales metrics per salesperson |
| `v_low_stock_alerts` | Fabrics below reorder threshold |

**Usage:**
```sql
SELECT * FROM v_top_selling_fabrics_30d;
SELECT * FROM v_stock_velocity WHERE stock_status = 'CRITICAL';
```

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        n8n AI Agent (Docker)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ AI Model (GPT-4 / Claude)                                │  │
│  │  - Natural language processing                           │  │
│  │  - Pattern recognition                                   │  │
│  │  - Procurement recommendations                           │  │
│  └────────────┬─────────────────────────────────────────────┘  │
└───────────────┼──────────────────────────────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │  SQL Tools    │
        │  (10 queries) │
        └───────┬───────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
┌─────────┐           ┌──────────────┐
│ Direct  │    OR     │ Express API  │
│ MySQL   │           │ (Optional)   │
│ Access  │           │ - Auth       │
│         │           │ - Caching    │
└────┬────┘           │ - Rate Limit │
     │                └──────┬───────┘
     │                       │
     └───────────┬───────────┘
                 ▼
    ┌─────────────────────────┐
    │  Railway MySQL Database │
    │  ┌───────────────────┐  │
    │  │ Core Tables:      │  │
    │  │ - logs            │  │
    │  │ - fabrics         │  │
    │  │ - colors          │  │
    │  │ - customers       │  │
    │  └───────────────────┘  │
    │  ┌───────────────────┐  │
    │  │ BI Tables:        │  │
    │  │ - suppliers       │  │
    │  │ - procurement_*   │  │
    │  │ - pricing_history │  │
    │  │ - sales_metrics_* │  │
    │  │ - inventory_*     │  │
    │  └───────────────────┘  │
    └─────────────────────────┘
```

---

## 🧪 Testing Checklist

### Database Setup
- [ ] All migration scripts ran without errors
- [ ] BI tables exist: `SHOW TABLES LIKE '%suppliers%';`
- [ ] Views created: `SELECT * FROM v_top_selling_fabrics_30d LIMIT 1;`

### Test Data
- [ ] Simulation script ran successfully
- [ ] At least 1000 transactions created
- [ ] Seasonal patterns visible in data
- [ ] Procurement orders populated

### n8n Configuration
- [ ] MySQL credentials tested
- [ ] Read-only user created and working
- [ ] Sample query returns results
- [ ] AI Agent responds to prompts

### Security
- [ ] Read-only user cannot INSERT/UPDATE/DELETE
- [ ] Sensitive tables (users) access revoked
- [ ] Credentials stored securely (env variables)

---

## 🚨 Troubleshooting

### Issue: "Table doesn't exist" error
**Solution:** Ensure migrations ran in correct order:
1. migrate-bi-procurement-system.sql (creates suppliers first)
2. migrate-bi-analytics-tables.sql (depends on suppliers)

### Issue: Simulation script fails with FK constraint error
**Solution:** Your DB might have existing data. Options:
1. Run on fresh database
2. Modify script to handle existing data
3. Adjust foreign key checks: `SET FOREIGN_KEY_CHECKS=0;`

### Issue: Queries return empty results
**Solution:** 
1. Check date ranges: `WHERE timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 180 DAY)`
2. Verify test data generated: `SELECT COUNT(*) FROM logs WHERE type='sell';`

### Issue: n8n can't connect to Railway MySQL
**Solution:**
1. Check Railway networking (may need TCP proxy)
2. Whitelist n8n Docker container IP
3. Test connection with mysql CLI first

---

## 📈 Roadmap: What's Next?

### Phase 1: MVP (Week 1-2) ✅
- [x] Schema analysis
- [x] Database migrations
- [x] Test data generation
- [x] n8n SQL queries
- [ ] Deploy n8n AI Agent

### Phase 2: API Layer (Week 3-4)
- [ ] Create Express `/api/analytics` endpoints
- [ ] Implement JWT authentication
- [ ] Add request caching (Redis or in-memory)
- [ ] Update n8n to use HTTP Request nodes

### Phase 3: Automation (Month 2)
- [ ] Daily automated reports (email/Slack)
- [ ] Low stock alerts (auto-slack salespersons)
- [ ] Weekly procurement recommendations
- [ ] Customer re-engagement automation

### Phase 4: Advanced Analytics (Month 3+)
- [ ] Predictive demand forecasting (ML model)
- [ ] Dynamic pricing optimization
- [ ] Supplier performance scoring
- [ ] Customer churn prediction

---

## 🎓 Learning Resources

- **n8n Documentation**: https://docs.n8n.io
- **MySQL Optimization**: https://dev.mysql.com/doc/refman/8.0/en/optimization.html
- **Railway Guides**: https://docs.railway.app

---

## 📝 Notes for Your BS Project Report

**Key Points to Highlight:**

1. **Business Problem**: Manual inventory management → missed sales due to stockouts, over-ordering slow-moving items

2. **Technical Solution**: 
   - Temporal data analysis using MySQL time-series queries
   - AI-powered pattern recognition via n8n + LLM
   - Automated procurement recommendations

3. **Results** (After 1 month of real data):
   - X% reduction in stockouts
   - Y% improvement in inventory turnover
   - Z hours saved per week on manual reporting

4. **Technologies Used**:
   - Frontend: React.js (Cloudflare Pages)
   - Backend: Node.js, Express, MySQL (Railway)
   - Automation: n8n (Docker)
   - AI: OpenAI GPT-4 / Anthropic Claude

5. **Academic Contributions**:
   - Real-world application of BI principles
   - Integration of AI/ML in traditional textile industry
   - Lebanese SME digital transformation case study

---

## 🤝 Support

**Created for:** RisetexCo Textile Management System  
**Student:** BS Computer Science @ LAU  
**Project Type:** Business Intelligence Layer + AI Agent  

**Questions?** Review these files:
- Schema issues → `BI_SCHEMA_ANALYSIS.md`
- Query help → `N8N_SQL_QUERIES.md`
- Implementation → `N8N_IMPLEMENTATION_GUIDE.md`

---

## ✅ Final Checklist: Ready to Go?

- [ ] Database migrations completed
- [ ] Test data generated (1000+ transactions)
- [ ] Read-only user created for n8n
- [ ] n8n workflow configured
- [ ] AI Agent responds to test prompts
- [ ] Sample queries return realistic insights

**If all checked, you're ready to demonstrate AI-powered procurement! 🎉**

---

**Next Step:** Run the simulation script and start testing queries in n8n!

```bash
cd backend
node simulate-textile-data.js
```

Then open your n8n workflow and ask: 
> *"What are my top-selling fabrics this month?"*

**Good luck with your BS project! 🚀**
