"""Browser regression: blurred backdrop, stable brightness fill, queued HA ACKs.

Run from repository root:
    python -m playwright install chromium webkit
    python tests/test_popup_stability.py
"""
from __future__ import annotations

import contextlib
import http.server
import os
import re
from pathlib import Path
import threading
import time
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / 'custom_components' / 'vega_home' / 'frontend'
BROWSERS = tuple(os.getenv('VEGA_TEST_BROWSERS', 'chromium,webkit').split(','))
OFFLINE = os.getenv('VEGA_TEST_OFFLINE') == '1'

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.split('?')[0].startswith('/vega_home_static/'):
            return str(FRONT / path.split('?')[0].removeprefix('/vega_home_static/'))
        return str(ROOT / path.split('?')[0].lstrip('/'))
    def log_message(self, *args):
        pass

class BrowserPopupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/tests/popup_fixture.html'
        cls.pw = sync_playwright().start()
        cls.engines={}
        for name in BROWSERS:
            if not name: continue
            browser_type = getattr(cls.pw,name)
            executable_path = os.getenv('VEGA_CHROMIUM_EXECUTABLE') if name=='chromium' else None
            cls.engines[name] = browser_type.launch(headless=True,
                executable_path=executable_path or None,
                args=['--no-sandbox'] if name=='chromium' else [])
    @classmethod
    def tearDownClass(cls):
        for b in cls.engines.values(): b.close()
        cls.pw.stop();cls.server.shutdown();cls.server.server_close()

    def fixture(self, browser_name, viewport=(390,844), touch=False):
        b=self.engines[browser_name]
        context=b.new_context(viewport={'width':viewport[0], 'height':viewport[1]},
                              has_touch=touch, is_mobile=touch)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda err: errors.append(str(err)))
        if OFFLINE:
            # Some restricted local sandboxes block all URL navigation.
            # Load the identical frontend JS and CSS into about:blank instead.
            fixture = (ROOT / 'tests/popup_fixture.html').read_text()
            html = fixture.split('<script type="module">')[0] + '</body></html>'
            page.set_content(html)
            scripts = []
            for name in ('vega-device-model.js', 'vega-surface.js', 'vega-popup.js'):
                source = (FRONT / name).read_text()
                source = re.sub(r'^import .*?;\s*$', '', source, flags=re.MULTILINE)
                source = re.sub(r'\bexport\s+(?=(?:function|const|class|async))', '', source)
                scripts.append(source)
            app = fixture.split('<script type="module">')[1].split('</script>')[0]
            app = re.sub(r'^import .*?;\s*$', '', app, flags=re.MULTILINE)
            page.evaluate('(source) => (new Function(source))()', '\n'.join([*scripts, app]))
            page.evaluate('''(styles) => {
              const root = document.querySelector('#host').shadowRoot;
              for (const css of styles) {
                const el = document.createElement('style'); el.textContent = css;
                root.append(el);
              }
            }''', [(FRONT / 'vega-v41.css').read_text(), (FRONT / 'vega-popup.css').read_text()])
        else:
            page.goto(self.url,wait_until='networkidle')
        page.wait_for_function('Boolean(window.vegaFixture?.popup)')
        return context,page,errors

    def test_dimmer_blur_and_fill_are_stable(self):
        for engine in self.engines:
            for light in ('light','color'):
                with self.subTest(engine=engine, light=light):
                    ctx,page,errors=self.fixture(engine)
                    try:
                        page.evaluate('(light)=>vegaFixture.open(light)',light)
                        page.wait_for_timeout(300)
                        b=page.evaluate('vegaFixture.backdrop()')
                        self.assertIn('blur(',b['blur'] or b['webKit'])
                        self.assertNotEqual('none',b['blur'])
                        self.assertEqual('',b['mode'])
                        overlay=page.locator('div#host').evaluate_handle('el=>el.shadowRoot.querySelector(".vega-modal-backdrop")')
                        background=[]
                        for v in (10,25,40,55,70,85,100):
                            page.evaluate('v=>vegaFixture.drag(v)',v)
                            page.wait_for_timeout(60)
                            # screenshot only an area away from the slider/dialog
                            background.append(page.screenshot(clip={'x':0,'y':0,'width':90,'height':90}))
                            self.assertAlmostEqual(page.evaluate('vegaFixture.value()'),v,delta=1)
                            self.assertTrue(page.evaluate('vegaFixture.fill().startsWith("matrix")'))
                        self.assertTrue(all(s==background[0] for s in background), 'The dimmer changed the background pixels')
                        self.assertFalse(errors,errors)
                    finally: ctx.close()

    def test_two_drags_while_first_service_is_pending(self):
        for engine in self.engines:
            with self.subTest(engine=engine):
                ctx,page,errors=self.fixture(engine,touch=True)
                try:
                    page.evaluate('vegaFixture.open("light")')
                    page.wait_for_timeout(290)
                    page.evaluate('vegaFixture.data.delay=true')
                    page.evaluate('vegaFixture.drag(30,1)')
                    page.wait_for_function('vegaFixture.data.calls.length === 1')
                    page.evaluate('vegaFixture.drag(81,2)')
                    self.assertEqual(1,page.evaluate('vegaFixture.data.calls.length'))
                    self.assertAlmostEqual(81,page.evaluate('vegaFixture.value()'),delta=1)
                    # Old HA event and ACK must never move the fill back to 30%.
                    page.evaluate('vegaFixture.push("light.dimmer",30)')
                    self.assertAlmostEqual(81,page.evaluate('vegaFixture.value()'),delta=1)
                    page.wait_for_timeout(100)
                    page.evaluate('vegaFixture.resolve()')
                    page.wait_for_function('vegaFixture.data.calls.length===2')
                    self.assertEqual(81,page.evaluate('vegaFixture.data.calls[1].payload.brightness_pct'))
                    page.evaluate('vegaFixture.push("light.dimmer",30)')
                    self.assertAlmostEqual(81,page.evaluate('vegaFixture.value()'),delta=1)
                    page.evaluate('vegaFixture.resolve()')
                    page.evaluate('vegaFixture.push("light.dimmer",81)')
                    page.wait_for_timeout(80)
                    self.assertAlmostEqual(81,page.evaluate('vegaFixture.value()'),delta=1)
                    self.assertFalse(errors,errors)
                finally:ctx.close()

    def test_other_popup_backdrop_stays_glass(self):
        for engine in self.engines:
            for popup in ('switch','climate'):
                with self.subTest(engine=engine,popup=popup):
                    ctx,page,errors=self.fixture(engine)
                    try:
                        page.evaluate('p=>vegaFixture.open(p)',popup)
                        page.wait_for_timeout(270)
                        state=page.evaluate('vegaFixture.backdrop()')
                        self.assertIn('blur(',state['blur'] or state['webKit'])
                        self.assertFalse(errors,errors)
                    finally:ctx.close()

    def test_backdrop_owner_handoff_and_unmount(self):
        """Camera, speaker and settings handoffs must not create extra backdrops."""
        for engine in self.engines:
            with self.subTest(engine=engine):
                ctx,page,errors=self.fixture(engine)
                try:
                    page.evaluate('vegaFixture.open("light")')
                    page.wait_for_timeout(260)
                    identity=page.evaluate('''() => {
                      const root=vegaFixture.root;
                      const backdrop=root.querySelector('.vega-modal-backdrop');
                      window._vegaTestBackdrop=backdrop;
                      return root.querySelectorAll('.vega-modal-backdrop').length;
                    }''')
                    self.assertEqual(1,identity)
                    for popup in ('camera','speaker','settings'):
                        page.evaluate('(name) => vegaFixture.panel._surface.open(name,18)',popup)
                        state=page.evaluate('''() => ({
                          same: vegaFixture.root.querySelector('.vega-modal-backdrop') === window._vegaTestBackdrop,
                          count: vegaFixture.root.querySelectorAll('.vega-modal-backdrop').length,
                          filter: getComputedStyle(window._vegaTestBackdrop).backdropFilter,
                          visible: !window._vegaTestBackdrop.hidden,
                        })''')
                        self.assertTrue(state['same'],popup)
                        self.assertEqual(1,state['count'],popup)
                        self.assertIn('blur(',state['filter'],popup)
                        self.assertTrue(state['visible'],popup)
                    for popup in ('settings','speaker','camera'):
                        page.evaluate('(name) => vegaFixture.panel._surface.close(name)',popup)
                    self.assertTrue(page.evaluate('!window._vegaTestBackdrop.hidden'))
                    page.evaluate('vegaFixture.popup.close()')
                    page.wait_for_timeout(300)
                    self.assertTrue(page.evaluate('window._vegaTestBackdrop.hidden'))
                    self.assertFalse(errors,errors)
                finally:ctx.close()

    def test_dimmer_power_button_is_separate_from_slider(self):
        for engine in self.engines:
            with self.subTest(engine=engine):
                ctx,page,errors=self.fixture(engine)
                try:
                    page.evaluate('vegaFixture.open("light")')
                    page.wait_for_timeout(270)
                    coords=page.evaluate('''() => {
                      const root=vegaFixture.root;
                      const slider=root.querySelector('.ap-brightness-shell').getBoundingClientRect();
                      const power=root.querySelector('.ap-dimmer-power').getBoundingClientRect();
                      return {sliderBottom:slider.bottom,powerTop:power.top,powerHeight:power.height};
                    }''')
                    self.assertGreater(coords['powerTop']-coords['sliderBottom'],3)
                    self.assertGreater(coords['powerHeight'],40)
                    self.assertFalse(errors,errors)
                finally:ctx.close()

    def test_delayed_ack_longer_than_preview_timeout(self):
        """A delayed first ACK must not reset an in-flight brightness intent."""
        for engine in self.engines:
            with self.subTest(engine=engine):
                ctx,page,errors=self.fixture(engine,touch=True)
                try:
                    page.evaluate('vegaFixture.open("light")')
                    page.wait_for_timeout(270)
                    page.evaluate('vegaFixture.data.delay=true')
                    page.evaluate('vegaFixture.drag(27)')
                    page.wait_for_function('vegaFixture.data.calls.length===1')
                    page.wait_for_timeout(3850)
                    page.evaluate('vegaFixture.push("light.dimmer",10)')
                    self.assertAlmostEqual(27,page.evaluate('vegaFixture.value()'),delta=1)
                    self.assertFalse(errors,errors)
                finally:ctx.close()

    def test_rejected_old_command_does_not_discard_latest_drag(self):
        for engine in self.engines:
            with self.subTest(engine=engine):
                ctx,page,errors=self.fixture(engine,touch=True)
                try:
                    page.evaluate('vegaFixture.open("light")')
                    page.wait_for_timeout(275)
                    page.evaluate('vegaFixture.data.delay=true')
                    page.evaluate('vegaFixture.drag(24)')
                    page.wait_for_function('vegaFixture.data.calls.length===1')
                    page.evaluate('vegaFixture.drag(78)')
                    page.evaluate('vegaFixture.reject()')
                    page.wait_for_function('vegaFixture.data.calls.length===2')
                    self.assertEqual(78,page.evaluate('vegaFixture.data.calls[1].payload.brightness_pct'))
                    self.assertAlmostEqual(78,page.evaluate('vegaFixture.value()'),delta=1)
                    page.evaluate('vegaFixture.resolve()')
                    page.evaluate('vegaFixture.push("light.dimmer",78)')
                    self.assertAlmostEqual(78,page.evaluate('vegaFixture.value()'),delta=1)
                    self.assertFalse(errors,errors)
                finally:ctx.close()

    def test_keyboard_brightness_remains_accessible(self):
        for engine in self.engines:
            with self.subTest(engine=engine):
                ctx,page,errors=self.fixture(engine)
                try:
                    page.evaluate('vegaFixture.open("light")')
                    page.wait_for_timeout(280)
                    page.evaluate('''() => {
                      const input=vegaFixture.root.querySelector('input[data-range="brightness"]');
                      input.focus();
                    }''')
                    before=page.evaluate('vegaFixture.value()')
                    page.keyboard.press('ArrowUp')
                    page.wait_for_timeout(50)
                    after=page.evaluate('vegaFixture.value()')
                    self.assertGreater(after,before)
                    self.assertTrue(page.evaluate('vegaFixture.data.calls.some(c=>c.domain==="light")'))
                    self.assertFalse(errors,errors)
                finally:ctx.close()

    def test_touch_drag_does_not_scroll_viewport(self):
        """A browser-generated touch gesture should move the dimmer, not the page."""
        if 'chromium' not in self.engines:
            self.skipTest('Chromium CDP touch injection only')
        ctx,page,errors=self.fixture('chromium',touch=True)
        try:
            page.evaluate('vegaFixture.open("light")')
            page.wait_for_timeout(275)
            rect=page.evaluate('''() => {
              const r=vegaFixture.root.querySelector('.ap-brightness-shell').getBoundingClientRect();
              return {left:r.left,top:r.top,width:r.width,height:r.height};
            }''')
            x=rect['left']+rect['width']/2
            high=rect['top']+rect['height']*.18
            low=rect['top']+rect['height']*.75
            cdp=ctx.new_cdp_session(page)
            for kind,y in (('touchStart',low),('touchMove',high),('touchEnd',high)):
                cdp.send('Input.dispatchTouchEvent',{
                    'type':kind,
                    'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y,'id':5}],
                })
                page.wait_for_timeout(25)
            page.wait_for_function('vegaFixture.data.calls.length===1')
            self.assertGreater(page.evaluate('vegaFixture.value()'),75)
            self.assertEqual(0,page.evaluate('window.scrollY'))
            self.assertFalse(errors,errors)
        finally:ctx.close()

    def test_popup_fits_phone_and_wall_display(self):
        for engine in self.engines:
            for viewport in ((390,844),(800,480)):
                for light in ('light','color'):
                    with self.subTest(engine=engine,viewport=viewport,light=light):
                        ctx,page,errors=self.fixture(engine,viewport=viewport)
                        try:
                            page.evaluate('(kind) => vegaFixture.open(kind)',light)
                            page.wait_for_timeout(275)
                            rect=page.evaluate('''() => {
                              const r=vegaFixture.root.querySelector('.ap-dialog').getBoundingClientRect();
                              return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
                            }''')
                            self.assertGreaterEqual(rect['left'],-1)
                            self.assertLessEqual(rect['right'],viewport[0]+1)
                            self.assertGreaterEqual(rect['top'],-1)
                            self.assertLessEqual(rect['bottom'],viewport[1]+1)
                            self.assertFalse(errors,errors)
                        finally:ctx.close()

if __name__=='__main__':
    unittest.main(verbosity=2)
