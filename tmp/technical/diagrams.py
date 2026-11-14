from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
W=Path('tmp/technical')
F='/System/Library/Fonts/Supplemental/Arial.ttf'
B='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(n=23,b=False):return ImageFont.truetype(B if b else F,n)
def label(d,xy,text,size=23,b=False,anchor='mm',fill='#182c40'):
 d.multiline_text(xy,text,font=font(size,b),anchor=anchor,align='center',fill=fill,spacing=6)
def box(d,xy,text,size=24):
 d.rounded_rectangle(xy,radius=10,fill='#eef3f7',outline='#657e94',width=2)
 label(d,((xy[0]+xy[2])/2,(xy[1]+xy[3])/2),text,size,True)
def arrow(d,a,b,text='',size=22):
 import math
 d.line([a,b],fill='#34536e',width=3);v=math.atan2(b[1]-a[1],b[0]-a[0]);l=14
 d.polygon([b,(b[0]-l*math.cos(v-.45),b[1]-l*math.sin(v-.45)),(b[0]-l*math.cos(v+.45),b[1]-l*math.sin(v+.45))],fill='#34536e')
 if text:
  x=(a[0]+b[0])/2;y=(a[1]+b[1])/2-17
  bb=d.textbbox((x,y),text,font=font(size),anchor='mm');d.rectangle((bb[0]-6,bb[1]-4,bb[2]+6,bb[3]+4),fill='white');label(d,(x,y),text,size)
def seq(name,actors,steps):
 width=1900; height=220+len(steps)*93; im=Image.new('RGB',(width,height),'white');d=ImageDraw.Draw(im)
 xs=[155+i*(width-310)/(len(actors)-1) for i in range(len(actors))]
 for x,a in zip(xs,actors):
  box(d,(x-145,20,x+145,115),a,24)
  for y in range(120,height-35,18): d.line([(x,y),(x,y+9)],fill='#aab9c7',width=2)
 for i,(a,b,t) in enumerate(steps):
  y=180+i*93
  if a==b:
   d.rectangle((40,y-32,width-40,y+27),fill='#f1f4f7');label(d,(width/2,y-2),t,24,True)
  else:arrow(d,(xs[a],y),(xs[b],y),t,23)
 im.save(W/name)
seq('invite.png',['Buyer or\nsupplier','Next.js\nauth and tRPC','PostgreSQL','Queue and\nemail worker','Email and\nidentity provider'],[
 (0,4,'1  Buyer signs in with Google OIDC'),(4,1,'2  Valid callback; Better Auth creates session'),(1,2,'3  Require active buyer membership'),(0,1,'4  cases.create with idempotency key'),(1,2,'5  TX case + draft 1 + invite + work + outbox + audit'),(2,1,'6  COMMIT then return INVITED'),(2,3,'7  Dispatcher publishes notification work ID'),(3,4,'8  Send invitation; persist delivery outcome'),(0,1,'9  Supplier opens link; GET does not redeem'),(0,1,'10  Supplier verifies email OTP through Better Auth'),(0,1,'11  invitations.redeem via authenticated POST'),(1,2,'12  TX token + email + expiry check; grant CaseAccess'),(1,0,'13  Supplier sees case draft and requirements')])
seq('submit.png',['Supplier or\nreviewer','Next.js\ntRPC','PostgreSQL','Private GCS','Worker and\nextractor'],[
 (0,1,'1  Reserve document on current editable draft'),(1,2,'2  TX Document RESERVED with server generated key'),(1,0,'3  Return short lived upload capability'),(0,3,'4  Upload PDF to quarantine object'),(0,1,'5  Complete upload with document ID'),(1,3,'6  Read metadata and freeze object generation'),(1,2,'7  TX UPLOADED + scan work + outbox + audit'),(2,4,'8  Dispatcher enqueues ID; worker obtains lease'),(4,3,'9  Scan fixed generation; extract in separate job'),(4,2,'10  Fenced commits: scan status then extraction result'),(0,1,'11  Submit with expected draft and case revisions'),(1,2,'12  TX freeze submission + VERIFY work + outbox'),(4,2,'13  Wait for extraction; verify frozen version'),(4,2,'14  Set PENDING for reviewer; enqueue next steps'),(0,1,'15  Reviewer approves expected current version'),(1,2,'16  TX guards + Decision + Supplier + APPROVED'),(2,4,'17  Notification job sends decision and next steps')])
im=Image.new('RGB',(1900,1400),'white');d=ImageDraw.Draw(im)
box(d,(40,40,450,170),'Buyer and supplier\nweb browser')
box(d,(730,40,1150,170),'Google OIDC and\nemail provider')
box(d,(1380,40,1860,170),'Private GCS buckets\nquarantine and evidence')
box(d,(40,300,450,440),'HTTPS load balancer\nDNS and TLS')
d.rounded_rectangle((520,270,1860,1100),radius=12,outline='#657e94',width=3)
label(d,(1190,307),'Existing GKE cluster   application namespace',28,True)
box(d,(590,390,1050,530),'Next.js web pods\nUI and tRPC and auth')
box(d,(1250,390,1770,530),'Node worker pods\nscan extract verify notify')
box(d,(590,720,1050,860),'Outbox dispatcher\nand reconciler')
box(d,(1250,720,1770,860),'Optional Python extractor\ninternal authenticated API')
box(d,(40,1180,530,1350),'Cloud SQL PostgreSQL\nprivate IP plus auth proxy')
box(d,(700,1180,1190,1350),'Managed Redis\nBullMQ queue transport')
box(d,(1370,1180,1860,1350),'Secret Manager and KMS\nWorkload Identity')
arrow(d,(245,170),(245,300),'443')
arrow(d,(450,370),(590,450),'HTTPS')
arrow(d,(450,100),(1380,100),'Scoped upload 443',21)
arrow(d,(820,390),(940,170),'OIDC 443',21)
arrow(d,(1510,390),(1620,170),'Objects 443',21)
arrow(d,(1510,530),(1510,720),'Extraction',21)
arrow(d,(820,530),(820,720),'Same DB outbox',21)
arrow(d,(590,810),(285,1180),'DB 5432',21)
arrow(d,(820,860),(945,1180),'Redis TLS',21)
arrow(d,(1250,510),(1080,1180),'Redis TLS',21)
arrow(d,(700,530),(285,1180),'DB via proxy',21)
arrow(d,(1700,530),(1640,1180),'IAM tokens',21)
label(d,(1180,1000),'Private egress to database and queue   •   No public worker endpoints\nWorkers also use Cloud SQL through an auth proxy\nWorker provider calls use controlled HTTPS egress',25)
im.save(W/'network.png')

def ui(name,vendor=False):
 im=Image.new('RGB',(1700,1050),'white');d=ImageDraw.Draw(im)
 d.rectangle((0,0,1700,85),fill='#203b54');label(d,(850,42),'HARBOR BIOLABS     '+('SUPPLIER PORTAL' if vendor else 'PROCUREMENT WORKSPACE'),30,True,fill='white')
 if not vendor:
  label(d,(65,130),'Vendor onboarding',34,True,anchor='lm')
  for i,(a,b) in enumerate([('12','Open cases'),('3','Needs reviewer'),('2','Supplier action'),('4.2 d','Median completed time')]):
   x=65+410*i;box(d,(x,190,x+365,310),a+'\n'+b,25)
  label(d,(65,360),'Status [All]   Country [All]   Category [All]   Search [...]',25,anchor='lm')
  rows=[('VENDOR','STATUS','NEXT ACTION','AGE'),('Nova Calibration','Pending','Review complete evidence','2 d'),('Atlas Calibration','Pending','Supplier to upload site annex','5 d'),('Orion Instruments','Pending','Compliance review required','1 d')]
  for j,row in enumerate(rows):
   y=410+j*85;d.rectangle((65,y,1640,y+85),fill='#edf2f6' if j%2==0 else '#fafafa',outline='#d9d9d9');
   for x,t in zip([85,550,850,1510],row): label(d,(x,y+43),t,23,j==0,anchor='lm')
  label(d,(65,800),'Selected case    Nova Calibration    Submission 1    Policy US CAL 1',25,True,anchor='lm')
  label(d,(65,865),'Intake passed   Documents clean   Checks passed   Decision awaiting reviewer',25,anchor='lm')
  label(d,(65,930),'Evidence | Issues | History     [Request changes]   [Reject]   [Approve]',25,anchor='lm')
 else:
  label(d,(65,140),'Nova Calibration onboarding',34,True,anchor='lm')
  label(d,(65,215),'Draft saved    Submission 1    Last saved 14:32 UTC',25,anchor='lm')
  box(d,(65,280,460,875),'1  Company\n\n2  Tax details\n\n3  Bank account\n\n4  Ownership and scope\n\n5  Documents\n\n6  Review and submit',26)
  label(d,(535,320),'Company and payment information',29,True,anchor='lm')
  for y,t in [(395,'Legal name        Nova Calibration Inc.'),(475,'Registration      Delaware corporation ID'),(555,'Bank account      Saved ending 0192'),(635,'Certificate       CLEAN     Extraction complete')]:
   d.rectangle((530,y-30,1620,y+35),outline='#aab9c7',width=2);label(d,(555,y),t,25,anchor='lm')
  label(d,(535,745),'[ ] I confirm the information is accurate and authorized',23,anchor='lm')
  box(d,(1300,805,1620,875),'Submit for review',25)
  label(d,(65,950),'After submission: status + specific next steps + secure correction link',25,anchor='lm')
 im.save(W/name)
ui('buyer-ui.png');ui('vendor-ui.png',True)
