"""Verify public free access, exclusive names and closing the trial in a real browser."""
import json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/public-free-trial-oct27'
PORT=38888
BASE=f'http://127.0.0.1:{PORT}'
SOURCE=(ROOT/'public/client.js').read_text(encoding='utf-8')+'\nwindow.__trialCollection=collection;\n'

def start_server(file,free):
    script="const c=require('./server/collection.cjs'),create=c.createCollection;c.createCollection=()=>create({file:"+json.dumps(str(file))+",freeTrial:"+str(free).lower()+"});require('./server/index.js');"
    process=subprocess.Popen(['node','-e',script],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'NODE_ENV':'production'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for _ in range(80):
        if process.poll() is not None:raise RuntimeError('Fixture server exited before listening')
        try:urllib.request.urlopen(BASE+'/health',timeout=1).close();return process
        except OSError:time.sleep(.1)
    stop_server(process)
    raise RuntimeError('Fixture server did not start')

def stop_server(process):
    process.terminate()
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait()

def ready(page,reload=False):
    if reload:page.reload(wait_until='domcontentloaded')
    else:page.goto(BASE,wait_until='domcontentloaded')
    page.wait_for_function('Boolean(window.__trialCollection?.getProfile())&&!document.body.classList.contains("booting")')

report={'isolatedCollection':True,'productionMode':True,'forwardedPublicRequests':True}
OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='vintage-public-trial-browser-') as temp:
    file=Path(temp)/'profiles.json'
    server=start_server(file,True)
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
            try:
                context=browser.new_context(viewport={'width':1440,'height':1000},extra_http_headers={'X-Forwarded-For':'203.0.113.25'})
                context.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=SOURCE))
                page=context.new_page();errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                ready(page)
                assert page.evaluate('__trialCollection.getProfile().freeTrial')
                page.locator('#title-shop-btn').click()
                page.wait_for_function('document.querySelectorAll(".insignia-card").length===20')
                labels=page.locator('.insignia-card > span').all_text_contents()
                assert len(labels)==20 and all(label=='FREE TO TRY' for label in labels),labels
                for title in ['yt','vip','goat']:
                    page.locator('[data-title="'+title+'"]').click()
                    assert page.locator('#title-equip').inner_text()=='TRY FOR FREE'
                    page.locator('#title-equip').click()
                    page.wait_for_function('(id)=>__trialCollection.activeTitle()===id',arg=title)
                    assert page.evaluate('__trialCollection.getProfile().coins')==0
                    assert page.evaluate('__trialCollection.getProfile().ownedTitles')==[]
                page.screenshot(path=str(OUT/'free-titles.png'))
                page.locator('#skins-done').click();page.locator('#reserved-names-btn').click()
                assert 'FREE TRIAL' in page.locator('#reserve-name-submit').inner_text()
                page.locator('#reserved-name-input').fill('Public Free Pilot')
                page.locator('#reserved-name-mode').select_option('animated')
                page.locator('#reserve-name-submit').click()
                page.wait_for_function('__trialCollection.activeIdentity()?.name==="Public Free Pilot"')
                p=page.evaluate('__trialCollection.getProfile()')
                assert p['coins']==0 and p['freeRenames']==1 and p['names'][0]['trial']
                assert p['activeIdentity']['nameStyle']['mode']=='animated'
                page.screenshot(path=str(OUT/'free-names.png'))
                ready(page,reload=True)
                assert page.evaluate('__trialCollection.activeTitle()')=='goat'
                assert page.evaluate('__trialCollection.activeIdentity().name')=='Public Free Pilot'
                other=browser.new_context(extra_http_headers={'X-Forwarded-For':'203.0.113.26'})
                other.request.get(BASE+'/collection/profile')
                duplicate=other.request.post(BASE+'/collection/reserve',data={'name':'Public Free Pilot'})
                assert duplicate.status==409
                other.close()
                stop_server(server);server=None
                server=start_server(file,False)
                ready(page,reload=True)
                p=page.evaluate('__trialCollection.getProfile()')
                assert p['freeTrial'] is False and p['namePrice']==15000
                assert p['activeIdentity'] is None and p['activeTitle']=='' and p['names']==[] and p['coins']==0
                page.locator('#title-shop-btn').click();page.wait_for_selector('.insignia-card')
                for title,price in [('vip','75,000'),('goat','100,000')]:
                    page.locator('[data-title="'+title+'"]').click()
                    assert price in page.locator('#title-equip').inner_text()
                page.locator('[data-title="yt"]').click()
                assert page.locator('#title-equip').is_disabled()
                assert page.locator('#title-equip').inner_text()=='NOT ON SALE'
                page.screenshot(path=str(OUT/'paid-titles-restored.png'))
                page.locator('#skins-done').click();page.locator('#reserved-names-btn').click()
                assert '15,000 COINS' in page.locator('#reserve-name-submit').inner_text()
                assert page.locator('.reserved-name-card').count()==0
                page.screenshot(path=str(OUT/'paid-names-restored.png'))
                for endpoint,data in [('title-preview',{'id':'goat'}),('name-preview',{'name':'Bypass'})]:
                    response=context.request.post(BASE+'/collection/'+endpoint,data={**data,'freeTrial':True})
                    assert response.status==403
                assert not errors,errors
                report.update({'allTwentyTitlesFree':True,'vipGoatYtUsable':True,'animatedNameFree':True,'exclusiveNames':True,'reloadPersists':True,'zeroCoinCharge':True,'noPaidTitleGrant':True,'closingRevokesTrial':True,'paidPricesRestored':True,'localhostBypassBlocked':True,'pageErrors':errors,'passed':True})
                context.close()
            finally:browser.close()
    finally:
        if server:stop_server(server)
(OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
