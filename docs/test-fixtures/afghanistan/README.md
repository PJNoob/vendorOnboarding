# Afghanistan (AF) supplier test fixtures

Synthetic documents and matching form inputs for a fictional Afghan supplier, **Hindukush Precision Calibration Company Limited**. Everything is fictional (company, bank, authorities, people) and every PDF page carries a "synthetic test fixture" footer.

Regenerate with `python3 scripts/test-fixtures/generate_afghanistan_fixtures.py` (needs `reportlab`). The values live in one place in that script, so the PDFs and the form inputs cannot drift apart. `supplier-inputs.json` holds the same values in the shape the app stores them.

## Important: Afghanistan is not a banned country by default

The default banned list is CU, IR, KP, SY. Afghanistan (`AF`) passes the country check unless the tenant policy sets `bannedCountries` to include `AF`.

- To test a **pass**: leave the policy as is.
- To test the **country failure** (`COUNTRY_BANNED`): add `AF` to the tenant policy's `bannedCountries`, then submit this same data. The case should fail the country check.

## 1. Invitation (buyer side, "Invite supplier")

| Field | Value |
| --- | --- |
| Category | `CALIBRATION` |
| Country | Afghanistan (`AF`) |
| Requested site | `Calibration Laboratory, Pul-e-Charkhi Industrial Park, Kabul` |
| Supplier email | `procurement@hindukush-calibration.example` (use an inbox you control for real email OTP) |

## 2. Supplier form inputs

### Company
| Field | Value |
| --- | --- |
| Legal name | `Hindukush Precision Calibration Company Limited` |
| Registry ID | `AF-REG-2019-0048713` |
| Jurisdiction | `Afghanistan` |
| Country | `AF` |
| Address line 1 | `House 27, Street 4, Shahr-e-Naw` |
| City | `Kabul` |
| Contact name | `Mariam Sediqi` |
| Contact email | `procurement@hindukush-calibration.example` |

### Bank
| Field | Value |
| --- | --- |
| Beneficiary | `Hindukush Precision Calibration Company Limited` |
| Account | `0100234567891` |
| Country | `AF` |
| Currency | `AFN` |
| Routing | `HKCBAFKX` |

### Tax
| Field | Value |
| --- | --- |
| Form type | `OTHER_REVIEW` (non-US supplier) |
| Tax ID | `4012345678` |
| VAT registered | No |
| VAT TRN | leave blank |

Afghanistan has no country-specific tax ID rule in `packages/schemas/TaxIds.ts`, so only the generic 4 to 40 character check applies. With `OTHER_REVIEW` and VAT registered off, the tax check passes. The AI document comparison still looks for the tax ID in the tax document.

### Qualifications (one row)
| Field | Value |
| --- | --- |
| Activity | `CALIBRATION` |
| Site | `Calibration Laboratory, Pul-e-Charkhi Industrial Park, Kabul` |
| Standard | `ISO/IEC 17025:2017` |

### Ownership
Entities:

| Key | Legal name | Country | Is vendor | Registry ID |
| --- | --- | --- | --- | --- |
| `vendor` | Hindukush Precision Calibration Company Limited | AF | Yes | `AF-REG-2019-0048713` |
| `parent` | Khorasan Metrology Holdings Limited | AF | No | `AF-REG-2015-0012044` |
| `owner-ahmad` | Ahmad Zia Rahimi | AF | No | none |
| `owner-sima` | Sima Rahimi | AF | No | none |
| `owner-daniel` | Daniel Whitmore | GB | No | none |

Ownership edges (each owned entity totals 100%):

| Owner | Owned | Percentage |
| --- | --- | --- |
| `parent` | `vendor` | 70 |
| `owner-ahmad` | `vendor` | 30 |
| `owner-sima` | `parent` | 55 |
| `owner-daniel` | `parent` | 45 |

The vendor's legal name and registry ID must match the company section exactly, and the ownership document must contain the vendor's registry ID. Otherwise the check returns "Provide the complete ownership declaration", which was the third failure in your screenshot.

## 3. Documents to upload

| Upload slot | File | What it contains |
| --- | --- | --- |
| `REGISTRATION` | `1_REGISTRATION_company_registration_certificate.pdf` | Legal name, registry ID, legal form, jurisdiction, incorporation date, registered address, city, activity, share capital, directors, authorized contact name and email, trade licence |
| `BANK` | `2_BANK_account_confirmation_letter.pdf` | Bank, branch, account holder (beneficiary), account number, currency, SWIFT, routing, account type, holder address |
| `TAX` | `3_TAX_taxpayer_registration_certificate.pdf` | Taxpayer legal name, TIN, tax country, category, address, tax office, VAT status (not VAT registered), tax form on file |
| `CERTIFICATE` | `4_CERTIFICATE_calibration_accreditation_with_scope.pdf` | Page 1: certificate with organisation, standard, activity, site, issue and expiry (`2029-06-30`). Page 2: scope annex with site, activity, standard and measurement capability table |
| `OWNERSHIP` | `5_OWNERSHIP_ownership_declaration.pdf` | Entity list, owner/owned percentage table, totals, 25%+ beneficial owner look-through, sanctions and banned-country statements |

All files are text PDFs well under the 10 MiB and 50 page limits.

## 4. Consistency rules these documents satisfy

- The legal name is identical in every document (conflicting names trigger a review).
- The registry ID appears in the registration document and the ownership declaration.
- The bank letter shows the account holder equal to the company legal name and the exact account number.
- The tax ID appears in the tax document.
- The certificate covers the exact requested site, the activity and the standard, and its expiry is an ISO date in the future (a non-ISO or past date forces a review).
- No owner is in CU, IR, KP or SY, and each ownership level totals 100%.

## 5. Negative test ideas

Change one value to trigger one specific issue:

- Edit the registry ID in the form: `Registration matches the company details` fails.
- Change `requestedSite` to a place not in the certificate: `Certificate covers the requested site and activity` fails.
- Drop one edge or set a total other than 100: ownership chain fails.
- Add `AF` to `bannedCountries`: country check fails (`COUNTRY_BANNED`).
- Use `FIXTURE-BLOCKED-001` as an owner registry ID with `DEMO_SCREENING=true`: ownership hold.
