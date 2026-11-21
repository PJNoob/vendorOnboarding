# Demo documents, set 2

A second set for the same four video cases, with different companies, sites, identifiers and addresses. Everything is fictional, and every page carries a "demo document" footer. Rebuild with `python3 scripts/demo/build_demo_documents.py`, which also rebuilds set 1.

**Before you start:** demo screening must be on (`DEMO_SCREENING=true`) for case D. Every case uses **Country: United States** and **Service: Calibration**. Copy and paste the values below exactly, because the checks compare the form with the documents.

---

## Case A: happy path, Silverline Gauge Calibration LLC

Outcome: all 8 checks pass, no issues, and the email says "Your submission is awaiting review". Approve it.

**Invitation:** requested service site `Austin Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name | `Silverline Gauge Calibration LLC` |
| | Registration ID | `6248817` |
| | Jurisdiction | `Delaware` |
| | Country | United States |
| | Street address / City | `8601 Ranch Road 2222, Building 3` / `Austin` |
| | Contact name | `Arjun Mehta` |
| | Contact email | An inbox you control |
| Bank | Beneficiary | `Silverline Gauge Calibration LLC` |
| | Country / Currency | United States / `USD` |
| | Account number | `3318 6604 2751` |
| | Routing number | `114987652` |
| Tax | Form / Tax ID / VAT registered | W-9 / `74-2918365` / No |
| Qualifications | Activity / Site / Standard | `CALIBRATION` / `Austin Calibration Lab` / `ISO/IEC 17025` |
| Ownership | Your company | `Silverline Gauge Calibration LLC`, United States, `6248817` |
| | Owner | `Silverline Instruments Group Inc.`, United States, `4902266`, owns **100%** |

| Upload as | File |
|---|---|
| Registration | `A1_REGISTRATION_certificate_of_formation.pdf` |
| Bank | `A2_BANK_account_confirmation_letter.pdf` |
| Tax | `A3_TAX_form_W9.pdf` |
| Certificate | `A4_CERTIFICATE_iso17025_with_scope.pdf` |
| Ownership | `A5_OWNERSHIP_declaration.pdf` |

---

## Case B: tax ID in the wrong format, Pinecrest Measurement Systems LLC

Outcome: the Tax step is refused with "The tax ID is not valid for US. Expected a US Employer Identification Number (EIN), for example 12-3456789." The correct EIN then saves. Don't submit this case.

**Invitation:** requested service site `Seattle Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name / Registration ID / Jurisdiction | `Pinecrest Measurement Systems LLC` / `7034519` / `Delaware` |
| | Street address / City | `1201 Third Avenue, Suite 2600` / `Seattle` |
| | Contact name | `Hannah Lowe` |
| Tax, on camera | Form / Tax ID | W-9 / `100987654300003` (a UAE TRN). This is refused. |
| Tax, correct | Tax ID | `91-6037428` (matches `B2_TAX_form_W9.pdf`). This saves. |
| Bank (optional) | Beneficiary / Account / Routing | `Pinecrest Measurement Systems LLC` / `2207 4419 8836` / `125000987`, United States, `USD` |
| Qualifications (optional) | Activity / Site / Standard | `CALIBRATION` / `Seattle Calibration Lab` / `ISO/IEC 17025` |
| Ownership (optional) | Your company / Owner | `Pinecrest Measurement Systems LLC`, US, `7034519` / `Hannah Lowe`, US, no ID, owns **100%** |

Files (optional): `B1_REGISTRATION_certificate_of_formation.pdf` and `B2_TAX_form_W9.pdf`.

---

## Case C: wrong document and certificate scope, Ridgeway Instruments Inc.

Outcome: **Pending**, with three supplier items: the bank file isn't a bank document, the account can't be verified against bank evidence, and the requested site isn't on the certificate. Registration, tax, country and ownership pass.

**Invitation:** requested service site `Irvine Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name / Registration ID / Jurisdiction | `Ridgeway Instruments Inc.` / `6115802` / `Delaware` |
| | Street address / City | `2600 Michelson Drive, Suite 900` / `Irvine` |
| | Contact name | `Daniel Kwan` |
| Bank | Beneficiary / Account / Routing | `Ridgeway Instruments Inc.` / `8840 1157 6623` / `122456781`, United States, `USD` |
| Tax | Form / Tax ID / VAT registered | W-9 / `33-8172046` / No |
| Qualifications | Activity / Site / Standard | `CALIBRATION` / `Irvine Calibration Lab` / `ISO/IEC 17025` |
| Ownership | Your company | `Ridgeway Instruments Inc.`, United States, `6115802` |
| | Owner | `Daniel Kwan`, United States, no registration ID, owns **100%** |

| Upload as | File | Note |
|---|---|---|
| Registration | `C1_REGISTRATION_certificate_of_formation.pdf` | Correct |
| **Bank** | `C2_upload_as_BANK_iso_certificate_WRONG_DOCUMENT.pdf` | Wrong on purpose: an ISO certificate in the bank slot |
| Tax | `C3_TAX_form_W9.pdf` | Correct |
| Certificate | `C4_CERTIFICATE_iso17025_scope_omits_Irvine.pdf` | Wrong on purpose: scope covers the San Diego lab only |
| Ownership | `C5_OWNERSHIP_declaration.pdf` | Correct |

---

## Case D: sanctioned owner two levels up, Northgate Analytical Labs LLC

Outcome: every document check passes, ownership screening returns `OWNERSHIP_BLOCKED_CHAIN`, and the case is held for compliance. Compliance confirms the hold, then the reviewer rejects.

**Invitation:** requested service site `San Francisco Calibration Lab`, country United States.

| Step | Field | Value |
|---|---|---|
| Company | Legal name / Registration ID / Jurisdiction | `Northgate Analytical Labs LLC` / `7356021` / `Delaware` |
| | Street address / City | `100 Pine Street, Suite 1250` / `San Francisco` |
| | Contact name | `Laura Bennett` |
| Bank | Beneficiary / Account / Routing | `Northgate Analytical Labs LLC` / `6025 9913 4480` / `121654329`, United States, `USD` |
| Tax | Form / Tax ID / VAT registered | W-9 / `94-3725106` / No |
| Qualifications | Activity / Site / Standard | `CALIBRATION` / `San Francisco Calibration Lab` / `ISO/IEC 17025` |

**Ownership entities:**

| Entity | Country | Registration ID |
|---|---|---|
| Your company: `Northgate Analytical Labs LLC` | United States | `7356021` |
| `Altamira Holdings Ltd` | United Kingdom | `09874521` |
| `Redwood Growth LLC` | United States | `5188340` |
| `Kestrel Offshore Trading Ltd` | Cyprus | **`FIXTURE-BLOCKED-001`** |
| `Pacific Equity Partners LP` | United States | `4029318` |

**Holdings** (each owned company totals 100%):

| Owner | Owns | % |
|---|---|---|
| Altamira Holdings Ltd | Northgate Analytical Labs LLC | `80` |
| Redwood Growth LLC | Northgate Analytical Labs LLC | `20` |
| Kestrel Offshore Trading Ltd | Altamira Holdings Ltd | `60` |
| Pacific Equity Partners LP | Altamira Holdings Ltd | `40` |

Files: `D1_REGISTRATION…`, `D2_BANK…`, `D3_TAX…`, `D4_CERTIFICATE…` and `D5_OWNERSHIP_declaration_with_blocked_parent.pdf`, each uploaded as its kind.

Rejection reason: `Ultimate parent is a sanctioned entity via a 60%/80% ownership chain.`

**Kestrel's registration ID must be exactly `FIXTURE-BLOCKED-001`.** In demo mode only that ID counts as sanctioned, and names are not checked, so a blank ID means nothing is flagged. See the set 1 README for the full explanation.

---

## How these were checked

Each case's PDF text was run through the real verification worker, the real document-verification service and every policy check, using the values above. Gemini was replaced by a local stand-in, and screening ran in demo mode. Results match set 1:

| Check | A | C | D |
|---|---|---|---|
| Bank beneficiary | Pass | Review: no bank evidence | Pass |
| Certificate scope | Pass | Review: site not covered | Pass |
| Registration, tax, country, web screening | Pass | Pass | Pass |
| Document type | Pass | **Fail: wrong document in bank slot** | Pass |
| Ownership screening | Clear | Clear | **Blocked chain, compliance hold** |

Case B: the UAE TRN `100987654300003` is refused for a US supplier and `91-6037428` is accepted.
