import time, json
from playwright.sync_api import sync_playwright
S='/tmp/shots/'
with sync_playwright() as p:
    ui_browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/tmp/audio/narracao.wav','--autoplay-policy=no-user-gesture-required'])
    ctx = ui_browser.new_context(viewport={'width':1440,'height':900}, permissions=['microphone'])
    pg = ctx.new_page()
    logs=[]; pg.on('pageerror', lambda e: logs.append(f'PAGEERROR {e}')); pg.on('console', lambda m: logs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:5174/'); time.sleep(2)
    pg.get_by_role('button', name='Nova conversa').first.click(); time.sleep(1)
    pg.get_by_role('button', name='Ensinar pelo navegador').first.click(); time.sleep(0.5)
    pg.get_by_placeholder('https://portal.interno/login').fill('http://127.0.0.1:4310/login')
    pg.screenshot(path=S+'20-iniciar.png')
    pg.get_by_role('button', name='Começar a gravar').click()
    pg.wait_for_selector('section.demo-panel', timeout=60000)
    t0=time.time()
    # The developer, in the Vigia's Chrome:
    cdp = p.chromium.connect_over_cdp('http://127.0.0.1:9333')
    page = None
    for _ in range(30):
        pages=[pp for c in cdp.contexts for pp in c.pages if '4310' in pp.url]
        if pages: page=pages[0]; break
        time.sleep(0.5)
    assert page, 'portal page not found'
    page.wait_for_load_state(); time.sleep(5)
    page.get_by_label('Usuário').fill('arthur'); time.sleep(1)
    page.get_by_label('Senha').fill('s3nh@-Portal!'); time.sleep(1)
    page.get_by_role('button', name='Entrar').click(); time.sleep(6)
    page.get_by_role('link', name='novo-front').click(); time.sleep(4)
    page.get_by_role('tab', name='Configuração').click(); time.sleep(4)
    pg.screenshot(path=S+'21-gravando.png')
    page.get_by_label('Versão').fill('2.4.0'); time.sleep(1)
    page.get_by_role('button', name='Salvar').click()
    while time.time()-t0 < 40: time.sleep(1)
    pg.screenshot(path=S+'22-gravando-fim.png')
    pg.get_by_role('button', name='Terminar e aprender').click()
    pg.wait_for_selector('section.approval', timeout=60000); time.sleep(2)
    pg.screenshot(path=S+'23-aprender.png')
    pg.get_by_role('button', name='Ver linha do tempo').first.click(); time.sleep(0.5)
    pg.screenshot(path=S+'24-linha-do-tempo.png', full_page=True)
    pg.get_by_role('button', name='Aprovar').first.click(); time.sleep(4)
    pg.fill('#composer', 'O deploy do MFE novo-front terminou em dev, atualiza a versão para 2.5.0')
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.stepper.is-done', timeout=60000); time.sleep(2)
    pg.screenshot(path=S+'25-executou.png')
    print('\n'.join(logs[-10:]))
    ui_browser.close()
