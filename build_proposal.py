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

doc.add_heading('Vendor onboarding product requirements proposal',0)
p('PS 2  |  Proposed MVP  |  10 November 2026',style='Subtitle')
p('Decision requested: Agree the scope for a one week build that turns a supplier submission into an explainable Approved, Pending or Rejected outcome, with tracked follow-up and reviewer accountability.',boldlead='Decision requested:')
h('Business problem and proposed outcome')
p('Procurement collects supplier information across forms, documents and email. Reviewers must decide whether the supplier is credible, whether the evidence covers the purchase and whether payment instructions are authorized. A complete package can still conceal an ineligible owner, an uncovered activity or an unverified recipient.')
p('We propose a case-based onboarding workflow that assembles evidence, applies defined checks, requests specific corrections and routes exceptions to an authorized reviewer. Every status includes reasons, next actions and a visible history. Approval means eligible for supplier activation under the selected policy; it does not execute payment.')
h('Fictional buyer and operating context')
p('Harbor BioLabs is a US biotechnology company buying laboratory equipment, calibration and maintenance from US and UAE suppliers. Its US purchasing entity applies an approved procurement policy and relevant US sanctions requirements. The pilot uses fictional supplier packages and a dated demonstration screening dataset; no example is an allegation about a real business.')
h('Users and business value')
table(['User','Need','Value delivered'],[
('Supplier contact','Understand and resolve evidence gaps','One case and specific requests instead of repeated email exchanges'),
('Procurement analyst','See what passed and what prevents approval','Less re-reading and a clear queue of actionable exceptions'),
('Finance or compliance reviewer','Decide from current, traceable evidence','Control payment arrangements and eligibility before activation')],[1.35,2.15,3.32])
h('Success measures')
p('Pilot targets, not measured benefits: at least 50% less reviewer handling time than a manual run of the same test pack; all five core scenarios reach the expected state; every non-approved case has a reason, owner and next action. Measure handling time separately from supplier waiting time.')

page(); h('Scope and product requirements')
p('The MVP covers initial onboarding and corrections within an open case. Four deliberate exceptions extend one working happy path. The scope follows the case study requirement for real inputs, visible execution, a history dashboard and follow-up for non-approved submissions. [1]')
table(['Included in the build','Deferred beyond the pilot'],[
('Supplier form and PDF uploads; US and UAE company and tax-field profiles','Global tax advice, all-country registry integrations and automated tax clearance'),
('Document extraction, cross-field checks and evidence references','Forensic document authentication or claims that extraction proves authenticity'),
('Four exception journeys with reviewer decisions and case history','General reputation scoring, criminal background checks and universal shell-company detection'),
('Recorded supplier requests, resubmission and delivery result','ERP activation, purchase orders, bank transfers and continuous monitoring'),
('Ownership screening with a dated demo provider and explicit source labels','Worldwide sanctions coverage and autonomous legal determinations')],[3.41,3.41])
table(['ID','Required behavior'],[
('R1','Capture legal entity, country, registration and tax details, bank recipient, purchase category, delivery site and required documents.'),
('R2','Preserve submitted values and document evidence. Mark missing, conflicting or unreadable information for correction; never invent a value.'),
('R3','Show intake, extraction, verification, decision and follow-up stages live. Distinguish failed checks from unavailable checks.'),
('R4','Keep independent issues open until each is resolved. Record reviewer identity, evidence and rationale for every manual decision.'),
('R5','Version corrections and invalidate affected checks. Prevent stale approvals and late results from approving changed information.'),
('R6','Show run history, status, age, unresolved reasons and next owner. Persist cases across restarts and avoid duplicates on retries.')],[.48,6.34])
h('Decision policy and authority')
p('Approved: All required checks and reviewer approvals pass for the current submission. Pending: Evidence is missing, inconclusive, unavailable or awaiting review; activation remains disabled. Rejected: An authorized reviewer confirms a disqualifying issue under the defined policy. A sanctions hold and any required compliance actions remain recorded separately from the onboarding label.')
p('The model extracts, compares and drafts explanations. Defined rules control status transitions. Finance authorizes a third-party payee; compliance resolves sanctions findings. Supplier-facing messages are approved templates or reviewer-cleared text for sensitive cases.')

page(); h('Journeys and sequence of decisions')
p('Happy path: A US calibration supplier submits a complete package with consistent identifiers, its own bank account and a certificate covering the requested site and activity. All required checks pass; the workflow records Approved and sends confirmation.')
p('Correction journey: A Pending supplier receives one consolidated request, adds evidence to the same case and resubmits. Only affected checks rerun. The reviewer sees what changed and resolves the remaining issues.')
doc.add_picture(str(WORK/'sequence.png'),width=Inches(6.82))
p('Figure 1  Submission through decision and correction',style='Caption')
h('What the user sees')
p('The live run shows each stage and its evidence. The case page shows the current version, open issues, requested actions and reviewer decisions. Follow-up is sent to a controlled test inbox in the demo, with delivery recorded; production delivery is a later configuration.')

page(); h('Four exception cases to build')
p('Each case starts from the same intake and exposes a different failure in a normal document checklist. Company names and records below are fictional.')
h('E1 Hidden restricted ownership',2)
p('ClearBridge Instruments in the UAE has valid documents and no direct sanctions hit. Its owner, Meridian Holdings, owns 80% of it; Meridian is 60% owned by a confirmed blocked entity in the demo dataset. The applicable OFAC ownership rule can cascade through the intermediate entity; multiplying 60% by 80% and clearing the vendor at 48% would be wrong. [2]')
p('Response: Pending with a compliance hold. Display the ownership chain and supporting identifiers; request missing ownership evidence or route verified findings to compliance. Only an authorized disposition can resolve the hold. Nationality alone is not the rejection rule. Value: Stops a clean immediate counterparty from concealing an ineligible relationship.',boldlead='Response:')
h('E2 Genuine certificate with the wrong coverage',2)
p('Aster Precision offers manufacturing at Plant B but submits an active ISO 9001 certificate covering distribution at Plant A. Harbor requires certification covering the contracted activity and site. Certificate status, scope and certified locations are distinct verification fields. [3]')
p('Response: Pending with the precise scope or site gap. Read all annexes before deciding coverage is absent; request the correct certificate or annex. A reviewer resolves ambiguous wording. Value: Prevents approval based on authentic evidence that does not satisfy the actual requirement.',boldlead='Response:')
h('E3 Authorized payee differs from the supplier',2)
p('Harbor Calibration requests payment to Summit Receivables Finance under a factoring arrangement. The recipient is a separate company, not a trading-name variation. Factoring is an established assignment of receivables. [4]')
p('Response: Pending until finance independently verifies the assignment and recipient account. Capture the covered contract or receivables, effective dates and evidence; preserve supplier and payee identities separately. Approve only the permitted arrangement after other checks pass. Value: Accommodates legitimate financing while limiting payment diversion.',boldlead='Response:')
h('E4 Supplier changes details during approval',2)
p('A reviewer opens version 1 with verified account ending 4821. The supplier resubmits account ending 9017 as version 2. The old reviewer tab or a late verification response attempts to approve the case. Supplier change controls are established in enterprise procurement workflows. [5]')
p('Response: Keep version 2 Pending; reject the stale approval and invalidate account-dependent checks. Retain unaffected evidence and both versions. Value: Ensures the approved record is exactly the one that was verified.',boldlead='Response:')

page(); h('Acceptance and delivery plan')
table(['Scenario','Observable acceptance result'],[
('Happy path','Approved against the current version; evidence and confirmation visible in the case.'),
('E1 Ownership restriction','Direct name check passes; ownership check raises a hold; activation stays disabled pending compliance disposition.'),
('E2 Certificate coverage','Authenticity can pass while applicability remains open. Correct site evidence resolves only that issue.'),
('E3 Factoring payee','No auto-rejection or automatic payment change. Finance can approve a verified arrangement with its scope retained.'),
('E4 Concurrent correction','Approval from version 1 cannot approve version 2. Late results attach only to the version and fields checked.'),
('Shared resilience checks','Unreadable evidence and provider outages stay Pending with a next action. Retrying the same submission creates no duplicate case.')],[1.38,5.44])
h('One week implementation and demonstration',2)
p('Day 1: Confirm policy assumptions and prepare the five input packages. Days 2 and 3: Complete the happy path, persisted case record, live run and history. Days 4 and 5: Add the four exception journeys and tracked follow-up. Day 6: Exercise acceptance results, recovery and reviewer permissions. Day 7: Deliver the runnable link and a video of no more than five minutes.')
p('Demo sequence: Run the happy path, then reveal the hidden ownership chain and resulting hold. Keep the other three prepared cases available for the live interview. Label fixtures and simulated verification responses clearly; the workflow itself must execute on uploaded inputs.')
h('Policy assumptions and limits',2)
p('The buyer approves jurisdiction-specific rules, evidence standards and reviewer roles before implementation. Country of incorporation, product origin and ownership are separate facts. Product-specific restrictions, export controls and customer-contract bans need separate policy configuration and remain outside this pilot. Negative reviews can prompt investigation but do not prove a legal prohibition. A shared address or new company registration alone does not establish a front company.')
h('Basis and references',2)
p('[1] AI Solutions Associate case study, PS 2 and submission guidance, supplied candidate PDF, pages 2, 4 and 6. External guidance supports the control concepts; Harbor policy and proposed acceptance targets are product assumptions. Sources reviewed 10 November 2026.').runs[0].font.size=Pt(9)
link('[2] OFAC FAQ 401  Indirect ownership and cascading examples','https://ofac.treasury.gov/faqs/401')
link('[3] IAF CertSearch  Certificate status scope and certified locations','https://support.iafcertsearch.org/iaf-certsearch-faq/iaf-certsearch-faq/general')
link('[4] HMRC VAT Finance Manual  Factoring and debt assignment','https://www.gov.uk/hmrc-internal-manuals/vat-finance-manual/vatfin3220')
link('[5] Oracle Procurement  Supplier profile change approvals','https://docs.oracle.com/en/cloud/saas/procurement/26b/oapro/how-you-configure-internal-changes-on-supplier-profile-approvals.html')
doc.save(OUT/'Vendor_Onboarding_Product_Proposal.docx')
print(OUT/'Vendor_Onboarding_Product_Proposal.docx')
