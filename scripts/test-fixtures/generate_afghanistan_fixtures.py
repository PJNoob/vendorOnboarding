#!/usr/bin/env python3
"""Generate synthetic Afghanistan (AF) supplier test documents and the matching form inputs.

Every value the supplier types in the application is defined once in INPUTS below. The five PDFs
(REGISTRATION, BANK, TAX, CERTIFICATE, OWNERSHIP) are rendered from those same values, so the
declared details and the document evidence agree exactly, which is what the checks compare.

All names, numbers and authorities are fictional. Each page carries a "synthetic test fixture" footer.

Usage:  python3 scripts/test-fixtures/generate_afghanistan_fixtures.py [output_dir]
Needs:  pip install reportlab
"""
import json
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'docs' / 'test-fixtures' / 'afghanistan'

LEGAL_NAME = 'Hindukush Precision Calibration Company Limited'
ADDRESS = 'House 27, Street 4, Shahr-e-Naw'
CITY = 'Kabul'
SITE = 'Calibration Laboratory, Pul-e-Charkhi Industrial Park, Kabul'
REGISTRY_ID = 'AF-REG-2019-0048713'
TAX_ID = '4012345678'
ACCOUNT = '0100234567891'
STANDARD = 'ISO/IEC 17025:2017'

# Everything the supplier enters, in the shape the application stores it (packages/schemas/index.ts).
INPUTS = {
    'invitation': {
        'category': 'CALIBRATION',
        'country': 'AF',
        'requestedSite': SITE,
        'supplierEmail': 'procurement@hindukush-calibration.example',
    },
    'company': {
        'legalName': LEGAL_NAME,
        'registryId': REGISTRY_ID,
        'jurisdiction': 'Afghanistan',
        'country': 'AF',
        'addressLine1': ADDRESS,
        'city': CITY,
        'contactName': 'Mariam Sediqi',
        'contactEmail': 'procurement@hindukush-calibration.example',
    },
    'bank': {
        'beneficiary': LEGAL_NAME,
        'account': ACCOUNT,
        'country': 'AF',
        'currency': 'AFN',
        'routing': 'HKCBAFKX',
    },
    'tax': {
        'formType': 'OTHER_REVIEW',
        'taxId': TAX_ID,
        'vatRegistered': False,
    },
    'qualifications': [
        {'activity': 'CALIBRATION', 'site': SITE, 'standard': STANDARD},
    ],
    'ownership': {
        'entities': [
            {'key': 'vendor', 'legalName': LEGAL_NAME, 'country': 'AF', 'isVendor': True, 'registryId': REGISTRY_ID},
            {'key': 'parent', 'legalName': 'Khorasan Metrology Holdings Limited', 'country': 'AF', 'isVendor': False, 'registryId': 'AF-REG-2015-0012044'},
            {'key': 'owner-ahmad', 'legalName': 'Ahmad Zia Rahimi', 'country': 'AF', 'isVendor': False},
            {'key': 'owner-sima', 'legalName': 'Sima Rahimi', 'country': 'AF', 'isVendor': False},
            {'key': 'owner-daniel', 'legalName': 'Daniel Whitmore', 'country': 'GB', 'isVendor': False},
        ],
        'edges': [
            {'ownerKey': 'parent', 'ownedKey': 'vendor', 'percentage': '70'},
            {'ownerKey': 'owner-ahmad', 'ownedKey': 'vendor', 'percentage': '30'},
            {'ownerKey': 'owner-sima', 'ownedKey': 'parent', 'percentage': '55'},
            {'ownerKey': 'owner-daniel', 'ownedKey': 'parent', 'percentage': '45'},
        ],
    },
}

styles = getSampleStyleSheet()
TITLE = ParagraphStyle('t', parent=styles['Title'], fontSize=18, spaceAfter=4)
SUB = ParagraphStyle('s', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#444444'), alignment=1, spaceAfter=10)
H = ParagraphStyle('h', parent=styles['Heading2'], fontSize=12, spaceBefore=10, spaceAfter=4)
P = ParagraphStyle('p', parent=styles['Normal'], fontSize=10, leading=14)
CELL = ParagraphStyle('c', parent=P, fontSize=9.5, leading=12)


def footer(title):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor('#777777'))
        canvas.drawString(18 * mm, 10 * mm, f'SYNTHETIC TEST FIXTURE - fictional data, not an official document. {title}')
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Page {doc.page}')
        canvas.restoreState()
    return draw


def table(rows, widths=(60 * mm, 110 * mm)):
    """A two-column label / value table."""
    t = Table([[Paragraph(f'<b>{label}</b>', CELL), Paragraph(value, CELL)] for label, value in rows], colWidths=widths)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#999999')),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#EEF2F0')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def grid(rows):
    """A multi-column table with a header row."""
    t = Table([[Paragraph(f'<b>{c}</b>' if i == 0 else str(c), CELL) for c in row] for i, row in enumerate(rows)], repeatRows=1)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#999999')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EEF2F0')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def build(name, title, story):
    OUT.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(str(OUT / name), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                      title=title, author='Synthetic test fixture').build(story, onFirstPage=footer(title), onLaterPages=footer(title))


def registration():
    c = INPUTS['company']
    build('1_REGISTRATION_company_registration_certificate.pdf', 'Company Registration Certificate', [
        Paragraph('CERTIFICATE OF INCORPORATION AND COMPANY REGISTRATION', TITLE),
        Paragraph('Kabul Commercial Registry - Office of Company Registration (fictional authority)', SUB),
        Paragraph('This is to certify that the company named below has been duly incorporated and is registered in the commercial '
                  'register of the Islamic Republic of Afghanistan as a limited company under the company registration law.', P),
        Paragraph('Registered company details', H),
        table([
            ('Registered legal name', c['legalName']),
            ('Company registration number (registry ID)', c['registryId']),
            ('Legal form', 'Private limited company'),
            ('Jurisdiction of registration', c['jurisdiction']),
            ('Country of registration', 'Afghanistan (AF)'),
            ('Date of incorporation', '2019-03-12'),
            ('Registration status', 'Active and in good standing'),
            ('Registered office address', f"{c['addressLine1']}, {c['city']}"),
            ('City', c['city']),
            ('Country', 'Afghanistan'),
            ('Principal business activity', 'Industrial metrology and calibration services'),
            ('Issued share capital', '5,000,000 AFN fully paid'),
            ('Number of shareholders', '2 (see ownership declaration)'),
        ]),
        Paragraph('Contact on file', H),
        table([
            ('Authorized contact name', c['contactName']),
            ('Authorized contact email', c['contactEmail']),
            ('Contact role', 'Procurement and compliance officer'),
        ]),
        PageBreak(),
        Paragraph('REGISTRATION EXTRACT - ADDITIONAL PARTICULARS', TITLE),
        Paragraph('Extract of the commercial register for ' + c['legalName'], SUB),
        table([
            ('Company name', c['legalName']),
            ('Registration number', c['registryId']),
            ('Registered office', f"{c['addressLine1']}, {c['city']}"),
            ('Trade licence number', 'TL-KBL-2025-117204'),
            ('Trade licence valid until', '2027-03-11'),
            ('Directors', 'Ahmad Zia Rahimi (Managing Director); Mariam Sediqi (Director, Compliance)'),
            ('Registrar', 'Registrar of Companies, Kabul (fictional)'),
            ('Date of issue of this extract', '2026-01-15'),
        ]),
        Spacer(1, 8),
        Paragraph('Declaration: the particulars above are a true extract of the commercial register as at the date of issue. '
                  f'Registration number {c["registryId"]} is unique to {c["legalName"]}.', P),
    ])


def bank():
    b, c = INPUTS['bank'], INPUTS['company']
    build('2_BANK_account_confirmation_letter.pdf', 'Bank Account Confirmation Letter', [
        Paragraph('HINDUKUSH COMMERCIAL BANK (fictional)', TITLE),
        Paragraph('Corporate Banking - Kabul Main Branch', SUB),
        Paragraph('Date: 2026-02-03', P),
        Paragraph('To whom it may concern: BANK ACCOUNT CONFIRMATION', H),
        Paragraph('We confirm that the following bank account is held with our bank and is active. The account holder name, '
                  'account number and bank identifiers are given below for supplier onboarding purposes.', P),
        Paragraph('Account details', H),
        table([
            ('Bank name', 'Hindukush Commercial Bank'),
            ('Branch', 'Kabul Main Branch'),
            ('Bank country', 'Afghanistan (AF)'),
            ('Account holder name (beneficiary)', b['beneficiary']),
            ('Account number', b['account']),
            ('Account currency', f"{b['currency']} (Afghani)"),
            ('SWIFT / BIC code', 'HKCBAFKX'),
            ('Routing / bank identifier', b['routing']),
            ('Account type', 'Current account (business)'),
            ('Account opened on', '2019-05-20'),
            ('Account status', 'Active'),
            ('Account holder address', f"{c['addressLine1']}, {c['city']}, Afghanistan"),
        ]),
        Spacer(1, 8),
        Paragraph(f"The account number {b['account']} is registered in the name of {b['beneficiary']}.", P),
        Spacer(1, 14),
        Paragraph('Authorized signatory: Nasrin Hotak, Relationship Manager, Corporate Banking', P),
        Paragraph('Hindukush Commercial Bank, Kabul Main Branch (fictional bank)', P),
    ])


def tax():
    t, c = INPUTS['tax'], INPUTS['company']
    build('3_TAX_taxpayer_registration_certificate.pdf', 'Taxpayer Registration Certificate', [
        Paragraph('TAXPAYER REGISTRATION CERTIFICATE', TITLE),
        Paragraph('Revenue Department - Large and Medium Taxpayer Office, Kabul (fictional authority)', SUB),
        Paragraph('This certificate confirms that the taxpayer named below is registered for tax purposes and has been issued a '
                  'Taxpayer Identification Number (TIN).', P),
        Paragraph('Taxpayer details', H),
        table([
            ('Taxpayer legal name', c['legalName']),
            ('Taxpayer Identification Number (TIN)', t['taxId']),
            ('Tax country', 'Afghanistan (AF)'),
            ('Taxpayer category', 'Corporate taxpayer - limited company'),
            ('Business address', f"{c['addressLine1']}, {c['city']}"),
            ('Date of tax registration', '2019-04-02'),
            ('Tax office', 'Large and Medium Taxpayer Office, Kabul'),
            ('Tax status', 'Active - filing current'),
            ('Tax periods covered', 'Fiscal years 2023 to 2025 filed'),
        ]),
        Paragraph('VAT and tax form status', H),
        table([
            ('VAT registered', 'No - the taxpayer is not VAT registered'),
            ('VAT registration number', 'Not applicable'),
            ('Tax form on file', 'Other foreign tax review (no W-9 / W-8BEN-E; non-US supplier)'),
            ('Business receipts tax', 'Registered and compliant'),
            ('Withholding tax agent', 'Yes'),
        ]),
        Spacer(1, 8),
        Paragraph(f"Tax identification number {t['taxId']} belongs to {c['legalName']}.", P),
        Paragraph('Issued on 2026-01-20. Authorized by: Head of Taxpayer Registration (fictional).', P),
    ])


def certificate():
    q = INPUTS['qualifications'][0]
    c = INPUTS['company']
    build('4_CERTIFICATE_calibration_accreditation_with_scope.pdf', 'Calibration Accreditation Certificate and Scope Annex', [
        Paragraph('CERTIFICATE OF ACCREDITATION', TITLE),
        Paragraph('Central Asia Laboratory Accreditation Council (fictional accreditation body)', SUB),
        Paragraph(f'This certifies that <b>{c["legalName"]}</b> operates a calibration laboratory that complies with the requirements of '
                  f'<b>{q["standard"]}</b> General requirements for the competence of testing and calibration laboratories, '
                  'within the scope of accreditation stated in the attached annex.', P),
        Paragraph('Certificate details', H),
        table([
            ('Accredited organisation', c['legalName']),
            ('Accreditation certificate number', 'CALAC-CAL-2025-0317'),
            ('Standard', q['standard']),
            ('Accredited activity', q['activity']),
            ('Accredited site', q['site']),
            ('Site address', f'Pul-e-Charkhi Industrial Park, {c["city"]}, Afghanistan'),
            ('Date first accredited', '2022-07-01'),
            ('Date of issue of this certificate', '2025-07-01'),
            ('Valid until (expires_on)', '2029-06-30'),
            ('Status', 'Valid; subject to annual surveillance'),
        ]),
        Paragraph('The certificate is valid only together with the scope annex on the following page. Expiry date in ISO format: 2029-06-30.', P),
        PageBreak(),
        Paragraph('ANNEX A - SCOPE OF ACCREDITATION', TITLE),
        Paragraph(f'Accreditation certificate CALAC-CAL-2025-0317 - {c["legalName"]}', SUB),
        table([
            ('Accredited site', q['site']),
            ('Accredited activity', q['activity']),
            ('Standard', q['standard']),
            ('Expiry of accreditation', '2029-06-30'),
        ]),
        Paragraph('Calibration measurement capability', H),
        grid([
            ('Quantity', 'Range', 'Expanded uncertainty (k=2)', 'Method'),
            ('Mass', '1 mg to 20 kg', '0.003 mg to 1.5 mg', 'Direct comparison, OIML R111 weights'),
            ('Temperature', '-40 C to 500 C', '0.02 C to 0.35 C', 'Fixed-point and comparison'),
            ('Pressure (gauge)', '0 to 600 bar', '0.02 % of reading', 'Pressure balance comparison'),
            ('Dimensional (length)', '0 to 300 mm', '1.2 um + 2.5 um/m', 'Gauge block comparator'),
            ('DC voltage', '1 mV to 1000 V', '2 uV/V to 12 uV/V', 'Multifunction calibrator'),
        ]),
        Spacer(1, 8),
        Paragraph(f'Activities outside this scope are not covered. Requested site <b>{q["site"]}</b> and activity '
                  f'<b>{q["activity"]}</b> are inside the accredited scope under {q["standard"]}.', P),
    ])


def ownership():
    o = INPUTS['ownership']
    names = {e['key']: e for e in o['entities']}
    rows = [('Owned entity', 'Owner', 'Owner country', 'Owner registry ID', 'Ownership %')]
    for edge in o['edges']:
        owner, owned = names[edge['ownerKey']], names[edge['ownedKey']]
        rows.append((owned['legalName'], owner['legalName'], owner['country'], owner.get('registryId', 'Individual - no registry ID'), f"{edge['percentage']} %"))
    ents = [('Entity', 'Type', 'Country', 'Registry ID')]
    for e in o['entities']:
        ents.append((e['legalName'], 'Vendor (declaring company)' if e['isVendor'] else ('Company' if e.get('registryId') else 'Individual'),
                     e['country'], e.get('registryId', 'None - individual')))
    build('5_OWNERSHIP_ownership_declaration.pdf', 'Beneficial Ownership Declaration', [
        Paragraph('BENEFICIAL OWNERSHIP DECLARATION', TITLE),
        Paragraph(f'Declaring company: {LEGAL_NAME} - registration number {REGISTRY_ID}', SUB),
        Paragraph(f'{LEGAL_NAME} (registry ID {REGISTRY_ID}), registered in Afghanistan, declares its complete ownership chain as at '
                  '2026-02-10. Every shareholder, parent and beneficial owner is listed. The shareholding of each owned entity totals 100 percent.', P),
        Paragraph('Entities in the ownership structure', H),
        grid(ents),
        Paragraph('Shareholding and ownership percentages', H),
        grid(rows),
        Paragraph('Ownership totals', H),
        table([
            (f'Total ownership of {LEGAL_NAME}', '100 % (Khorasan Metrology Holdings Limited 70 %, Ahmad Zia Rahimi 30 %)'),
            ('Total ownership of Khorasan Metrology Holdings Limited', '100 % (Sima Rahimi 55 %, Daniel Whitmore 45 %)'),
        ]),
        PageBreak(),
        Paragraph('BENEFICIAL OWNERS AND DECLARATION', TITLE),
        Paragraph('Persons with 25 percent or more effective interest (look-through)', H),
        grid([
            ('Beneficial owner', 'Country', 'Route', 'Effective interest'),
            ('Ahmad Zia Rahimi', 'AF', 'Direct holder of the vendor', '30 %'),
            ('Sima Rahimi', 'AF', '55 % of Khorasan Metrology Holdings Limited, which holds 70 % of the vendor', '38.5 %'),
            ('Daniel Whitmore', 'GB', '45 % of Khorasan Metrology Holdings Limited, which holds 70 % of the vendor', '31.5 %'),
        ]),
        Paragraph('Statements', H),
        Paragraph('1. No owner, parent or beneficial owner listed above is resident in or registered in a banned or comprehensively sanctioned country.', P),
        Paragraph('2. No owner listed above is named on a sanctions, debarment or exclusion list to the knowledge of the declarant.', P),
        Paragraph('3. The declarant will notify the buyer of any change to this ownership structure.', P),
        Spacer(1, 14),
        Paragraph('Declared by: Ahmad Zia Rahimi, Managing Director', P),
        Paragraph('Date: 2026-02-10', P),
    ])


def write_inputs():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'supplier-inputs.json').write_text(json.dumps(INPUTS, indent=2) + '\n')


if __name__ == '__main__':
    registration()
    bank()
    tax()
    certificate()
    ownership()
    write_inputs()
    print(f'Wrote fixtures to {OUT}')
