# Demo video script: Harbor vendor onboarding (PS-2)

**Length:** 5:00 max. **Format:** one take, screen + voice, no slides.
**Shows:** the happy path running live, then three edge cases, ending with the dashboard.

---

## Before you hit record (do this 30 minutes ahead)

Some steps take real time: an invitation waits up to ~35 s for the mailbox check, and OCR plus checks take about a minute per submission. Don't wait on camera. Pre-stage the cases below so each one is already at the right point. The PDFs and the exact values to type for every case are in `output/demo_documents/` (see its README). Show **one** step running live (the happy-path submission) and narrate the rest from where it already stands.

| Case | Supplier (use real-sounding names) | Pre-stage to | What you'll show |
|---|---|---|---|
| A, happy path | *Cedar Meridian QA Calibration LLC*, site *Newark Calibration Lab* (US, W-9, EIN `12-3456789`, bank beneficiary = legal name, ISO 17025 certificate covering the requested site). Files `A1`–`A5` | Supplier application **filled in, documents Clean, not yet submitted** | Submit live → live run → approve |
| B, tax format | *Lakeshore Precision Instruments LLC*, site *Chicago Calibration Lab*. Files `B1`–`B2` | Draft open on the Tax step | Enter a UAE TRN `100123456700003` as the US tax ID → refused at save |
| C, wrong doc + scope | *Northwind Metrology Inc.*, site *Edison Calibration Lab*: ISO certificate (`C2`) uploaded as **Bank** evidence, certificate (`C4`) scope covers Trenton only, **omitting the requested site** | Submitted, checks finished → **Pending** | "Why this status", supplier correction email |
| D, hidden sanctioned owner | *Blue Harbor Labs LLC*, site *Camden Calibration Lab*: owned 80% by *Harbor Crest Holdings Ltd*, which is 60% owned by registry ID `FIXTURE-BLOCKED-001` (demo screening on). Files `D1`–`D5` | Submitted → **Pending, compliance hold** | Hold propagates up the chain → reject with reason |

Also have ready:
- Two browser windows: **Buyer** (Google sign-in, Admin) and **Supplier** (email code sign-in, Case A's address). Log both in beforehand.
- The supplier's Gmail open in a third tab.
- Close other tabs and notifications, and zoom the browser to ~110%.

---

## Script

### 0:00–0:25 — The problem and what this does
*[Buyer window, Overview page]*

> "Before a company can pay a vendor, someone has to verify that vendor is legitimate. Today that's a person reading PDFs, comparing names and tax IDs by eye, and chasing suppliers by email. This is Harbor. It takes a vendor submission and returns one of three answers, approved, pending or rejected, with the reasoning visible. For anything not approved, it tells the supplier exactly what to fix. It runs live on Google Cloud: GKE, Cloud SQL and Gemini on Vertex AI, deployed through Cloud Build."

*[Point at the journey strip: Invite → Collect → Verify → Approve]*

### 0:25–0:45 — Invite
*[Click **Invite supplier**, show the form, don't submit]*

> "A buyer invites a supplier by email. Before anything is sent, the system verifies the mailbox exists. A typo'd address is blocked rather than bouncing silently. The supplier gets a link and signs in with a one-time code. No passwords."

### 0:45–1:30 — Happy path: supplier submits (live)
*[Supplier window, Case A, step tabs visible]*

> "Here's the supplier's view. Company, banking, tax, qualifications, ownership and documents. Each step saves on its own. Every PDF lands in a quarantine bucket and is virus-scanned before anyone can open it. These all show Clean."

*[Tick the attestation → **Submit for review**]*

*[Switch to Buyer window → open Case A → scroll to **Live run**]*

> "Now watch the live run. Documents are clean. Extraction is Gemini reading every page as an image, then pulling out typed fields with the exact quote and page each value came from. If two documents disagree, an AI agent checks whether it's the same value written differently or a real conflict. Checks compares what the supplier declared against what the documents actually say. Screening walks the ownership chain against sanctions data."

*[Wait for the stages to turn green. If it's slow, keep talking about the next line.]*

> "Each stage turns green as it finishes. The page refreshes every few seconds. Nothing here is simulated."

### 1:30–2:00 — Happy path: decision
*[Point at the **Why this status** panel: all checks passed]*

> "Every check passed: bank beneficiary matches the company, the registration matches, the tax ID is a valid US EIN and appears on the W-9, the certificate covers the requested site, and ownership is clear. The status is Pending, ready for a decision. The AI recommends; a human decides."

*[Record decision → APPROVE → reason "All checks passed against source documents." → submit]*

> "Approved. The supplier gets an email, and it's recorded in the audit trail."

*[Flash the Gmail tab: "Your onboarding was approved."]*

### 2:00–2:30 — Edge case 1: tax ID in the wrong format for the country
*[Supplier window, Case B, Tax step]*

> "First edge case: a tax ID that's the wrong format for the country. This supplier says they're in the US, but they've entered a UAE tax registration number."

*[Enter `100123456700003` as Tax ID → Save]*

> "Refused at save, before it ever reaches a reviewer. It says what's expected, a US EIN, and gives an example. This works for thirteen countries, including the published checksums for Indian GSTINs, UK VAT numbers and Australian ABNs."

### 2:30–3:25 — Edge case 2: wrong document + certificate doesn't cover the site
*[Buyer window, open Case C, Northwind Metrology]*

> "Second edge case: a submission that looks fine on the surface. Here the supplier uploaded their ISO certificate in the bank evidence slot, and the certificate's scope doesn't include the site we're onboarding them for."

*[Point at Live run: Checks shows attention. Point at **Why this status**.]*

> "Pending, and here's why, rule by rule. The file uploaded as bank evidence doesn't read like a bank document. And the certificate scope doesn't cover the requested site. Everything else passed, so the reviewer knows exactly where to look."

*[Switch to the Gmail tab and open the correction email]*

> "And this is what the supplier received automatically: what we need from you, item by item. The bank file isn't a bank document, so upload a bank letter showing the account holder and account number. The account number therefore can't be verified. And the requested site isn't on the certificate. No one had to write that email. When the supplier uploads the right files and resubmits, the checks run again on the new revision."

### 3:25–4:20 — Edge case 3: sanctioned owner hidden two levels up
*[Buyer window, open Case D, Blue Harbor Labs]*

> "Third edge case, and the one that matters most for fraud and compliance. Blue Harbor Labs itself is clean, and every document check passed. But it's 80% owned by Harbor Crest Holdings, and Harbor Crest is 60% owned by a sanctioned entity."

*[Point at Live run: **Screening → Hold**. Open the ownership screening hold issue.]*

> "Screening the vendor's name alone would miss this. Harbor treats ownership as a graph. Once a blocked party controls 50% or more of an entity, that entity is treated as blocked too, and so on up the chain. Here it reaches the vendor, so the case is held for compliance. The AI can't override it, and approval is blocked until compliance records a disposition."

*[Compliance confirms the hold, then Record decision → REJECT → reason "Ultimate parent is a sanctioned entity via a 60%/80% ownership chain."]*

> "Rejected. The rejection email includes this reason, so the supplier isn't left guessing."

### 4:20–4:50 — Dashboard
*[Suppliers page; click through the filters **Pending / Approved / Rejected**]*

> "Back on the pipeline, every supplier is in one of three states. Pending ones say why they're waiting: with the supplier, checks running, or open issues. The metrics show their sample size, so a small number isn't misread. And every case has a full audit history you can export as CSV, so the audit trail isn't someone's inbox."

*[Open Case A → **Load audit history** → point at the **Download audit log (CSV)** link]*

### 4:50–5:00 — Close

> "That's a real submission in, a clear decision out, with the reasons visible and the supplier told exactly what's needed. Thanks for watching."

---

## Tips

- **If a stage hangs on camera:** keep narrating and open a pre-staged case that's already finished. Don't wait in silence.
- Have each reviewer reason typed in a notes file so you can paste it.
- Do one full dry run. If you go over 5:00, cut edge case 1 to 15 seconds; it's the least visual.
- The decision must be made by someone other than the person who created the case, unless that person is an Admin. Use your Admin account.
