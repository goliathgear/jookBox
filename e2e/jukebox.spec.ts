import { expect, test, type Page } from '@playwright/test';

// Links point at example.test; answer them locally so popups load.
test.beforeEach(async ({ context }) => {
  await context.route(/example\.test/, (route) => route.fulfill({ body: 'selected' }));
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('ticker')).toContainText('Pull a page across', { ignoreCase: true });
  return errors;
}

test('renders the wallbox without errors', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle('Test Jukebox');
  await expect(page.getByTestId('ticker')).toContainText('A·B');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('arrow keys turn the pages and wrap around', async ({ page }) => {
  await open(page);
  const ticker = page.getByTestId('ticker');
  // Five page sides: A-B, C-D, E (Media, Infra, Network, Home, Docs).
  await page.keyboard.press('ArrowRight');
  await expect(ticker).toHaveAttribute('data-view', '1');
  await expect(ticker).toContainText('C·D');
  await page.keyboard.press('ArrowRight');
  await expect(ticker).toHaveAttribute('data-view', '2');
  await page.keyboard.press('ArrowRight');
  await expect(ticker).toHaveAttribute('data-view', '0');
  await page.keyboard.press('ArrowLeft');
  await expect(ticker).toHaveAttribute('data-view', '2');
});

test('pulling a page across turns it; a short tug springs back', async ({ page }) => {
  await open(page);
  const ticker = page.getByTestId('ticker');
  // The right-hand page sits just right of centre at this viewport size.
  const drag = async (from: number, to: number) => {
    await page.mouse.move(from, 400);
    await page.mouse.down();
    await page.mouse.move(to, 400, { steps: 20 });
    await page.mouse.up();
  };
  await drag(800, 790);
  await page.waitForTimeout(600);
  await expect(ticker).toHaveAttribute('data-view', '0');
  await drag(800, 560);
  await expect(ticker).toHaveAttribute('data-view', '1');
});

test('a sideways trackpad swipe turns the page and never navigates back', async ({ page }) => {
  await open(page);
  const ticker = page.getByTestId('ticker');
  await expect(ticker).toHaveAttribute('data-view', '0');
  // The page must claim the wheel event: an unclaimed sideways swipe is the
  // browser's back/forward gesture (Firefox on a Mac takes it).
  const claimed = await page.evaluate(() => {
    const e = new WheelEvent('wheel', { deltaX: 120, bubbles: true, cancelable: true });
    document.querySelector('canvas')!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(claimed).toBe(true);
  await expect(ticker).toHaveAttribute('data-view', '1');
  const overscroll = await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorX);
  expect(overscroll).toBe('none');
});

test('the effects button turns post-processing off and remembers it', async ({ page }) => {
  const errors = await open(page);
  const on = page.getByRole('button', { name: 'Visual effects off (faster)' });
  await expect(on).toHaveAttribute('aria-pressed', 'true');
  await on.click();
  const off = page.getByRole('button', { name: 'Visual effects on' });
  await expect(off).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('jookbox:effects'))).toBe('false');
  // Still off after a reload, and the scene still draws.
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visual effects on' })).toHaveAttribute('aria-pressed', 'false');
  // ?fx=on wins for one visit without changing what's remembered.
  await page.goto('/?fx=on');
  await expect(page.getByRole('button', { name: 'Visual effects off (faster)' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('jookbox:effects'))).toBe('false');
  expect(errors).toEqual([]);
});

test('a letter then a number opens the selection in a new tab', async ({ page, context }) => {
  await open(page);
  await page.keyboard.press('c');
  await expect(page.getByTestId('ticker')).toContainText('Page C selected');
  await expect(page.getByTestId('ticker')).toHaveAttribute('data-view', '1');
  const popup = context.waitForEvent('page');
  await page.keyboard.press('1');
  expect((await popup).url()).toBe('https://router.example.test/');
  await expect(page.getByTestId('ticker')).toContainText('Now playing: Router');
});

test('an unknown selection is rejected', async ({ page }) => {
  await open(page);
  await page.keyboard.press('a');
  await page.keyboard.press('9');
  await expect(page.getByTestId('ticker')).toContainText('No such selection');
});

test('list view shows every selection as a link', async ({ page, context }) => {
  await open(page);
  await page.getByRole('button', { name: 'List view' }).click();
  const list = page.getByRole('dialog', { name: 'Test Jukebox selections' });
  const links = list.getByRole('link');
  await expect(links).toHaveCount(6);
  await expect(links.first()).toHaveAttribute('href', 'https://jellyfin.example.test/');
  await expect(links.first()).toHaveAttribute('target', '_blank');
  await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
  const popup = context.waitForEvent('page');
  await list.getByRole('link', { name: /Proxmox/ }).click();
  expect((await popup).url()).toBe('https://pve.example.test:8006/');
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
});

test('screen readers get a full link index', async ({ page }) => {
  await open(page);
  const index = page.getByRole('navigation', { name: 'All selections' });
  await expect(index.getByRole('link')).toHaveText([
    'A1 Jellyfin — Movies and TV',
    'A2 Sonarr — TV downloads',
    'B1 Proxmox — Hypervisor',
    'C1 Router — Firewall',
    'D1 Home Assistant — Automations',
    'E1 Homepage',
  ]);
});
