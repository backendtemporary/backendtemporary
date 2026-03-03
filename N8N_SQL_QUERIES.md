# n8n AI Agent SQL Tool Definitions

## Overview
This document contains **ready-to-use SQL queries** for your n8n AI Agent (Data Analyst). These queries answer common business intelligence questions about inventory, sales, and procurement.

---

## 🔧 How to Use in n8n

### Option 1: MySQL Tool (Direct DB Access)
```json
{
  "toolName": "query_top_selling_fabrics_30d",
  "toolDescription": "Get the top 20 best-selling fabrics in the last 30 days with sales metrics",
  "sql": "SELECT ... (see queries below)"
}
```

### Option 2: HTTP Request Tool (API Endpoint)
```json
{
  "method": "POST",
  "url": "https://your-backend.railway.app/api/analytics/top-selling",
  "headers": { "Authorization": "Bearer {{$node['Auth'].json['token']}}" },
  "body": { "days": 30, "limit": 20 }
}
```

---

## 📊 Query Library

### 1. Top Selling Fabrics (Last 30/60/90 Days)
**Use Case:** "Which fabrics are moving fastest right now?"

```sql
SELECT 
  f.fabric_id,
  f.fabric_name,
  f.fabric_code,
  COUNT(DISTINCT l.log_id) AS transaction_count,
  SUM(l.amount_meters) AS total_meters_sold,
  ROUND(SUM(l.amount_meters) * 1.09361, 2) AS total_yards_sold,
  COUNT(DISTINCT l.customer_id) AS unique_customers,
  ROUND(AVG(l.amount_meters), 2) AS avg_transaction_meters,
  DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) AS days_since_last_sale,
  ROUND(SUM(l.amount_meters) / 30, 2) AS avg_meters_per_day
FROM fabrics f
INNER JOIN logs l ON l.fabric_id = f.fabric_id
WHERE l.type = 'sell'
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
GROUP BY f.fabric_id, f.fabric_name, f.fabric_code
ORDER BY total_meters_sold DESC
LIMIT 20;
```

**Parameters to expose:**
- `days`: 30, 60, 90 (default: 30)
- `limit`: 5, 10, 20 (default: 20)

---

### 2. Stock Depletion Velocity (Critical Inventory Alerts)
**Use Case:** "What will run out of stock soon?"

```sql
SELECT 
  f.fabric_id,
  f.fabric_name,
  c.color_id,
  c.color_name,
  c.length_meters AS current_stock_meters,
  ROUND(c.length_meters * 1.09361, 2) AS current_stock_yards,
  COALESCE(SUM(l.amount_meters), 0) AS sold_last_30d,
  ROUND(COALESCE(SUM(l.amount_meters) / 30, 0), 2) AS avg_daily_sales_meters,
  CASE 
    WHEN COALESCE(SUM(l.amount_meters) / 30, 0) = 0 THEN NULL
    ELSE ROUND(c.length_meters / (SUM(l.amount_meters) / 30), 0)
  END AS days_until_stockout,
  CASE 
    WHEN c.length_meters <= 0 THEN 'OUT_OF_STOCK'
    WHEN (c.length_meters / NULLIF((SUM(l.amount_meters) / 30), 0)) < 7 THEN 'CRITICAL'
    WHEN (c.length_meters / NULLIF((SUM(l.amount_meters) / 30), 0)) < 30 THEN 'LOW'
    WHEN (c.length_meters / NULLIF((SUM(l.amount_meters) / 30), 0)) < 60 THEN 'MODERATE'
    ELSE 'HEALTHY'
  END AS stock_status
FROM fabrics f
INNER JOIN colors c ON c.fabric_id = f.fabric_id
LEFT JOIN logs l ON l.color_id = c.color_id 
  AND l.type = 'sell' 
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
WHERE c.sold = 0
GROUP BY f.fabric_id, f.fabric_name, c.color_id, c.color_name, c.length_meters
HAVING stock_status IN ('CRITICAL', 'LOW', 'OUT_OF_STOCK')
ORDER BY days_until_stockout ASC, current_stock_meters ASC
LIMIT 50;
```

**AI Agent Interpretation:**
- `days_until_stockout < 7`: "URGENT: Order immediately"
- `days_until_stockout < 30`: "WARNING: Schedule procurement"
- `OUT_OF_STOCK`: "Already depleted - check customer demand"

---

### 3. Customer Retention & Churn Analysis
**Use Case:** "Which customers are at risk of leaving?"

```sql
SELECT 
  c.customer_id,
  c.customer_name,
  c.phone,
  c.email,
  COUNT(DISTINCT l.log_id) AS total_purchases,
  MIN(DATE(l.timestamp)) AS first_purchase_date,
  MAX(DATE(l.timestamp)) AS last_purchase_date,
  DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) AS days_since_last_purchase,
  DATEDIFF(MAX(l.timestamp), MIN(l.timestamp)) AS customer_lifetime_days,
  SUM(l.amount_meters) AS total_meters_purchased,
  ROUND(AVG(l.amount_meters), 2) AS avg_transaction_size,
  CASE 
    WHEN DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) <= 30 THEN 'Active'
    WHEN DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) <= 90 THEN 'At-Risk'
    WHEN DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) <= 180 THEN 'Dormant'
    ELSE 'Lost'
  END AS customer_status,
  CASE 
    WHEN COUNT(DISTINCT l.log_id) >= 10 THEN 'VIP'
    WHEN COUNT(DISTINCT l.log_id) >= 5 THEN 'Regular'
    ELSE 'Occasional'
  END AS customer_tier
FROM customers c
LEFT JOIN logs l ON l.customer_id = c.customer_id AND l.type = 'sell'
GROUP BY c.customer_id, c.customer_name, c.phone, c.email
HAVING days_since_last_purchase IS NOT NULL
ORDER BY 
  CASE customer_status
    WHEN 'At-Risk' THEN 1
    WHEN 'Dormant' THEN 2
    WHEN 'Lost' THEN 3
    WHEN 'Active' THEN 4
  END,
  total_meters_purchased DESC
LIMIT 100;
```

**AI Agent Actions:**
- **At-Risk** (30-90 days): "Send re-engagement email with special offer"
- **Dormant** (90-180 days): "Call personally, offer loyalty discount"
- **Lost** (180+ days): "Win-back campaign with new product showcase"

---

### 4. Seasonal Buying Patterns
**Use Case:** "What sells best in Spring/Summer/Fall/Winter?"

```sql
SELECT 
  f.fabric_id,
  f.fabric_name,
  CASE 
    WHEN MONTH(l.timestamp) IN (3, 4, 5) THEN 'Spring'
    WHEN MONTH(l.timestamp) IN (6, 7, 8) THEN 'Summer'
    WHEN MONTH(l.timestamp) IN (9, 10, 11) THEN 'Fall'
    ELSE 'Winter'
  END AS season,
  YEAR(l.timestamp) AS year,
  COUNT(DISTINCT l.log_id) AS transaction_count,
  SUM(l.amount_meters) AS total_meters_sold,
  ROUND(AVG(l.amount_meters), 2) AS avg_transaction_size,
  COUNT(DISTINCT l.customer_id) AS unique_customers
FROM fabrics f
INNER JOIN logs l ON l.fabric_id = f.fabric_id
WHERE l.type = 'sell'
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 2 YEAR)
GROUP BY f.fabric_id, f.fabric_name, season, year
ORDER BY season, total_meters_sold DESC;
```

**AI Agent Insights:**
- Compare current season to last year: "Spring 2026 sales are 15% higher than Spring 2025"
- Recommend procurement: "Stock up on [fabric] for upcoming Summer season"

---

### 5. Supplier Performance Analysis
**Use Case:** "Which supplier delivers on time and has best quality?"

```sql
-- Requires procurement tables (from migrate-bi-procurement-system.sql)
SELECT 
  s.supplier_id,
  s.supplier_name,
  s.country,
  COUNT(DISTINCT po.order_id) AS total_orders,
  SUM(po.total_cost) AS total_spent,
  ROUND(AVG(po.total_cost), 2) AS avg_order_value,
  SUM(CASE WHEN po.status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
  ROUND(
    (SUM(CASE WHEN po.status = 'delivered' THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
    2
  ) AS delivery_success_rate_pct,
  ROUND(
    AVG(DATEDIFF(po.actual_delivery_date, po.expected_delivery_date)),
    1
  ) AS avg_delay_days,
  ROUND(s.rating, 2) AS quality_rating,
  MIN(po.order_date) AS first_order_date,
  MAX(po.order_date) AS last_order_date,
  DATEDIFF(CURRENT_DATE, MAX(po.order_date)) AS days_since_last_order
FROM suppliers s
LEFT JOIN procurement_orders po ON po.supplier_id = s.supplier_id
WHERE s.active = TRUE
GROUP BY s.supplier_id, s.supplier_name, s.country, s.rating
ORDER BY quality_rating DESC, delivery_success_rate_pct DESC
LIMIT 20;
```

**AI Agent Recommendations:**
- **High rating + fast delivery**: "Preferred supplier for urgent orders"
- **Late deliveries**: "Consider alternative supplier or adjust lead time"

---

### 6. Profitability by Fabric (Requires Pricing Data)
**Use Case:** "Which fabrics make the most profit?"

```sql
-- Requires pricing_history table
SELECT 
  f.fabric_id,
  f.fabric_name,
  SUM(l.amount_meters) AS total_meters_sold_90d,
  ROUND(AVG(ph.cost_per_meter), 2) AS avg_cost_per_meter,
  ROUND(AVG(ph.sale_price_per_meter), 2) AS avg_sale_price_per_meter,
  ROUND(
    (AVG(ph.sale_price_per_meter) - AVG(ph.cost_per_meter)) * SUM(l.amount_meters),
    2
  ) AS total_profit_90d,
  ROUND(
    ((AVG(ph.sale_price_per_meter) - AVG(ph.cost_per_meter)) / AVG(ph.cost_per_meter)) * 100,
    2
  ) AS profit_margin_pct
FROM fabrics f
INNER JOIN logs l ON l.fabric_id = f.fabric_id
LEFT JOIN pricing_history ph ON ph.fabric_id = f.fabric_id 
  AND (ph.effective_to IS NULL OR ph.effective_to >= l.timestamp)
  AND ph.effective_from <= l.timestamp
WHERE l.type = 'sell'
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
GROUP BY f.fabric_id, f.fabric_name
ORDER BY total_profit_90d DESC
LIMIT 20;
```

**AI Agent Strategy:**
- **High margin + low sales**: "Increase marketing for high-profit items"
- **Low margin + high sales**: "Negotiate better cost with supplier"

---

### 7. Monthly Sales Trend (Time Series)
**Use Case:** "Are sales growing or declining?"

```sql
SELECT 
  DATE_FORMAT(l.timestamp, '%Y-%m') AS month,
  COUNT(DISTINCT l.log_id) AS total_transactions,
  SUM(l.amount_meters) AS total_meters_sold,
  ROUND(SUM(l.amount_meters) * 1.09361, 2) AS total_yards_sold,
  COUNT(DISTINCT l.customer_id) AS unique_customers,
  COUNT(DISTINCT l.fabric_id) AS unique_fabrics_sold,
  ROUND(AVG(l.amount_meters), 2) AS avg_transaction_size
FROM logs l
WHERE l.type = 'sell'
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
GROUP BY month
ORDER BY month ASC;
```

**AI Agent Insights:**
- Calculate month-over-month growth: `(current_month - previous_month) / previous_month * 100`
- Identify trends: "3-month moving average shows 12% growth"

---

### 8. Product Affinity (What Customers Buy Together)
**Use Case:** "If a customer buys Fabric A, what else do they buy?"

```sql
SELECT 
  f1.fabric_name AS primary_fabric,
  f2.fabric_name AS often_bought_with,
  COUNT(DISTINCT tg.transaction_group_id) AS times_bought_together,
  COUNT(DISTINCT tg.customer_id) AS unique_customers
FROM transaction_groups tg
INNER JOIN logs l1 ON l1.transaction_group_id = tg.transaction_group_id
INNER JOIN logs l2 ON l2.transaction_group_id = tg.transaction_group_id
INNER JOIN fabrics f1 ON f1.fabric_id = l1.fabric_id
INNER JOIN fabrics f2 ON f2.fabric_id = l2.fabric_id
WHERE l1.fabric_id < l2.fabric_id  -- Avoid duplicates (A+B same as B+A)
  AND l1.type = 'sell'
  AND l2.type = 'sell'
  AND tg.transaction_date >= DATE_SUB(CURRENT_DATE, INTERVAL 180 DAY)
GROUP BY f1.fabric_id, f1.fabric_name, f2.fabric_id, f2.fabric_name
HAVING times_bought_together >= 3
ORDER BY times_bought_together DESC
LIMIT 50;
```

**AI Agent Use:**
- **Cross-selling**: "Customers who buy [Fabric A] often buy [Fabric B]"
- **Bundle offers**: "Create combo discount for frequently paired items"

---

### 9. Procurement Recommendations (What to Buy Next)
**Use Case:** "Based on current trends, what should we order?"

```sql
SELECT 
  f.fabric_id,
  f.fabric_name,
  f.fabric_code,
  -- Current stock
  COALESCE(SUM(c.length_meters), 0) AS current_stock_meters,
  -- Sales velocity (last 30 days)
  COALESCE(
    (SELECT SUM(l.amount_meters) 
     FROM logs l 
     WHERE l.fabric_id = f.fabric_id 
       AND l.type = 'sell' 
       AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)),
    0
  ) AS sold_last_30d,
  -- Average daily sales
  ROUND(
    COALESCE(
      (SELECT SUM(l.amount_meters) 
       FROM logs l 
       WHERE l.fabric_id = f.fabric_id 
         AND l.type = 'sell' 
         AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)),
      0
    ) / 30,
    2
  ) AS avg_daily_sales_meters,
  -- Days until stockout
  CASE 
    WHEN COALESCE(
      (SELECT SUM(l.amount_meters) 
       FROM logs l 
       WHERE l.fabric_id = f.fabric_id 
         AND l.type = 'sell' 
         AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)),
      0
    ) = 0 THEN NULL
    ELSE ROUND(
      COALESCE(SUM(c.length_meters), 0) / 
      (COALESCE(
        (SELECT SUM(l.amount_meters) 
         FROM logs l 
         WHERE l.fabric_id = f.fabric_id 
           AND l.type = 'sell' 
           AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)),
        0
      ) / 30),
      0
    )
  END AS days_until_stockout,
  -- Recommended order quantity (60 days supply)
  ROUND(
    (COALESCE(
      (SELECT SUM(l.amount_meters) 
       FROM logs l 
       WHERE l.fabric_id = f.fabric_id 
         AND l.type = 'sell' 
         AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)),
      0
    ) / 30) * 60,
    2
  ) AS recommended_order_meters,
  -- Priority level
  CASE 
    WHEN COALESCE(SUM(c.length_meters), 0) = 0 THEN 'URGENT - OUT OF STOCK'
    WHEN (
      COALESCE(SUM(c.length_meters), 0) / 
      NULLIF((COALESCE(
        (SELECT SUM(l.amount_meters) 
         FROM logs l 
         WHERE l.fabric_id = f.fabric_id 
           AND l.type = 'sell' 
           AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)),
        0
      ) / 30), 0)
    ) < 7 THEN 'HIGH - Less than 1 week'
    WHEN (
      COALESCE(SUM(c.length_meters), 0) / 
      NULLIF((COALESCE(
        (SELECT SUM(l.amount_meters) 
         FROM logs l 
         WHERE l.fabric_id = f.fabric_id 
           AND l.type = 'sell' 
           AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)),
        0
      ) / 30), 0)
    ) < 30 THEN 'MEDIUM - Less than 1 month'
    ELSE 'LOW - Sufficient stock'
  END AS priority,
  -- Best supplier (most recent order)
  (SELECT s.supplier_name 
   FROM procurement_order_items poi
   JOIN procurement_orders po ON po.order_id = poi.order_id
   JOIN suppliers s ON s.supplier_id = po.supplier_id
   WHERE poi.fabric_id = f.fabric_id
   ORDER BY po.order_date DESC
   LIMIT 1
  ) AS recommended_supplier
FROM fabrics f
LEFT JOIN colors c ON c.fabric_id = f.fabric_id AND c.sold = 0
GROUP BY f.fabric_id, f.fabric_name, f.fabric_code
HAVING sold_last_30d > 0  -- Only fabrics with recent sales
ORDER BY 
  CASE priority
    WHEN 'URGENT - OUT OF STOCK' THEN 1
    WHEN 'HIGH - Less than 1 week' THEN 2
    WHEN 'MEDIUM - Less than 1 month' THEN 3
    ELSE 4
  END,
  sold_last_30d DESC
LIMIT 50;
```

**AI Agent Output:**
> "🚨 **URGENT**: 3 fabrics are out of stock with active demand  
> 📦 **Recommended Orders**:  
> - **Turkish Cotton (TC-101)**: Order 250 meters from Turkish Textile Mills  
> - **Silk Blend (SB-305)**: Order 180 meters from Shanghai Silk Co.  
> - **Linen White (LW-220)**: Order 320 meters from Italian Luxury Fabrics"

---

### 10. Year-over-Year Growth Comparison
**Use Case:** "How does this year compare to last year?"

```sql
SELECT 
  f.fabric_name,
  SUM(CASE 
    WHEN YEAR(l.timestamp) = YEAR(CURRENT_DATE) THEN l.amount_meters 
    ELSE 0 
  END) AS meters_sold_this_year,
  SUM(CASE 
    WHEN YEAR(l.timestamp) = YEAR(CURRENT_DATE) - 1 THEN l.amount_meters 
    ELSE 0 
  END) AS meters_sold_last_year,
  ROUND(
    ((SUM(CASE WHEN YEAR(l.timestamp) = YEAR(CURRENT_DATE) THEN l.amount_meters ELSE 0 END) -
      SUM(CASE WHEN YEAR(l.timestamp) = YEAR(CURRENT_DATE) - 1 THEN l.amount_meters ELSE 0 END)) /
      NULLIF(SUM(CASE WHEN YEAR(l.timestamp) = YEAR(CURRENT_DATE) - 1 THEN l.amount_meters ELSE 0 END), 0)) * 100,
    2
  ) AS yoy_growth_pct,
  CASE 
    WHEN SUM(CASE WHEN YEAR(l.timestamp) = YEAR(CURRENT_DATE) THEN l.amount_meters ELSE 0 END) >
         SUM(CASE WHEN YEAR(l.timestamp) = YEAR(CURRENT_DATE) - 1 THEN l.amount_meters ELSE 0 END)
    THEN 'Growing ↗️'
    ELSE 'Declining ↘️'
  END AS trend
FROM fabrics f
INNER JOIN logs l ON l.fabric_id = f.fabric_id
WHERE l.type = 'sell'
  AND YEAR(l.timestamp) IN (YEAR(CURRENT_DATE), YEAR(CURRENT_DATE) - 1)
GROUP BY f.fabric_id, f.fabric_name
HAVING meters_sold_last_year > 0
ORDER BY yoy_growth_pct DESC
LIMIT 20;
```

---

## 🎯 AI Agent Prompt Template

When configuring your n8n AI Agent, use this system prompt:

```
You are a Data Analyst for RisetexCo, a textile company in Lebanon.

Your role:
- Analyze sales patterns and inventory data from MySQL database
- Identify buying trends and seasonal patterns
- Recommend procurement actions (what fabrics to buy next)
- Alert management about low stock and at-risk customers
- Provide actionable business insights

Available tools:
1. query_top_selling_fabrics_30d - Best sellers
2. query_stock_velocity - Inventory depletion rates
3. query_customer_retention - Customer churn analysis
4. query_seasonal_patterns - Seasonal buying trends
5. query_procurement_recommendations - What to order next

When analyzing:
- Always provide quantitative metrics (numbers, percentages)
- Prioritize urgent actions (out-of-stock, at-risk customers)
- Consider Lebanese business context (currency, seasonal holidays)
- Format outputs as actionable recommendations, not just data dumps

Example output:
"📊 Weekly Sales Report:
• Total sales: 1,250 meters (↑15% vs last week)
• Top fabric: Turkish Cotton TC-101 (320m sold)
• 🚨 ALERT: 3 fabrics critically low stock
• 💰 Recommended procurement: $12,500 for 5 high-demand fabrics
• 👥 2 VIP customers haven't purchased in 45 days - reach out"
```

---

## 📈 Performance Optimization Tips

1. **Use Indexes**: All date columns (`timestamp`, `epoch`, `order_date`) should be indexed
2. **Limit Date Ranges**: Always use `WHERE timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL X DAY)`
3. **Pre-aggregate**: Use the `sales_metrics_daily` table for faster queries
4. **Pagination**: Add `LIMIT` and `OFFSET` for large result sets
5. **Cache Results**: In n8n, cache query results for 5-15 minutes

---

## 🔐 Security Considerations

When exposing to n8n:
1. **Read-Only User**: Create a MySQL user with `SELECT` privileges only
2. **Rate Limiting**: Limit query frequency to prevent DB overload
3. **Query Validation**: Whitelist only approved queries (no dynamic SQL)
4. **Sensitive Data**: Exclude customer emails/phones from public reports

```sql
-- Create read-only user for n8n
CREATE USER 'n8n_analyst'@'%' IDENTIFIED BY 'secure_password_here';
GRANT SELECT ON risetexco.* TO 'n8n_analyst'@'%';
FLUSH PRIVILEGES;
```

---

## 🚀 Next Steps

1. ✅ Run migration scripts to create BI tables
2. ✅ Populate with test data (use simulation script)
3. ✅ Test queries in MySQL Workbench
4. Implement in n8n as SQL tools or API endpoints
5. Train AI Agent with sample questions
6. Schedule automated daily reports

**Queries ready to copy-paste into n8n! 🎉**
