# Demo documents for the four video cases

PDF evidence and the exact form values for each case in `output/Demo_Video_Script.md`. All companies, banks, people and the accreditation body are fictional, and every page carries a "demo document" footer. Rebuild the PDFs with `python3 scripts/demo/build_demo_documents.py`.

**Before you start:** the deployment must run with demo screening on (`DEMO_SCREENING=true`), or case D's sanctioned owner is not flagged. Every case uses **Country: United States** and **Service: Calibration**.

**Type the values exactly as shown.** The checks compare the form with the documents. Copy and paste the legal names and numbers.

---

## Case A: happy path, Cedar Meridian QA Calibration LLC

Outcome: all 8 checks pass, no issues, and the email says "Your submission is awaiting review". Approve it on camera.

**Invitation:** requested service site `Newark Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name | `Cedar Meridian QA Calibration LLC` |
| | Registration ID | `7712408` |
| | Jurisdiction | `Delaware` |
| | Country | United States |
| | Address / City | `1180 Raymond Boulevard, Suite 400` / `Newark` |
| | Contact | `Priya Raman`, an inbox you control |
| Banking | Beneficiary | `Cedar Meridian QA Calibration LLC` |
| | Account | `4401 2287 9035` |
| | Routing | `021987654` |
| | Country / Currency | United States / `USD` |
| Tax | Form | W-9 |
| | Tax ID | `12-3456789` |
| | VAT registered | No |
| Qualifications | Activity / Site / Standard | `CALIBRATION` / `Newark Calibration Lab` / `ISO/IEC 17025` |
| Ownership | Your company | `Cedar Meridian QA Calibration LLC`, US, registration ID `7712408` |
| | Owner 1 | `Cedar Meridian Holdings Inc.`, US, registration ID `5530917`, owns **100%** of your company |

| Upload as | File |
|---|---|
| Registration | `A1_REGISTRATION_certificate_of_formation.pdf` |
| Bank | `A2_BANK_account_confirmation_letter.pdf` |
| Tax | `A3_TAX_form_W9.pdf` |
| Certificate | `A4_CERTIFICATE_iso17025_with_scope.pdf` |
| Ownership | `A5_OWNERSHIP_declaration.pdf` |

---

## Case B: tax ID in the wrong format, Lakeshore Precision Instruments LLC

Outcome: saving the Tax step is refused with "The tax ID is not valid for US. Expected a US Employer Identification Number (EIN), for example 12-3456789." Then enter the correct EIN and it saves.

**Invitation:** requested service site `Chicago Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name / Registration ID / Jurisdiction | `Lakeshore Precision Instruments LLC` / `6650231` / `Delaware` |
| | Address / City | `455 North Cityfront Plaza, Floor 9` / `Chicago` |
| Tax (on camera) | Form W-9, Tax ID | `100123456700003` (a UAE TRN). This is refused. |
| Tax (correct value) | Tax ID | `98-7654321` (matches `B2_TAX_form_W9.pdf`). This saves. |

Files: `B1_REGISTRATION_certificate_of_formation.pdf` and `B2_TAX_form_W9.pdf`. Upload them so the draft looks real; the refusal happens before any document is checked.

---

## Case C: wrong document and certificate scope, Northwind Metrology Inc.

Outcome: **Pending** with three supplier items:
- The declared account needs verification against bank evidence.
- The declared site needs verification against certificate evidence.
- The file uploaded as bank evidence does not look like bank evidence, so upload a bank letter.

Registration, tax, country and ownership all pass.

**Invitation:** requested service site `Edison Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name / Registration ID / Jurisdiction | `Northwind Metrology Inc.` / `5981346` / `Delaware` |
| | Address / City | `33 Wood Avenue South` / `Iselin` |
| Banking | Beneficiary / Account / Routing | `Northwind Metrology Inc.` / `6120 3348 7701` / `021765432`, US, `USD` |
| Tax | W-9, Tax ID, VAT No | `45-6789012` |
| Qualifications | Activity / Site / Standard | `CALIBRATION` / `Edison Calibration Lab` / `ISO/IEC 17025` |
| Ownership | Your company | `Northwind Metrology Inc.`, US, registration ID `5981346` |
| | Owner 1 | `Elena Brooks`, US, no registration ID, owns **100%** |

| Upload as | File | Why |
|---|---|---|
| Registration | `C1_REGISTRATION_certificate_of_formation.pdf` | Correct |
| **Bank** | `C2_upload_as_BANK_iso_certificate_WRONG_DOCUMENT.pdf` | An ISO certificate in the bank slot, so the wrong-document check fires |
| Tax | `C3_TAX_form_W9.pdf` | Correct |
| Certificate | `C4_CERTIFICATE_iso17025_scope_omits_Edison.pdf` | Scope covers the Trenton lab only, not Edison |
| Ownership | `C5_OWNERSHIP_declaration.pdf` | Correct |

---

## Case D: sanctioned owner two levels up, Blue Harbor Labs LLC

Outcome: every document check passes, ownership screening returns `OWNERSHIP_BLOCKED_CHAIN`, and the case is held for compliance. Compliance confirms the hold, then a reviewer rejects with the reason.

**Invitation:** requested service site `Camden Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name / Registration ID / Jurisdiction | `Blue Harbor Labs LLC` / `7809154` / `Delaware` |
| | Address / City | `200 Federal Street, Suite 1100` / `Camden` |
| Banking | Beneficiary / Account / Routing | `Blue Harbor Labs LLC` / `7720 5531 0846` / `031456789`, US, `USD` |
| Tax | W-9, Tax ID, VAT No | `31-4159265` |
| Qualifications | Activity / Site / Standard | `CALIBRATION` / `Camden Calibration Lab` / `ISO/IEC 17025` |

**Ownership.** Enter all five entities, then the four holdings. Each owned entity must total exactly 100%.

| Entity | Country | Registration ID |
|---|---|---|
| Your company: `Blue Harbor Labs LLC` | US | `7809154` |
| `Harbor Crest Holdings Ltd` | United Kingdom | `11823407` |
| `Marina Ventures LLC` | US | `6034418` |
| `Volkov Maritime Trading Group` | Cyprus | **`FIXTURE-BLOCKED-001`** |
| `Coastal Equity Partners LP` | US | `4471902` |

| Owner | Owns | Percentage |
|---|---|---|
| Harbor Crest Holdings Ltd | Blue Harbor Labs LLC | 80 |
| Marina Ventures LLC | Blue Harbor Labs LLC | 20 |
| Volkov Maritime Trading Group | Harbor Crest Holdings Ltd | 60 |
| Coastal Equity Partners LP | Harbor Crest Holdings Ltd | 40 |

Files: `D1_REGISTRATION…`, `D2_BANK…`, `D3_TAX…`, `D4_CERTIFICATE…` and `D5_OWNERSHIP_declaration_with_blocked_parent.pdf`, uploaded as their kinds.

Rejection reason to paste: `Ultimate parent is a sanctioned entity via a 60%/80% ownership chain.`

---

## How these were checked

Each case's PDF text was run through the real verification worker, the real document-verification service (LangGraph) and every policy check, using the form values above. Gemini OCR and extraction were replaced by a local stand-in, and screening ran in demo mode. Results:

| Check | A | C | D |
|---|---|---|---|
| Bank beneficiary | Pass | Review: no bank evidence | Pass |
| Certificate scope | Pass | Review: site not covered | Pass |
| Registration (name, ID, country) | Pass | Pass | Pass |
| Tax | Pass | Pass | Pass |
| Document type | Pass | **Fail: wrong document in bank slot** | Pass |
| Country | Pass | Pass | Pass |
| Web ban screening | Pass (demo) | Pass (demo) | Pass (demo) |
| Ownership screening | Clear | Clear | **Blocked chain, compliance hold** |

Do one dry run on the live deployment before recording, because the real Gemini OCR reads the PDFs as images.
