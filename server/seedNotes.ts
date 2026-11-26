import fs from 'fs';
import path from 'path';

interface SeedNote {
  folder: string;
  filename: string;
  content: string;
}

const SEED_NOTES: SeedNote[] = [
  // STRATEGY (5 notes)
  {
    folder: 'strategy',
    filename: '2026-Roastery-North-Star.md',
    content: `# 2026 Roastery North Star

Meridian Coffee & Provisioners is shifting from pure retail foot traffic toward high-retention B2B hospitality accounts while keeping our Flagship Tasting Bar as the brand showcase. Our annual revenue target is $1.45M, split 55% wholesale subscriptions, 30% tasting bar, and 15% direct-to-consumer e-commerce.

Key pillars:
- Expand [[Boutique Hotel Accounts]] from 9 to 18 properties by Q4.
- Keep green bean waste below 2.2% via tighter [[Roast Schedule and Batch Sizing]].
- Launch the [[Q4 Holiday Blend Launch]] with zero paid ad spend, relying on existing wholesale partner gifting and tasting bar pre-orders.

See also: [[Wholesale Margin Targets]] and [[Weekly Founder Review Cadence]].`,
  },
  {
    folder: 'strategy',
    filename: 'Q4-Holiday-Blend-Launch.md',
    content: `# Q4 Holiday Blend Launch

Elena Vance is leading the Q4 Holiday Blend Launch, codenamed "Winter Solstice Reserve." Total production and packaging budget is capped at $14,800, covering 1,200 custom foil-stamped 340g tins and 400 tasting flight boxes.

Blend profile: 60% washed Ethiopian Guji (floral bergamot) and 40% honey-processed Costa Rican Tarrazu (dark cocoa, spiced plum).

Distribution timeline:
- Oct 15: Pre-orders open to [[Boutique Hotel Accounts]] and [[Harborview Cafe Partnership]].
- Nov 1: First retail drop at [[Flagship Tasting Bar Ops]].
- Nov 18: Corporate gifting fulfillment closes.

Target gross margin on the limited tin is 64%, exceeding our baseline in [[Wholesale Margin Targets]].`,
  },
  {
    folder: 'strategy',
    filename: 'Boutique-Hotel-Accounts.md',
    content: `# Boutique Hotel Accounts

Hospitality accounts are our highest-LTV channel. Unlike cafes that churn over $0.50/lb price cuts, boutique hotels buy consistency, barista training, and custom room-pantry sachets.

Current flagship hotel partners:
- The Alder House (42 lbs/week, La Marzocco Linea PB installed)
- Hotel Juniper (28 lbs/week, cold brew kegs + morning lobby pour-over)
- Saltmarsh Inn (19 lbs/week, seasonal decaf + single-origin drip)

Every hotel contract includes quarterly grinder calibration from [[Equipment Maintenance Log]] and staff onboarding led by [[Barista Training Playbook]]. Refer to [[Wholesale Margin Targets]] for tiered volume rebates.`,
  },
  {
    folder: 'strategy',
    filename: 'Direct-Trade-Sourcing-Policy.md',
    content: `# Direct Trade Sourcing Policy

We commit to paying at least 35% above commodity C-market minimums for every micro-lot over 85.5 SCA cupping points. Our primary import broker is Pacific Crest Green Coffee, though we contract directly with Finca La Pradera in Huehuetenango and Cooperative Suke Quto in Guji.

Quality gates:
1. Sample roast 250g on the Ikawa within 48 hours of arrival.
2. Blind cupping by Maya Lin and Marcus Cole; minimum 85.5 score to enter production.
3. Moisture check (10.5% to 11.8%) logged in [[Green Bean Inventory]].

Sourcing ethics feed directly into [[2026 Roastery North Star]] and our pitch deck for [[Boutique Hotel Accounts]].`,
  },
  {
    folder: 'strategy',
    filename: 'Weekly-Founder-Review-Cadence.md',
    content: `# Weekly Founder Review Cadence

Every Monday at 8:30 AM, Maya Lin and Marcus Cole meet for 45 minutes in the cupping room. No slide decks—only three live dashboards:

1. Cash runway & payables from [[Monthly Cash Flow Snapshot]].
2. Equipment health & downtime risks from [[Equipment Maintenance Log]].
3. Pipeline velocity for [[Boutique Hotel Accounts]] and [[Harborview Cafe Partnership]].

Every Friday at 3:00 PM is reserved for blind quality cupping and reviewing customer feedback captured in [[Customer Feedback Digest]].`,
  },

  // OPERATIONS (5 notes)
  {
    folder: 'operations',
    filename: 'Roast-Schedule-and-Batch-Sizing.md',
    content: `# Roast Schedule and Batch Sizing

We roast on a Loring S15 Falcon convection roaster every Monday, Wednesday, and Thursday from 6:00 AM to 1:30 PM. Tuesdays are reserved for sample roasting, cupping, and preventive maintenance.

Standard batch rules:
- Optimal charge weight: 11.5 kg (76% drum capacity) for peak airflow consistency.
- Average moisture shrinkage: 13.8% on filter roasts, 15.6% on espresso blends.
- Cool-down tray target: under 3 minutes 45 seconds to ambient temperature.

All finished bags are nitrogen-flushed within 4 hours and logged against [[Green Bean Inventory]] before dispatch via [[Local Delivery Route Plan]].`,
  },
  {
    folder: 'operations',
    filename: 'Equipment-Maintenance-Log.md',
    content: `# Equipment Maintenance Log

Critical equipment registry and recent service incidents:

- **Loring S15 Falcon (Roastery)**: Last burner descaling completed Oct 4 by Cascade Thermal Tech. Next catalytic check due Dec 12.
- **La Marzocco GB5 (Flagship Tasting Bar)**: Experienced steam boiler pressure drops (fluctuating between 0.9 and 1.4 bar) on Oct 19. Serviced by **Julian Mercer at Espresso Works**—replaced the vacuum breaker valve and descale probe ($420 parts + labor). Running steady at 1.25 bar since.
- **Mahlkönig EK43S Grinders**: Burrs aligned monthly; replacement SSP burrs stocked in cabinet B.

See [[Flagship Tasting Bar Ops]] for daily backflushing checklists and [[Boutique Hotel Accounts]] for partner machine SLAs.`,
  },
  {
    folder: 'operations',
    filename: 'Green-Bean-Inventory.md',
    content: `# Green Bean Inventory

Climate-controlled pallet storage at 18°C and 55% relative humidity. Current stock equals 7.5 weeks of projected roast demand.

Active lots on floor:
- **Colombia Huila Pink Bourbon**: 14 bags (70 kg each) — reserved for tasting bar pour-over & [[Q4 Holiday Blend Launch]] reserve.
- **Ethiopia Guji Natural**: 22 bags — core component of Solstice & retail bags.
- **Guatemala Huehuetenango**: 31 bags — workhorse base for [[Harborview Cafe Partnership]] espresso.
- **Decaf Sugarcane EA (Cauca)**: 9 bags — steady demand from [[Boutique Hotel Accounts]].

Reorder trigger fires automatically when any core origin drops below 18 days of cover in [[Roast Schedule and Batch Sizing]].`,
  },
  {
    folder: 'operations',
    filename: 'Flagship-Tasting-Bar-Ops.md',
    content: `# Flagship Tasting Bar Ops

Open daily 7:00 AM to 4:00 PM at 418 Pier Street. Average ticket size is $9.40, with 62% of morning transactions adding a pastry from Hearth & Grain Bakery.

Dial-in protocol:
- Morning dial-in starts at 6:25 AM on the La Marzocco GB5 (tracked in [[Equipment Maintenance Log]]).
- Espresso recipe: 19.5g in, 39g out in 27–29 seconds at 93°C.
- Batch brew switches to seasonal single origin every Friday.

Staffing relies on two overlapping shifts managed in [[Shift Scheduling and Overtime]]. Training standards come from [[Barista Training Playbook]].`,
  },
  {
    folder: 'operations',
    filename: 'Local-Delivery-Route-Plan.md',
    content: `# Local Delivery Route Plan

Our electric Sprinter van runs two dedicated wholesale loops every Tuesday and Friday morning, saving $1,150/month compared to third-party courier fees.

- **Tuesday North Loop**: [[Harborview Cafe Partnership]], The Alder House, Ballard Bookshop, Northgate Clinic.
- **Friday Waterfront Loop**: Hotel Juniper, Saltmarsh Inn, Pier 14 Ferry Kiosk, and [[Flagship Tasting Bar Ops]] restock.

Empty 5-gallon cold brew kegs and returnable 5-lb wholesale buckets are collected on the same stop to keep packaging costs inside [[Wholesale Margin Targets]].`,
  },

  // FINANCE (5 notes)
  {
    folder: 'finance',
    filename: 'Wholesale-Margin-Targets.md',
    content: `# Wholesale Margin Targets

Every B2B account is priced against a strict landed-cost model ($5.10/lb green + $1.35/lb roast labor, gas, and packaging = $6.45/lb COGS).

Target gross margins by tier:
- **Boutique Hotel Accounts**: 52% minimum gross margin ($13.50/lb to $15.25/lb), justified by included equipment calibration and training.
- **High-Volume Cafes (>80 lbs/week)**: 44% gross margin ($11.50/lb) with net-15 ACH billing.
- **Specialty Grocers (340g retail bags)**: 48% wholesale margin, MSRP $19.50.

Review pricing quarterly against [[Green Bean Inventory]] freight surcharges and [[Monthly Cash Flow Snapshot]].`,
  },
  {
    folder: 'finance',
    filename: 'Monthly-Cash-Flow-Snapshot.md',
    content: `# Monthly Cash Flow Snapshot

As of October close, operating cash sits at $168,400 with zero drawn on our $75,000 revolving credit line.

October summary:
- Gross Revenue: $118,200 ($64,900 wholesale, $36,800 tasting bar, $16,500 e-commerce).
- COGS (green coffee, milk, bakery, packaging): $46,100 (39.0%).
- Payroll & benefits: $38,400 (tracked via [[Shift Scheduling and Overtime]]).
- Rent, utilities, & van lease: $14,200.
- Net operating profit before tax: $19,500 (16.5% net margin).

Biggest upcoming cash outflow: $24,000 deposit for Q1 Ethiopian container in [[Direct Trade Sourcing Policy]] and [[Q4 Holiday Blend Launch]] tins.`,
  },
  {
    folder: 'finance',
    filename: 'Subscription-Churn-Analysis.md',
    content: `# Subscription Churn Analysis

Direct-to-consumer coffee subscriptions bring $16,500/month across 412 active subscribers, with an average order value of $38.50.

Churn findings from Q3 cohort audit:
- Monthly churn dropped from 7.8% to 4.9% after introducing a "Skip Next Shipment" one-click SMS reminder 3 days before billing.
- Subscribers who receive a handwritten roast card on shipment #2 retain 2.1x longer at month 6.
- Top cancellation reason (38%): "Too much coffee piled up," not price or flavor.

Insights shared with [[Customer Feedback Digest]] and [[Elena Vance Role and OKRs]].`,
  },
  {
    folder: 'finance',
    filename: 'Roastery-CapEx-Wishlist.md',
    content: `# Roastery CapEx Wishlist

Prioritized capital investments for 2027 once operating cash clears $220,000 in [[Monthly Cash Flow Snapshot]]:

1. **Automated Weigh-and-Fill Bagging Line ($28,500)**: Cuts packaging labor by 14 hours/week during [[Q4 Holiday Blend Launch]] peaks.
2. **Second Cold Brew Jacketed Tank ($9,200)**: Required if [[Boutique Hotel Accounts]] cold brew keg demand doubles next summer.
3. **Backup Espresso Machine ($11,000)**: Prevents single-point-of-failure downtime like the October incident in [[Equipment Maintenance Log]].`,
  },
  {
    folder: 'finance',
    filename: 'Invoicing-and-Net-Terms-Policy.md',
    content: `# Invoicing and Net Terms Policy

All wholesale accounts onboard on credit card autopay for their first 60 days before graduating to Net-15 ACH terms. We do not offer Net-30 except to multi-property hotel groups.

Late fee policy:
- Day 16: Automated polite reminder from QuickBooks.
- Day 22: Account manager phone call (see [[Wholesale Account Onboarding]]).
- Day 30: Pause scheduled drops on [[Local Delivery Route Plan]] until balance clears.

Currently, overdue receivables stand at only $640 across 24 active accounts.`,
  },

  // CLIENTS (5 notes)
  {
    folder: 'clients',
    filename: 'Harborview-Cafe-Partnership.md',
    content: `# Harborview Cafe Partnership

Our largest independent cafe partner, ordering 95 lbs/week of Pier Espresso Blend plus 15 lbs/week of rotating single-origin filter. Owner Clara Sato signed a 24-month exclusivity agreement in March.

Account notes:
- Margin sits at 44.5% under our high-volume tier in [[Wholesale Margin Targets]].
- Clara requested decaf nitrogen-canisters for afternoon espresso martinis starting November.
- Delivered every Tuesday first stop on [[Local Delivery Route Plan]].

Harborview also serves as our beta tester for the [[Q4 Holiday Blend Launch]] retail bags.`,
  },
  {
    folder: 'clients',
    filename: 'Wholesale-Account-Onboarding.md',
    content: `# Wholesale Account Onboarding

Goal: take a newly signed cafe or hotel from contract signature to first dialed-in espresso shot in 10 business days.

Checklist:
1. Collect billing details per [[Invoicing and Net Terms Policy]].
2. Audit water hardness (target 75–100 ppm TDS) and inspect bar layout via [[Equipment Maintenance Log]].
3. Deliver starter dial-in kit + 2-hour hands-on session using [[Barista Training Playbook]].
4. Schedule 14-day follow-up tasting visit.

This structured onboarding lifted 12-month wholesale retention to 94% across [[Boutique Hotel Accounts]].`,
  },
  {
    folder: 'clients',
    filename: 'Customer-Feedback-Digest.md',
    content: `# Customer Feedback Digest

Compiled monthly from Tasting Bar QR cards, DTC email replies, and wholesale check-ins.

Recent highlights:
- Guests at [[Flagship Tasting Bar Ops]] rave about the seasonal cardamom-maple oat cortado (+18% repeat afternoon visits).
- Several DTC subscribers asked for compostable valve bags; Elena is pricing plant-based pouches for Q2.
- One wholesale cafe noted slightly darker development on Batch #412 of Huila Pink Bourbon—flagged in [[Roast Schedule and Batch Sizing]] and recalibrated.`,
  },
  {
    folder: 'clients',
    filename: 'Corporate-Gifting-Leads.md',
    content: `# Corporate Gifting Leads

Warm B2B holiday gifting inquiries feeding into [[Q4 Holiday Blend Launch]]:

- **Northshore Architecture Studio**: 120 custom gift boxes (2 tins + ceramic tumbler), budget $7,200. Needs delivery by Dec 8.
- **Vanguard Maritime Law**: 85 tasting flight boxes with embossed thank-you notes.
- **Kestrel Design Co.**: 45 boxes + virtual 30-minute guided cupping with Marcus Cole.

Corporate gifting carries a 61% blended margin and introduces executives to our [[Subscription Churn Analysis]] DTC club.`,
  },
  {
    folder: 'clients',
    filename: 'Tasting-Bar-VIP-Regulars.md',
    content: `# Tasting Bar VIP Regulars

Our neighborhood regulars drive 40% of morning word-of-mouth and early retail bag adoption at [[Flagship Tasting Bar Ops]].

Notable preferences:
- Dr. Patel (Pier 12 Dental): Double cortado, whole milk, buys 2 lbs of Ethiopian Guji every other Friday.
- Sam & Priya (Software Founders upstairs): Four pour-overs at 9:15 AM sharp; love the Colombia Huila Pink Bourbon from [[Green Bean Inventory]].
- Maritime Museum staff: 15% neighbor discount on Tuesdays, boosting off-peak afternoon volume.`,
  },

  // TEAM (5 notes)
  {
    folder: 'team',
    filename: 'Maya-Lin-Role-and-OKRs.md',
    content: `# Maya Lin — Head of Roastery & Green Buying

Co-founder overseeing green coffee procurement, roast profiling, QC cupping, and equipment reliability.

Q4 OKRs:
- Hold roast defect rate below 0.8% across all batches in [[Roast Schedule and Batch Sizing]].
- Finalize Q1 2027 container contracts under [[Direct Trade Sourcing Policy]].
- Complete preventative overhaul on all [[Boutique Hotel Accounts]] grinders before December rush.

Chairs Monday reviews with Marcus under [[Weekly Founder Review Cadence]].`,
  },
  {
    folder: 'team',
    filename: 'Marcus-Cole-Role-and-OKRs.md',
    content: `# Marcus Cole — Managing Partner & Wholesale Lead

Co-founder focused on B2B hospitality growth, financial discipline, and tasting room profitability.

Q4 OKRs:
- Close 4 new [[Boutique Hotel Accounts]] before Dec 20.
- Keep operating cash above $150,000 in [[Monthly Cash Flow Snapshot]] while funding green coffee deposits.
- Convert at least 200 boxes from [[Corporate-Gifting-Leads]] into signed deposits.`,
  },
  {
    folder: 'team',
    filename: 'Elena-Vance-Role-and-OKRs.md',
    content: `# Elena Vance — Brand, Marketing & DTC Director

Leads brand storytelling, e-commerce retention, packaging design, and seasonal product launches.

Q4 OKRs:
- Execute [[Q4 Holiday Blend Launch]] on schedule and under the $14,800 budget.
- Keep DTC monthly churn below 4.5% per [[Subscription Churn Analysis]].
- Grow tasting bar loyalty signups by 25% at [[Flagship Tasting Bar Ops]].`,
  },
  {
    folder: 'team',
    filename: 'Barista-Training-Playbook.md',
    content: `# Barista Training Playbook

Every new hire completes 16 hours of structured training before working a solo morning rush at [[Flagship Tasting Bar Ops]].

Curriculum modules:
1. Extraction science: brew ratios, grind distribution, water chemistry.
2. Milk texturing & latte art consistency (microfoam temp capped at 62°C).
3. Hospitality & speed: 90-second ticket goal without sacrificing warmth.
4. Daily machine care synced with [[Equipment Maintenance Log]].

The condensed 2-hour version of this playbook is delivered during [[Wholesale Account Onboarding]].`,
  },
  {
    folder: 'team',
    filename: 'Shift-Scheduling-and-Overtime.md',
    content: `# Shift Scheduling and Overtime

Tasting bar and production shifts are published 14 days in advance every other Wednesday.

Rules:
- Open shift: 6:15 AM – 1:45 PM (2 baristas + 1 shift lead).
- Mid/Close shift: 9:30 AM – 4:45 PM (includes deep clean and pastry prep).
- Roastery helper works Mon/Wed/Thu 7:00 AM – 2:30 PM bagging and assisting [[Local Delivery Route Plan]].
- Overtime requires prior sign-off from Marcus to keep payroll within the $38,400 target in [[Monthly Cash Flow Snapshot]].`,
  },
];

export function ensureSeedNotes(notesDir: string): void {
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }

  // Count existing .md files recursively
  const countMd = (dir: string): number => {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) count += countMd(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) count++;
    }
    return count;
  };

  if (countMd(notesDir) > 0) {
    return;
  }

  for (const note of SEED_NOTES) {
    const folderPath = path.join(notesDir, note.folder);
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, note.filename), note.content, 'utf8');
  }
}
