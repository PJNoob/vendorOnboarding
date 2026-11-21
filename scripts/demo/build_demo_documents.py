"""Build the PDF evidence and form-value sheets for the four demo-video cases.

Every company, bank, accreditation body and person here is fictional. Each page carries a
"demo document" footer. The values are chosen so the live checks produce exactly the outcome
described in output/Demo_Video_Script.md:

  A  happy path: every check passes
  B  tax format: a UAE TRN entered as a US tax ID is refused at save
  C  wrong document + certificate scope: bank slot holds an ISO certificate; scope omits the site
  D  hidden sanctioned owner: 80% parent is 60% owned by FIXTURE-BLOCKED-001 (demo screening)

Run:  python3 scripts/demo/build_demo_documents.py  (writes output/demo_documents/ and output/demo_documents_set2/)
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(__file__).resolve().parents[2] / 'output' / 'demo_documents'
INK = colors.HexColor('#172b3f')
MUTED = colors.HexColor('#5b6b7b')
LINE = colors.HexColor('#c5ced8')
FOOTER = 'Demo document for a fictional company, prepared for a product demonstration. Not an official record.'

BODY = ParagraphStyle('body', fontName='Helvetica', fontSize=10.5, leading=15, textColor=INK)
SMALL = ParagraphStyle('small', parent=BODY, fontSize=9, leading=12, textColor=MUTED)
TITLE = ParagraphStyle('title', parent=BODY, fontName='Helvetica-Bold', fontSize=17, leading=22, spaceAfter=4)
SUB = ParagraphStyle('sub', parent=BODY, fontName='Helvetica-Bold', fontSize=11.5, leading=15, spaceBefore=8, spaceAfter=4)


def letterhead(name, line, accent):
    t = Table([[Paragraph(f'<b>{name}</b>', ParagraphStyle('lh', parent=BODY, fontSize=13, textColor=colors.white)),
                Paragraph(line, ParagraphStyle('lh2', parent=SMALL, textColor=colors.white, alignment=2))]],
              colWidths=[3.9 * inch, 3.1 * inch])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(accent)),
                           ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 10),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 10), ('LEFTPADDING', (0, 0), (-1, -1), 12),
                           ('RIGHTPADDING', (0, 0), (-1, -1), 12)]))
    return [t, Spacer(1, 18)]


def fields(rows, widths=(2.3 * inch, 4.7 * inch)):
    t = Table([[Paragraph(f'<b>{k}</b>', BODY), Paragraph(v, BODY)] for k, v in rows], colWidths=widths)
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.6, LINE), ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f4f7')),
                           ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 6),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    return [t, Spacer(1, 12)]


def grid(header, rows, widths):
    t = Table([[Paragraph(f'<b>{h}</b>', BODY) for h in header]] + [[Paragraph(c, BODY) for c in r] for r in rows],
              colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.6, LINE), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8f1ee')),
                           ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 6),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    return [t, Spacer(1, 12)]


def signature(name, title, date):
    return [Spacer(1, 22), Paragraph('_______________________________', BODY),
            Paragraph(f'{name}<br/>{title}<br/>Date: {date}', BODY)]


def build(path, story):
    path.parent.mkdir(parents=True, exist_ok=True)

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.75 * inch, 0.5 * inch, FOOTER)
        canvas.drawRightString(7.75 * inch, 0.5 * inch, f'Page {doc.page}')
        canvas.restoreState()

    SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                      topMargin=0.7 * inch, bottomMargin=0.8 * inch, title=path.stem,
                      author='Harbor demo data').build(story, onFirstPage=footer, onLaterPages=footer)


# ---------------------------------------------------------------- document templates
def registration(c):
    return letterhead('State of Delaware', 'Division of Corporations', '#24415f') + [
        Paragraph('Certificate of Formation', TITLE),
        Paragraph('Limited liability company registration', SMALL), Spacer(1, 12),
        Paragraph(f'This certifies that <b>{c["legal_name"]}</b> is duly formed and registered under the laws of the '
                  f'State of Delaware and is in good standing as of the date below.', BODY), Spacer(1, 12),
        *fields([
            ('Company name', c['legal_name']),
            ('File number', c['registry_id']),
            ('Entity type', c['entity_type']),
            ('Jurisdiction', 'Delaware, United States'),
            ('Date of formation', c['formed']),
            ('Principal office', c['address']),
            ('Status', 'Active, in good standing'),
        ]),
        *signature('Registrar of Corporations', 'Division of Corporations', '2026-10-05'),
    ]


def bank_letter(c):
    b = c['bank']
    return letterhead(b['name'], 'Commercial Banking Services', '#1f5f74') + [
        Paragraph('Account Confirmation Letter', TITLE),
        Paragraph('Issued at the request of the account holder for supplier onboarding', SMALL), Spacer(1, 12),
        Paragraph(f'We confirm that the business deposit account below is held with {b["name"]} in the name of '
                  f'the account holder shown, and that the account is open and in good standing.', BODY), Spacer(1, 12),
        *fields([
            ('Account holder', c['legal_name']),
            ('Account holder address', c['address']),
            ('Account number', b['account']),
            ('Routing number (ABA)', b['routing']),
            ('SWIFT / BIC', b['swift']),
            ('Account type', 'Business checking'),
            ('Currency', 'USD'),
            ('Account opened', b['opened']),
        ]),
        Paragraph('This letter confirms account ownership only and is not a guarantee of funds.', SMALL),
        *signature(b['officer'], 'Relationship Manager, Commercial Banking', '2026-10-12'),
    ]


def w9(c):
    return letterhead('Form W-9', 'Request for Taxpayer Identification Number and Certification', '#3b3b3b') + [
        Paragraph('Form W-9: Taxpayer Identification Number', TITLE),
        Paragraph('Completed by the vendor for its customer. Facsimile prepared for demonstration.', SMALL), Spacer(1, 12),
        *fields([
            ('Name of entity', c['legal_name']),
            ('Tax classification', 'Limited liability company taxed as a C corporation' if c['entity_type'].startswith('Limited')
             else 'C corporation'),
            ('Address', c['address']),
            ('Employer ID (EIN)', c['ein']),
            ('Exemptions', 'None'),
        ]),
        Paragraph('<b>Part II  Certification.</b> Under penalties of perjury, I certify that the number shown on this '
                  'form is the correct taxpayer identification number of the entity named above, and that the entity '
                  'is a U.S. person.', BODY),
        *signature(c['signatory'], 'Authorized signatory', '2026-10-08'),
    ]


def certificate(c, scope_sites, annex=True):
    story = letterhead('National Calibration Accreditation Board', 'Accreditation services', '#286454') + [
        Paragraph('Certificate of Accreditation', TITLE),
        Paragraph('ISO/IEC 17025:2017 General requirements for the competence of testing and calibration laboratories', SMALL),
        Spacer(1, 12),
        Paragraph(f'The National Calibration Accreditation Board hereby certifies that <b>{c["legal_name"]}</b> '
                  f'has demonstrated technical competence for the calibration activities listed in the scope of '
                  f'accreditation in accordance with ISO/IEC 17025:2017.', BODY), Spacer(1, 12),
        *fields([
            ('Certificate holder', c['legal_name']),
            ('Standard', 'ISO/IEC 17025:2017'),
            ('Issued', '2025-07-01'),
            ('Valid until', '2028-06-30'),
        ]),
    ]
    if annex:
        story += [Paragraph('Scope of accreditation (annex)', SUB)]
        story += grid(['Site', 'Activity', 'Range and capability'],
                      [[f'{s["site"]}<br/>{s["address"]}', 'Calibration of dimensional, pressure and temperature instruments',
                        s['range']] for s in scope_sites], [2.4 * inch, 2.4 * inch, 2.2 * inch])
    story += signature('Director of Accreditation', 'National Calibration Accreditation Board', '2025-07-01')
    return story


def ownership(c):
    rows = [[e['name'], e['country'], e.get('registry', 'n/a'), e['owns']] for e in c['owners']]
    return letterhead(c['legal_name'], c['address'], '#4a3f6b') + [
        Paragraph('Beneficial Ownership Declaration', TITLE),
        Paragraph('Declared by the vendor for supplier onboarding', SMALL), Spacer(1, 12),
        *fields([
            ('Vendor', c['legal_name']),
            ('Vendor registration (file) number', c['registry_id']),
            ('Jurisdiction', 'Delaware, United States'),
        ]),
        Paragraph('Ownership chain', SUB),
        Paragraph('Each row lists a shareholder and the percentage of equity it holds. Holdings of every entity add up to 100%.', BODY),
        Spacer(1, 6),
        *grid(['Shareholder', 'Country', 'Registry ID', 'Holding'], rows, [2.2 * inch, 0.85 * inch, 1.85 * inch, 2.1 * inch]),
        Paragraph('I declare that this is a complete and accurate statement of the direct and indirect owners of the vendor.', BODY),
        *signature(c['signatory'], 'Authorized signatory', '2026-10-08'),
    ]


# ---------------------------------------------------------------- cases
A = dict(
    legal_name='Cedar Meridian QA Calibration LLC', registry_id='7712408', entity_type='Limited liability company',
    formed='2014-03-18', address='1180 Raymond Boulevard, Suite 400, Newark, NJ 07102', ein='12-3456789',
    signatory='Priya Raman', site='Newark Calibration Lab',
    bank=dict(name='Garden State Commerce Bank', account='4401 2287 9035', routing='021987654', swift='GSCBUS33',
              opened='2015-02-09', officer='Daniel Ortiz'),
    owners=[dict(name='Cedar Meridian Holdings Inc.', country='US', registry='5530917',
                 owns='100% of Cedar Meridian QA Calibration LLC')],
)
B = dict(
    legal_name='Lakeshore Precision Instruments LLC', registry_id='6650231', entity_type='Limited liability company',
    formed='2017-09-04', address='455 North Cityfront Plaza, Floor 9, Chicago, IL 60611', ein='98-7654321',
    signatory='Marcus Hale', site='Chicago Calibration Lab',
)
C = dict(
    legal_name='Northwind Metrology Inc.', registry_id='5981346', entity_type='Corporation',
    formed='2011-11-21', address='33 Wood Avenue South, Iselin, NJ 08830', ein='45-6789012',
    signatory='Elena Brooks', site='Edison Calibration Lab',
    owners=[dict(name='Elena Brooks', country='US', owns='100% of Northwind Metrology Inc.')],
)
D = dict(
    legal_name='Blue Harbor Labs LLC', registry_id='7809154', entity_type='Limited liability company',
    formed='2019-05-13', address='200 Federal Street, Suite 1100, Camden, NJ 08103', ein='31-4159265',
    signatory='Thomas Reyes', site='Camden Calibration Lab',
    bank=dict(name='Delaware Valley Trust Bank', account='7720 5531 0846', routing='031456789', swift='DVTBUS3P',
              opened='2019-06-03', officer='Grace Kim'),
    owners=[
        dict(name='Harbor Crest Holdings Ltd', country='GB', registry='11823407', owns='80% of Blue Harbor Labs LLC'),
        dict(name='Marina Ventures LLC', country='US', registry='6034418', owns='20% of Blue Harbor Labs LLC'),
        dict(name='Volkov Maritime Trading Group', country='CY', registry='FIXTURE-BLOCKED-001',
             owns='60% of Harbor Crest Holdings Ltd'),
        dict(name='Coastal Equity Partners LP', country='US', registry='4471902', owns='40% of Harbor Crest Holdings Ltd'),
    ],
)


# Second set: same four scenarios, different companies, sites, identifiers and addresses.
A2 = dict(
    legal_name='Silverline Gauge Calibration LLC', registry_id='6248817', entity_type='Limited liability company',
    formed='2016-08-22', address='8601 Ranch Road 2222, Building 3, Austin, TX 78730', ein='74-2918365',
    signatory='Arjun Mehta', site='Austin Calibration Lab',
    bank=dict(name='Lone Star Commercial Bank', account='3318 6604 2751', routing='114987652', swift='LSCBUS44',
              opened='2016-10-03', officer='Rebecca Nguyen'),
    owners=[dict(name='Silverline Instruments Group Inc.', country='US', registry='4902266',
                 owns='100% of Silverline Gauge Calibration LLC')],
)
B2 = dict(
    legal_name='Pinecrest Measurement Systems LLC', registry_id='7034519', entity_type='Limited liability company',
    formed='2018-04-16', address='1201 Third Avenue, Suite 2600, Seattle, WA 98101', ein='91-6037428',
    signatory='Hannah Lowe', site='Seattle Calibration Lab',
)
C2 = dict(
    legal_name='Ridgeway Instruments Inc.', registry_id='6115802', entity_type='Corporation',
    formed='2012-02-07', address='2600 Michelson Drive, Suite 900, Irvine, CA 92612', ein='33-8172046',
    signatory='Daniel Kwan', site='Irvine Calibration Lab',
    owners=[dict(name='Daniel Kwan', country='US', owns='100% of Ridgeway Instruments Inc.')],
)
D2 = dict(
    legal_name='Northgate Analytical Labs LLC', registry_id='7356021', entity_type='Limited liability company',
    formed='2020-01-27', address='100 Pine Street, Suite 1250, San Francisco, CA 94111', ein='94-3725106',
    signatory='Laura Bennett', site='San Francisco Calibration Lab',
    bank=dict(name='Bayshore Trust Bank', account='6025 9913 4480', routing='121654329', swift='BSTBUS6S',
              opened='2020-03-02', officer='Michael Chen'),
    owners=[
        dict(name='Altamira Holdings Ltd', country='GB', registry='09874521', owns='80% of Northgate Analytical Labs LLC'),
        dict(name='Redwood Growth LLC', country='US', registry='5188340', owns='20% of Northgate Analytical Labs LLC'),
        dict(name='Kestrel Offshore Trading Ltd', country='CY', registry='FIXTURE-BLOCKED-001',
             owns='60% of Altamira Holdings Ltd'),
        dict(name='Pacific Equity Partners LP', country='US', registry='4029318', owns='40% of Altamira Holdings Ltd'),
    ],
)

SETS = [
    dict(root=OUT, cases=(A, B, C, D), folders=('A_happy_path_Cedar_Meridian', 'B_tax_format_Lakeshore',
                                                 'C_wrong_document_Northwind', 'D_sanctioned_owner_Blue_Harbor'),
         other_lab=dict(site='Trenton Calibration Lab', address='1 West State Street, Trenton, NJ 08608'), omitted='Edison'),
    dict(root=OUT.parent / 'demo_documents_set2', cases=(A2, B2, C2, D2),
         folders=('A_happy_path_Silverline', 'B_tax_format_Pinecrest', 'C_wrong_document_Ridgeway',
                  'D_sanctioned_owner_Northgate'),
         other_lab=dict(site='San Diego Calibration Lab', address='600 B Street, San Diego, CA 92101'), omitted='Irvine'),
]


def lab(case, range_text='Length 0 to 1 m; pressure 0 to 70 MPa; temperature -40 to 650 °C'):
    return dict(site=case['site'], address=case['address'], range=range_text)


def build_set(root, cases, folders, other_lab, omitted):
    A, B, C, D = cases
    a, b, c, d = (root / name for name in folders)
    build(a / 'A1_REGISTRATION_certificate_of_formation.pdf', registration(A))
    build(a / 'A2_BANK_account_confirmation_letter.pdf', bank_letter(A))
    build(a / 'A3_TAX_form_W9.pdf', w9(A))
    build(a / 'A4_CERTIFICATE_iso17025_with_scope.pdf', certificate(A, [lab(A)]))
    build(a / 'A5_OWNERSHIP_declaration.pdf', ownership(A))

    build(b / 'B1_REGISTRATION_certificate_of_formation.pdf', registration(B))
    build(b / 'B2_TAX_form_W9.pdf', w9(B))

    other = dict(other_lab, range='Pressure 0 to 70 MPa; temperature -40 to 650 °C')
    build(c / 'C1_REGISTRATION_certificate_of_formation.pdf', registration(C))
    # Uploaded in the BANK slot on purpose: an accreditation certificate, no account details.
    build(c / 'C2_upload_as_BANK_iso_certificate_WRONG_DOCUMENT.pdf', certificate(C, [], annex=False))
    build(c / 'C3_TAX_form_W9.pdf', w9(C))
    # Scope covers another lab only, not the requested site.
    build(c / f'C4_CERTIFICATE_iso17025_scope_omits_{omitted}.pdf', certificate(C, [other]))
    build(c / 'C5_OWNERSHIP_declaration.pdf', ownership(C))

    build(d / 'D1_REGISTRATION_certificate_of_formation.pdf', registration(D))
    build(d / 'D2_BANK_account_confirmation_letter.pdf', bank_letter(D))
    build(d / 'D3_TAX_form_W9.pdf', w9(D))
    build(d / 'D4_CERTIFICATE_iso17025_with_scope.pdf', certificate(D, [lab(D)]))
    build(d / 'D5_OWNERSHIP_declaration_with_blocked_parent.pdf', ownership(D))
    print(f'Wrote demo documents to {root}')


def main():
    for demo_set in SETS:
        build_set(**demo_set)


if __name__ == '__main__':
    main()
