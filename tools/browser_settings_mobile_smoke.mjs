import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[390, 667], [320, 568]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:8799/');
    await page.locator('#settingsBtnTop').click();
    const result = await page.evaluate(() => {
      const dialog = document.querySelector('#setupDialog');
      const body = dialog.querySelector('.dlg-body');
      const ids = ['exportChatsBtn', 'importChatsBtn', 'deleteChatsBtn', 'factoryResetBtn'];
      const rect = dialog.getBoundingClientRect();
      return {
        open: dialog.open,
        unsupportedWebGpuDisabled: document.querySelector('#computePref').value === 'wasm' && document.querySelector('#computePref option[value="webgpu"]').disabled,
        dialogFits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        actionsVisible: ids.every(id => {
          const r = document.getElementById(id).getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= rect.top && r.bottom <= rect.bottom;
        }),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        bodyScrollable: body.scrollHeight > body.clientHeight,
      };
    });
    console.log(JSON.stringify({ width, height, ...result }));
    if (!result.open || !result.unsupportedWebGpuDisabled || !result.dialogFits || !result.actionsVisible || !result.noHorizontalOverflow || !result.bodyScrollable) process.exitCode = 1;
    await page.close();
  }
} finally {
  await browser.close();
}
