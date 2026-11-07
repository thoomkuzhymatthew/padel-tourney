import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Original, code-drawn artwork. No Padel Genie code, logos or image assets copied.
const fonts = [
  ['Inter','node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2','100 900'],
  ['Bricolage Grotesque','node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2','200 800'],
].map(([name,path,weight])=>`@font-face{font-family:'${name}';font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(path).toString('base64')})}`).join('')
const browser=await chromium.launch()
try {
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1})
  await page.setContent(`<!doctype html><html><head><style>${fonts}
    *{box-sizing:border-box}body{margin:0;background:#f5f6f3;color:#0a160f;font-family:Inter,sans-serif}.art{width:1200px;height:630px;padding:62px;display:grid;grid-template-columns:1.25fr 1fr;gap:54px;align-items:center}
    .brand{font-family:'Bricolage Grotesque';font-weight:800;font-size:31px;letter-spacing:-1px;margin-bottom:44px}.brand span{font-family:Inter;font-weight:500;font-size:18px;border-left:1px solid #0d3d2c;margin-left:18px;padding-left:18px;letter-spacing:0}
    h1{font-family:'Bricolage Grotesque';font-size:72px;letter-spacing:-3px;line-height:1.02;font-weight:700;margin:0 0 24px}h1 span{color:#0d3d2c}p{font-size:22px;line-height:1.5;margin:0;max-width:520px}.free{color:#a9542f;font-size:17px;font-weight:600;margin-top:30px}
    .court{background:#0d3d2c;border-radius:18px;height:420px;display:flex;align-items:center;justify-content:center;position:relative}.court svg{width:88%;height:auto}.caption{position:absolute;bottom:24px;color:#f5f6f3;font-size:16px;letter-spacing:.1px}
    </style></head><body><div class="art"><div><div class="brand">Padel Genie<span>Americano</span></div><h1>Your Americano.<br><span>Ready to play.</span></h1><p>Fair rotations. Live scores.<br>One shared link.</p><p class="free">Free to play. No accounts needed.</p></div><div class="court"><svg viewBox="0 0 400 280" fill="none"><g stroke="#f5f6f3" stroke-width="2"><rect x="25" y="35" width="350" height="195" rx="2"/><path d="M200 35v195M90 35v195M310 35v195M90 132.5h220"/><path d="M200 20v225" stroke-width="3"/></g><circle cx="130" cy="83" r="14" fill="#f5f6f3"/><circle cx="275" cy="182" r="14" fill="#f5f6f3"/><circle cx="130" cy="182" r="14" fill="#a9542f"/><circle cx="275" cy="83" r="14" fill="#a9542f"/><path d="m144 174 115-82" stroke="#f5f6f3" stroke-dasharray="6 9" stroke-width="2"/></svg><div class="caption">Different partners. Everyone in the game.</div></div></div></body></html>`)
  await page.evaluate(()=>document.fonts.ready)
  await page.screenshot({path:'public/social-preview.png'})
  const icon=readFileSync('public/favicon.svg','utf8')
  for(const [size,path] of [[32,'public/favicon-32.png'],[180,'public/apple-touch-icon.png']]){
    await page.setViewportSize({width:size,height:size})
    await page.setContent(`<style>body{margin:0;background:${size===180?'#0d3d2c':'transparent'}}svg{display:block;width:100vw;height:100vh}</style>${icon}`)
    await page.screenshot({path,omitBackground:size!==180})
  }
  console.log('Rendered social preview (1200×630), PNG favicon and Apple touch icon.')
} finally {await browser.close()}
