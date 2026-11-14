from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT

ROOT=Path('/Users/prathamjaiswal/Documents/ChatGPT/VendorOnboarding')
OUT=ROOT/'output'; OUT.mkdir(exist_ok=True)
WORK=ROOT/'tmp/proposal'; WORK.mkdir(parents=True,exist_ok=True)

im=Image.new('RGB',(2100,1420),'white'); draw=ImageDraw.Draw(im)
font='/System/Library/Fonts/Supplemental/Arial.ttf'
bold='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def xy(x,y): return (int(210+x*420),int(1390-y*94))
def txt(x,y,s,size=20,b=False):
    draw.multiline_text(xy(x,y),s,font=ImageFont.truetype(bold if b else font,size),anchor='mm',align='center',fill='#172b3f',spacing=4)
actors=['Vendor','Onboarding\nworkflow','Verification\nchecks','Authorized\nreviewer','Case record\nand history']
for x,name in enumerate(actors):
    draw.rounded_rectangle([xy(x-.43,14.07),xy(x+.43,13.2)],radius=8,fill='#edf1f5',outline='#bdc7d2',width=2)
    txt(x,13.64,name,25,True)
    for yy in range(160,1340,18): draw.line([(xy(x,0)[0],yy),(xy(x,0)[0],yy+9)],fill='#b5bec8',width=2)
def arrow(a,b,y,label,fs=9.1):
    start,end=xy(a,y),xy(b,y); draw.line([start,end],fill='#264867',width=3)
    d=1 if b>a else -1
    draw.polygon([end,(end[0]-d*14,end[1]-7),(end[0]-d*14,end[1]+7)],fill='#264867')
    f=ImageFont.truetype(font,23); cx,cy=xy((a+b)/2,y+.25); box=draw.textbbox((cx,cy),label,font=f,anchor='mm')
    draw.rectangle([box[0]-3,box[1]-2,box[2]+3,box[3]+2],fill='white'); draw.text((cx,cy),label,font=f,anchor='mm',fill='#172b3f')
arrow(0,1,12.6,'1  Submit package')
arrow(1,4,11.65,'2  Create case and submission version')
arrow(1,2,10.7,'3  Run checks')
arrow(2,1,9.75,'4  Return evidence')
arrow(1,4,8.8,'5  Save findings and required actions')
draw.rectangle([xy(-.48,8.24),xy(4.48,7.75)],fill='#f3f5f7'); txt(2,7.98,'If all checks pass and required approvals are complete',24)
arrow(1,4,7.25,'6a  Record Approved against current version')
draw.rectangle([xy(-.48,6.75),xy(4.48,6.26)],fill='#f3f5f7'); txt(2,6.51,'If evidence or a review is required',24)
arrow(1,0,5.8,'6b  Request evidence')
arrow(0,1,4.85,'7  Correct and resubmit')
arrow(1,2,3.9,'8  Recheck changes')
arrow(1,3,2.95,'9  Route evidence for decision')
arrow(3,1,2,'10  Decide on current version')
arrow(1,4,1.05,'11  Validate version and save decision')
txt(2,.1,'Vendor receives status and next steps after every decision. All transitions retain evidence.',22)
im.save(WORK/'sequence.png')

doc=Document(); sec=doc.sections[0]
sec.page_width=Inches(8.27); sec.page_height=Inches(11.69)
sec.top_margin=Inches(.65); sec.bottom_margin=Inches(.6)
sec.left_margin=Inches(.72); sec.right_margin=Inches(.72)
normal=doc.styles['Normal']; normal.font.name='Calibri'; normal.font.size=Pt(10.5)
normal.paragraph_format.space_after=Pt(6); normal.paragraph_format.line_spacing=1.08
for name,size in [('Title',27),('Subtitle',12),('Heading 1',17),('Heading 2',12),('Heading 3',11)]:
    s=doc.styles[name]; s.font.name='Calibri'; s.font.size=Pt(size); s.font.color.rgb=RGBColor(0,0,0)
    s.paragraph_format.space_before=Pt(10); s.paragraph_format.space_after=Pt(6)
doc.styles['Title'].paragraph_format.space_before=Pt(0)
doc.styles['Subtitle'].paragraph_format.space_before=Pt(0)
doc.styles['Caption'].font.color.rgb=RGBColor(0,0,0)
for border in doc.styles.element.xpath('.//w:pBdr'):
    border.getparent().remove(border)
doc.core_properties.title='Vendor onboarding product requirements proposal'
doc.core_properties.subject='PS 2 scoped product proposal'
doc.core_properties.author=''
footer=sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
r=footer.add_run('Vendor onboarding proposal  |  '); r.font.size=Pt(8); r.font.color.rgb=RGBColor.from_string('666666')
field=OxmlElement('w:fldSimple'); field.set(qn('w:instr'),'PAGE'); footer._p.append(field)
def p(text='',boldlead=None,style=None):
    para=doc.add_paragraph(style=style)
    if boldlead and text.startswith(boldlead): para.add_run(boldlead).bold=True; para.add_run(text[len(boldlead):])
    else: para.add_run(text)
    return para
def h(text,level=1): doc.add_heading(text,level)
def page(): doc.add_page_break()
def table(headers,rows,widths):
    t=doc.add_table(rows=1,cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    for c,w in zip(t.columns,widths): c.width=Inches(w)
    for i,v in enumerate(headers): t.rows[0].cells[i].text=v
    for row in rows:
        cells=t.add_row().cells
        for i,v in enumerate(row): cells[i].text=v
    for ri,row in enumerate(t.rows):
        for ci,cell in enumerate(row.cells):
            cell.width=Inches(widths[ci]); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            props=cell._tc.get_or_add_tcPr(); shade=OxmlElement('w:shd'); shade.set(qn('w:fill'),'253E57' if ri==0 else ('F2F5F8' if ri%2==0 else 'FFFFFF')); props.append(shade)
            borders=OxmlElement('w:tcBorders')
            for edge in ['top','left','bottom','right']:
                e=OxmlElement('w:'+edge); e.set(qn('w:val'),'single'); e.set(qn('w:sz'),'4'); e.set(qn('w:color'),'D9D9D9'); borders.append(e)
            props.append(borders)
            margins=OxmlElement('w:tcMar')
            for edge in ['top','left','bottom','right']:
                e=OxmlElement('w:'+edge); e.set(qn('w:w'),'85'); e.set(qn('w:type'),'dxa'); margins.append(e)
            props.append(margins)
            for para in cell.paragraphs:
                para.paragraph_format.space_after=Pt(2); para.paragraph_format.line_spacing=1.02
                for run in para.runs:
                    run.font.size=Pt(9.3)
                    if ri==0: run.bold=True; run.font.color.rgb=RGBColor(255,255,255)
        pr=row._tr.get_or_add_trPr(); pr.append(OxmlElement('w:cantSplit'))
    t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
    doc.add_paragraph().paragraph_format.space_after=Pt(0)
    return t
def link(label,url):
    para=doc.add_paragraph(); para.paragraph_format.space_after=Pt(4)
    rel=para.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True)
    hyp=OxmlElement('w:hyperlink'); hyp.set(qn('r:id'),rel); r=OxmlElement('w:r'); pr=OxmlElement('w:rPr'); c=OxmlElement('w:color');c.set(qn('w:val'),'24537B');pr.append(c);sz=OxmlElement('w:sz');sz.set(qn('w:val'),'18');pr.append(sz);r.append(pr);tx=OxmlElement('w:t');tx.text=label;r.append(tx);hyp.append(r);para._p.append(hyp)

doc.core_properties.title='Invitation based supplier onboarding PRD'
doc.add_heading('Invitation based supplier onboarding',0)
p('Product requirements  |  PS-2  |  11 November 2026',style='Subtitle')
p('Harbor BioLabs, a fictional US biopharma buyer, needs to approve suppliers of lab equipment and maintenance before purchasing. Procurement owns intake, the supplier provides evidence, and an authorized buyer reviewer decides. The first release supports Delaware corporations. Phase 2 adds the UAE mainland corporate profile.')
p('Success: A buyer invites a supplier, the supplier submits once, and a reviewer can approve from one case with a traceable record. Measure elapsed time from invitation to decision and reviewer handling minutes on the demo cases.',boldlead='Success:')
h('Questionnaire and evidence',1)
p('Oracle Fusion supports configurable registration sections, qualifications and evidence attachments. Ripple publishes a buyer invitation flow using Oracle. Harbor adopts that pattern and sets its own purchasing requirements. [1–2]')
table(['Step','Supplier answers and uploads','How the buyer uses it'],[
('1  Company','Legal name, formation country and jurisdiction, registry ID, legal address, contact name and work email. UAE mainland suppliers upload the current trade licence.','Match the legal identity and issuer. Delaware lookup provides identity details. Obtain a status certificate only if policy requires proof of status. [3–4]'),
('2  Tax','US corporation uploads signed W-9. Eligible UAE corporate payee uploads W-8BEN-E when buyer Tax selects it. Ask UAE VAT status and collect VAT TRN and certificate only if registered.','US forms document tax status for applicable reporting or withholding. Tax handles alternative forms. UAE VAT evidence supports local registration checks. [5–7]'),
('3  Remittance','Beneficiary legal name, bank country, currency, routing or IBAN as applicable, account reference, and bank letter or equivalent buyer-approved evidence.','Harbor policy requires a same-entity payee and separate confirmation before approval. A format check or uploaded letter alone cannot confirm account ownership. [1]'),
('4  Qualification','Confirm invited category and operating site. For designated lab services, upload ISO 9001 certificate and site annex if applicable.','Harbor sets the certificate requirement. Compare the certified legal entity, validity, activity and site with the engagement. [8]')
],[1.03,2.96,2.83])
h('Release boundary',2)
p('Build the happy path first using one fictional US supplier and synthetic PDFs. Send invitations and notices to a test inbox. Reuse the same screens and case model for the two Phase 2 scenarios. Use labeled fixtures for registry, bank, certificate and sanctions checks where external access is unavailable. The pilot ends at a decision and a supplier record inside the demo. Live ERP activation and payment execution are outside scope.')

page();h('Happy path and sequence')
p('Example: A buyer invites Nova Calibration Inc. for lab calibration at the supplier’s Newark site. The invite preselects the US corporate questionnaire and Harbor’s lab-services evidence policy. Nova supplies matching company, W-9, bank and certificate evidence.')
# Redraw with a four-lane invitation journey.
im=Image.new('RGB',(2100,1230),'white'); draw=ImageDraw.Draw(im)
def xy(x,y): return (int(250+x*530),int(1180-y*86))
actors=['Buyer','Supplier','Onboarding\nworkflow','Reviewer']
for x,name in enumerate(actors):
    draw.rounded_rectangle([xy(x-.42,13.12),xy(x+.42,12.24)],radius=8,fill='#edf1f5',outline='#bdc7d2',width=2)
    txt(x,12.67,name,28,True)
    for yy in range(135,1181,18): draw.line([(xy(x,0)[0],yy),(xy(x,0)[0],yy+9)],fill='#b5bec8',width=2)
for a,b,y,s in [
    (0,2,11.65,'1  Create invitation with category and policy'),
    (2,1,10.63,'2  Deliver email link'),
    (1,2,9.61,'3  Redeem link and verify email'),
    (2,1,8.59,'4  Open scoped questionnaire'),
    (1,2,7.57,'5  Save draft and upload PDFs'),
    (1,2,6.55,'6  Submit signed forms and attestation'),
    (2,1,5.53,'7  Confirm receipt and case ID'),
    (2,3,4.51,'8  Route check results and evidence'),
    (3,2,3.49,'9  Approve submitted version'),
    (2,0,2.47,'10  Update dashboard and create supplier record'),
    (2,1,1.45,'11  Notify supplier of approval')
]: arrow(a,b,y,s)
txt(1.5,.45,'Submission, checks, decision and notices are recorded on the same case.',25)
im.save(WORK/'invitation_sequence.png')
shape=doc.add_picture(str(WORK/'invitation_sequence.png'),width=Inches(6.82))
shape._inline.docPr.set('descr','Buyer creates an invitation. Supplier verifies their email, submits evidence and receives a receipt. Workflow routes evidence to a reviewer, records the decision, updates the dashboard and notifies the supplier.')
p('Figure 1  Invitation through supplier approval',style='Caption')
p('Buyer: Create or revoke an invitation from the dashboard. Set supplier email, country, purchase category and site. Track Invited, Draft, Submitted, Pending, Approved and Rejected. Submitted means checks or initial review are underway. Expired invites can be reissued for the same case.',boldlead='Buyer:')
p('Supplier: Redeem a single-use link within seven days and verify the invited mailbox. Resume via a fresh verified link. Save each section, review the package, attest accuracy and submit. Receipt shows the case ID and status.',boldlead='Supplier:')
p('Reviewer: Read the check summary and open cited evidence. Approve only the current version when every required check passes. The decision creates one supplier record and queues confirmation. Missing evidence or unavailable checks keep the case Pending with an owner and next step.',boldlead='Reviewer:')

page();h('Data flow and acceptance')
table(['Record','Key fields and relationship'],[
('Invitation','invite_id, buyer_id, contact_email, country, category, site, policy_version, token_hash, expires_at, redeemed_at, revoked_at, case_id'),
('Case and submission','case_id, invite_id, status, current_version. Submission stores case_id, version, legal_name, registry_id, tax_form_type, secure_tax_ref, secure_bank_ref, bank_last4, sites, attested_at and submitted_at.'),
('Document and check','Document: doc_id, case_id, version, type, storage_ref, extracted_fields. Check: case_id, version, rule, result, source, evidence doc_id/page, checked_at and next action.'),
('Decision and supplier','Decision: case_id, version, reviewer_id, outcome, reason, timestamp. Approval creates supplier_id linked to the approved version. Events record transitions and notification delivery.')
],[1.44,5.38])
p('Data movement: Invite context loads the policy and form. Submission freezes the answers and file references. PDF extraction links values to source pages. Checks compare them with answers, policy and verification results. The reviewer sees masked bank and tax data by default. Store PDFs privately with case access controls and keep tokens and raw identifiers out of logs.',boldlead='Data movement:')
p('Phase 1 acceptance: Valid invite opens only its case. Nova submits, sees a receipt and is approved after review. Retry of submit or approval produces one submitted version or supplier record respectively. Revoked and expired links cannot open the form.',boldlead='Phase 1 acceptance:')
h('Phase 2 acceptance scenarios',2)
p('1. Certificate covers the wrong site. A valid certificate covers Plant A and the engagement names Plant B. Keep Pending, request the relevant annex, send the supplier a verified link to the same case and recheck coverage on the new submission version. Approve after the reviewer confirms the current version. [8]')
p('2. Ownership reveals a restricted party. Collect a UAE supplier’s ownership declaration and supporting register extract. Its name has no direct hit. In the fixture, a blocked party owns 60% of its parent, which owns 80% of the supplier. Store owner IDs, ownership percentages and evidence references. Keep Pending and route the chain to Compliance. An authorized reviewer records rejection if the restriction applies and no authorization permits the relationship. [9]')
h('Sources',2)
def sources(items):
    para=doc.add_paragraph()
    para.paragraph_format.space_after=Pt(4)
    for i,(label,url) in enumerate(items):
        if i: para.add_run('   •   ').font.size=Pt(8)
        rel=para.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True)
        hyp=OxmlElement('w:hyperlink'); hyp.set(qn('r:id'),rel)
        run=OxmlElement('w:r'); pr=OxmlElement('w:rPr')
        for tag,val in [('color','24537B'),('sz','17')]:
            e=OxmlElement('w:'+tag); e.set(qn('w:val'),val); pr.append(e)
        run.append(pr); t=OxmlElement('w:t'); t.text=label; run.append(t); hyp.append(run); para._p.append(hyp)
sources([('[1] Oracle Fusion registration options','https://docs.oracle.com/en/cloud/saas/procurement/26d/oapro/Chunk1124827567.html'),('[2] Ripple supplier onboarding','https://ripple.com/suppliers/onboarding/'),('[3] Delaware entity search','https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx')])
sources([('[4] UAE licence verification','https://u.ae/en/information-and-services/business/important-digital-services/inquire-about-licences-names-and-activities'),('[5] IRS W-9 guidance','https://www.irs.gov/instructions/iw9'),('[6] IRS W-8 guidance','https://www.irs.gov/instructions/iw8')])
sources([('[7] UAE FTA VAT registration','https://www.tax.gov.ae/en/services/vat.registration.aspx'),('[8] IAF CertSearch','https://support.iafcertsearch.org/iaf-certsearch-faq/iaf-certsearch-faq/general'),('[9] OFAC FAQ 401','https://ofac.treasury.gov/faqs/401')])
doc.save(OUT/'Invitation_Based_Vendor_Onboarding_PRD.docx')
