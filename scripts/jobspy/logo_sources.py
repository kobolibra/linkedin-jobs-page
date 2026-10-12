"""Verified logo sources shared by listing, detail and logo collection code."""
import re, unicodedata
from urllib.parse import urlsplit
from bs4 import BeautifulSoup

ALIASES={'jpmorganchase':'JPMorgan Chase','jpmorgan':'JPMorgan Chase','bnp':'BNP Paribas','bnpparibas':'BNP Paribas','societegenerale':'Societe Generale','dbs':'DBS Bank','dbsbank':'DBS Bank','deutschebank':'Deutsche Bank','goldmansachs':'Goldman Sachs','blackrock':'BlackRock','blackrockassetmanagement':'BlackRock'}

# Verified historical display names, scoped to logo identity only.
LOGO_IDENTITIES={'ateca':'ateca executive search','charterhouse partnership | asia':'charterhouse partnership','drake international singapore':'drake international – singapore','efg international':'efg private banking'}
LOGO_IDENTITIES.update({'mercer':('marsh','marsh people solutions'),'oaktree capital management, l.p.':'oaktree','orion james':'orion james limited','privee associates':'privee associates limited','verition fund management llc':'verition'})

def supported_names(expected):
    k=key(expected);aliases=LOGO_IDENTITIES.get(k,())
    return {k,*(aliases if isinstance(aliases,tuple) else (aliases,))}

def is_placeholder(img):
    if not img: return False
    url=img.get('data-delayed-url') or img.get('src','')
    ghost=img.get('data-ghost-url')
    return bool(url and ((ghost and url==ghost) or (urlsplit(url).hostname=='static.licdn.com' and '/aero-v1/sc/h/' in urlsplit(url).path)))

def key(name):
    raw=str(name or '').strip()
    folded=re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',raw).encode('ascii','ignore').decode().lower())
    raw=ALIASES.get(folded,raw)
    return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',raw).lower()).strip()

def linkedin_url(url):
    p=urlsplit(str(url)); return p.scheme=='https' and (p.hostname=='linkedin.com' or str(p.hostname).endswith('.linkedin.com'))

def image_url(url):
    p=urlsplit(str(url)); return p.scheme=='https' and (p.hostname=='media.licdn.com' or bool(re.fullmatch(r'media-exp\d+\.licdn\.com',p.hostname or '')))

def logo_image_url(url):
    p=urlsplit(str(url))
    return image_url(url) or (p.scheme=='https' and p.hostname=='static.licdn.com' and bool(re.fullmatch(r'/aero-v1/sc/h/[a-z0-9]+',p.path)))

def extract(html, expected):
    soup=BeautifulSoup(html,'html.parser')
    org=soup.select_one('a.topcard__org-name-link')
    observed=key(org.get_text(' ',strip=True)) if org else ''
    expected_key=key(expected)
    if not org or observed not in supported_names(expected): return None
    company_url=org.get('href','').split('?')[0]
    if not linkedin_url(company_url) or not re.match(r'^/(company|school|showcase)/[^/]+/?$',urlsplit(company_url).path): return None
    top=org.find_parent(class_='top-card-layout') or soup
    img=top.select_one('img.artdeco-entity-image')
    if not img: return None
    placeholder=is_placeholder(img)
    url=img.get('data-delayed-url') or img.get('src','')
    if placeholder:
        if not logo_image_url(url): return None
    elif not image_url(url) or not re.search(r'/(company-logo_|school-logo_|img-crop_)',urlsplit(url).path): return None
    return url,company_url,placeholder



def source_hint(soup, expected, link, observed_at):
    if isinstance(soup,str): soup=BeautifulSoup(soup,'html.parser')
    org=soup.select_one('a.topcard__org-name-link')
    if org:
        top=org.find_parent(class_='top-card-layout') or soup
        img=top.select_one('img.artdeco-entity-image')
    else:
        org=soup.select_one('h4.base-search-card__subtitle a')
        img=soup.select_one('img.artdeco-entity-image, img.job-search-card__logo')
    if not org or key(org.get_text(' ',strip=True)) not in supported_names(expected) or not img: return None
    source={'url':img.get('data-delayed-url') or img.get('src',''),'companyUrl':org.get('href','').split('?')[0],'employerName':org.get_text(' ',strip=True),'imageKind':'placeholder' if is_placeholder(img) else 'company','sourceJobId':job_id(link),'observedAt':observed_at}
    return source if validate_hint(source,expected,link) else None

def job_id(link):
    match=re.search(r'(\d+)(?:/)?$',urlsplit(str(link)).path)
    return match[1] if match else ''

def validate_hint(source,expected,link):
    if not isinstance(source,dict) or not linkedin_url(link): return False
    if not source.get('sourceJobId') or source['sourceJobId']!=job_id(link): return False
    if key(source.get('employerName')) not in supported_names(expected): return False
    company=source.get('companyUrl','')
    if not linkedin_url(company) or not re.fullmatch(r'/(company|school|showcase)/[^/]+/?',urlsplit(company).path): return False
    url=source.get('url','')
    if source.get('imageKind')=='placeholder': return logo_image_url(url)
    return source.get('imageKind')=='company' and image_url(url) and bool(re.search(r'/(company-logo_|school-logo_|img-crop_)',urlsplit(url).path))

