# HazardLink — Pricing Model

Working spreadsheet equivalent (in markdown for easy version control).
Use this to model deal economics in sales conversations + plan cash flow.

---

## Per-unit BOM (cost to you)

### Hanger
| Item | Cost at qty 100 | Cost at qty 1000 |
|---|---|---|
| Heltec V3 board | €18 | €12 |
| Samsung 21700 50E + holder | €8 | €6 |
| DRV5032 Hall sensor | €1 | €0.50 |
| Antenna | €2 | €1.50 |
| Enclosure (3D print → injection mould) | €4 | €3.50 |
| Microswitch + LEDs + cabling | €2 | €1.20 |
| Assembly + flash + test | €0 (DIY) | €4 |
| **Hanger BOM** | **€35** | **€29** |

### Sign tag (UWB)
| Item | Cost at qty 100 | Cost at qty 1000 |
|---|---|---|
| Qorvo DWM3001 module | €12 | €8 |
| 500mAh LiPo | €5 | €3 |
| Magnet + potting | €0.50 | €0.40 |
| Enclosure | €2 | €1.20 |
| Assembly | €0 | €1 |
| **Tag BOM** | **€19.50** | **€13.60** |

### Gateway
| Item | Cost at qty 100 |
|---|---|
| Heltec V3 + 5dBi antenna + USB-C plug + enclosure | **€49** |

---

## Customer pricing (you charge them this)

### Small site — 10 hangers, 10 tags, 1 gateway
| | Cost to you | Charge customer | Margin |
|---|---|---|---|
| Hardware | €585 | €1,500 | 61% |
| Monthly SaaS | €0 cloud cost | €30/month | ~100% gross |

**Annual revenue per small customer**: €30 × 12 = €360 ARR + €1,500 setup = €1,860 year 1; €360/yr recurring.

### Medium site — 50 hangers, 50 tags, 2 gateways
| | Cost to you | Charge customer | Margin |
|---|---|---|---|
| Hardware | €2,823 | €6,500 | 57% |
| Monthly SaaS | €0 cloud cost | €100/month | ~100% gross |

**Annual revenue per medium customer**: €1,200 ARR + €6,500 setup = €7,700 year 1; €1,200/yr recurring.

### Large site — 200 hangers, 200 tags, 5 gateways
| | Cost to you | Charge customer | Margin |
|---|---|---|---|
| Hardware | €11,045 | €25,000 | 56% |
| Monthly SaaS | ~€5/mo cloud cost | €350/month | ~98% gross |

**Annual revenue per large customer**: €4,200 ARR + €25,000 setup = €29,200 year 1; €4,200/yr recurring.

---

## Customer ROI argument (use in sales calls)

For a 50-hanger commercial cleaning customer:

| Saving / Year | Conservative | Optimistic |
|---|---|---|
| Insurance premium discount (10%) | €2,000 | €5,000 |
| Reduced incidents (1 fewer slip claim avoided every 5 years) | €1,500 | €8,000 |
| Faster cleaner response = less downstream damage | €1,200 | €2,500 |
| Anti-theft sign replacement saved | €400 | €600 |
| Reduced legal/audit/investigation costs | €1,000 | €5,000 |
| **Total saved per year** | **€6,100** | **€21,100** |
| HazardLink cost (5-year amortised) | €2,500 | €2,500 |
| **Net ROI** | **2.4×** | **8.4×** |

Pitch: *"Our system pays for itself in the first year on insurance
discount alone. Everything else is gravy."*

---

## Break-even analysis (your business side)

| | Cost |
|---|---|
| One-time engineering NRE (PCB design, tooling, certs) | €27,500 |
| Pre-launch legal + insurance + patent | €5,000 |
| First production batch (500 hangers, 500 tags, 50 gateways) | €25,000 |
| Marketing + launch | €3,000 |
| Cash needed before first €1 of revenue | **€60,500** |

Recovery scenarios:

| Customer mix | Year 1 revenue | Months to break-even |
|---|---|---|
| 5 small + 5 medium | €9,300 + €38,500 = €47,800 | 14 months |
| 10 medium + 2 large | €77,000 + €58,400 = €135,400 | 5 months |
| 30 small + 10 medium | €55,800 + €77,000 = €132,800 | 5 months |

Realistic year-1 target: **10 medium + 3 large = €164,400 in revenue, 4-month break-even**.

---

## Cash flow timing (when money lands)

Hardware sale → invoiced on order, paid in 30 days (NET 30).
Monthly SaaS → debited monthly via Stripe.

For a medium customer signing in month 1:
- Month 1: invoice €6,500 hardware
- Month 1-end: receive €6,500
- Month 2 onwards: €100/month subscription debits

For your business, hardware revenue is front-loaded. SaaS revenue is the
compounding annuity that justifies the engineering investment over 3-5
years.

---

## Multi-year customer LTV

Assuming **5-year average customer lifetime** (B2B SaaS norm):

| Tier | Total revenue over 5 years |
|---|---|
| Small | €1,500 + (€30 × 60) = €3,300 |
| Medium | €6,500 + (€100 × 60) = €12,500 |
| Large | €25,000 + (€350 × 60) = €46,000 |

LTV:CAC ratio (assuming €500 CAC):
- Small: 6.6×
- Medium: 25×
- Large: 92×

**Conclusion**: focus sales effort on MEDIUM + LARGE customers. Small
customers are fine but don't disproportionately spend sales time on them.

---

## Sensitivities to test in sales

1. What if customer says "€6,500 is too much for hardware?"
   → Offer 36-month financing at €230/month (covers your cost, modest interest)
2. What if customer says "Can I just rent it monthly?"
   → Yes — hardware-as-a-service tier: €0 setup, €250/month (covers BOM
     amortisation + cloud + 30% margin over 36 months)
3. What if a competitor undercuts you on price?
   → Lead with compliance PDF + insurance discount math. Hardly anyone
     else has that yet — it's worth €2-5k/year to a customer on its own.
