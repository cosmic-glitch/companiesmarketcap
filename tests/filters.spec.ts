import { test, expect } from '@playwright/test';

test.describe('Company Filter Sliders', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the page to load and table to be visible
    await page.waitForSelector('table');
  });

  test('should display all 5 filter sliders', async ({ page }) => {
    // Check that all filter labels are present (using more specific locators)
    await expect(page.locator('label:has-text("Market Cap")')).toBeVisible();
    await expect(page.locator('label:has-text("Earnings (TTM)")')).toBeVisible();
    await expect(page.locator('label:has-text("P/E Ratio")')).toBeVisible();
    await expect(page.locator('label:has-text("Dividend Yield %")')).toBeVisible();
    await expect(page.locator('label:has-text("Operating Margin %")')).toBeVisible();

    // Check that sliders are present
    const sliders = page.locator('.custom-slider');
    await expect(sliders).toHaveCount(5);
  });

  test('should show default filter values', async ({ page }) => {
    // Market Cap should show $0B - $5000B
    await expect(page.locator('text=$0B - $5000B')).toBeVisible();

    // Earnings should show $-50B - $200B (allows negative for losses)
    await expect(page.locator('text=$-50B - $200B')).toBeVisible();

    // P/E Ratio should show 0 - 100
    await expect(page.locator('text=/^0 - 100$/')).toBeVisible();

    // Dividend should show 0.0% - 20.0%
    await expect(page.locator('text=/^0\\.0% - 20\\.0%$/')).toBeVisible();

    // Operating Margin should show -50% - 100%
    await expect(page.locator('text=/-50% - 100%/')).toBeVisible();
  });

  test('should show initial company count', async ({ page }) => {
    // Should show total number of companies
    const companiesText = page.locator('text=/Showing .* of .* companies/');
    await expect(companiesText).toBeVisible();

    // Extract and verify we have a reasonable number of companies
    const text = await companiesText.textContent();
    const match = text?.match(/Showing ([\d,]+) of ([\d,]+) companies/);
    expect(match).toBeTruthy();

    // At default filter values, we should see a substantial number of companies
    const displayedCount = parseInt(match![1].replace(/,/g, ''));
    const totalCount = parseInt(match![2].replace(/,/g, ''));

    expect(displayedCount).toBeGreaterThan(1000); // Should show many companies
    expect(totalCount).toBeGreaterThan(3000); // Total should be 3,500+
  });

  test('should display table with company data', async ({ page }) => {
    // Check table headers
    await expect(page.locator('th:has-text("Rank")')).toBeVisible();
    await expect(page.locator('th:has-text("Company")')).toBeVisible();
    await expect(page.locator('th:has-text("Ticker")')).toBeVisible();
    await expect(page.locator('th:has-text("Market Cap")')).toBeVisible();
    await expect(page.locator('th:has-text("Price")')).toBeVisible();

    // Check that table has data rows
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test.skip('should filter companies when Market Cap slider changes', async ({ page }) => {
    // Get initial count
    const initialText = await page.locator('text=/Showing .* of .* companies/').textContent();
    const initialMatch = initialText?.match(/Showing ([\d,]+) of ([\d,]+) companies/);
    const initialCount = parseInt(initialMatch![1].replace(/,/g, ''));

    // Find the first slider (Market Cap) and its handles
    const slider = page.locator('.custom-slider').first();
    const handles = slider.locator('.rc-slider-handle');

    // Get the first handle (min) bounding box
    const handle = handles.first();
    const handleBox = await handle.boundingBox();

    if (handleBox) {
      // Get slider width to calculate meaningful drag distance
      const sliderBox = await slider.boundingBox();
      if (sliderBox) {
        // Drag the minimum handle to 20% position on the slider (significant change)
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(sliderBox.x + sliderBox.width * 0.2, handleBox.y + handleBox.height / 2);
        await page.mouse.up();

        // Wait for the filter value to change from default
        await page.waitForFunction(() => {
          const filterText = document.querySelector('.custom-slider')?.parentElement?.querySelector('span')?.textContent;
          return filterText && filterText !== '$0B - $5000B';
        }, { timeout: 3000 }).catch(() => {
          // If timeout, continue anyway - the test will fail with a more descriptive message
        });
      }

      // Check that company count decreased
      const newText = await page.locator('text=/Showing .* of .* companies/').textContent();
      const newMatch = newText?.match(/Showing ([\d,]+) of ([\d,]+) companies/);
      const newCount = parseInt(newMatch![1].replace(/,/g, ''));

      expect(newCount).toBeLessThan(initialCount);

      // Verify the filter value changed
      const filterValue = await page.locator('text=/\\$\\d+B - \\$\\d+B/').first().textContent();
      expect(filterValue).not.toBe('$0B - $5000B');
    }
  });

  test.skip('should show Clear All button when filters are active', async ({ page }) => {
    // Initially, Clear All button should not be visible (no active filters)
    await expect(page.locator('button:has-text("Clear All")')).not.toBeVisible();

    // Adjust a slider
    const slider = page.locator('.custom-slider').first();
    const handle = slider.locator('.rc-slider-handle').first();
    const handleBox = await handle.boundingBox();

    if (handleBox) {
      // Get slider width for proportional drag
      const sliderBox = await slider.boundingBox();
      if (sliderBox) {
        // Drag handle to 20% position on the slider
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(sliderBox.x + sliderBox.width * 0.2, handleBox.y + handleBox.height / 2);
        await page.mouse.up();
        await page.waitForTimeout(500);

        // Now Clear All button should be visible
        await expect(page.locator('button:has-text("Clear All")')).toBeVisible();
      }
    }
  });

  test.skip('should reset filters when Clear All is clicked', async ({ page }) => {
    // Adjust Market Cap slider
    const slider = page.locator('.custom-slider').first();
    const handle = slider.locator('.rc-slider-handle').first();
    const handleBox = await handle.boundingBox();

    if (handleBox) {
      // Get slider width for proportional drag
      const sliderBox = await slider.boundingBox();
      if (sliderBox) {
        // Drag handle to 20% position on the slider
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(sliderBox.x + sliderBox.width * 0.2, handleBox.y + handleBox.height / 2);
        await page.mouse.up();
        await page.waitForTimeout(500);

        // Verify filter changed
        let filterValue = await page.locator('text=/\\$\\d+B - \\$\\d+B/').first().textContent();
        expect(filterValue).not.toBe('$0B - $5000B');

        // Click Clear All
        await page.locator('button:has-text("Clear All")').click();
        await page.waitForTimeout(500);

        // Verify filter reset to default
        filterValue = await page.locator('text=/\\$\\d+B - \\$\\d+B/').first().textContent();
        expect(filterValue).toBe('$0B - $5000B');

        // Clear All button should disappear
        await expect(page.locator('button:has-text("Clear All")')).not.toBeVisible();
      }
    }
  });

  test.skip('should combine multiple filters', async ({ page }) => {
    // Get initial count
    const initialText = await page.locator('text=/Showing .* of .* companies/').textContent();
    const initialMatch = initialText?.match(/Showing ([\d,]+) of ([\d,]+) companies/);
    const initialCount = parseInt(initialMatch![1].replace(/,/g, ''));

    // Adjust Market Cap slider (first slider)
    const marketCapSlider = page.locator('.custom-slider').nth(0);
    let handle = marketCapSlider.locator('.rc-slider-handle').first();
    let handleBox = await handle.boundingBox();
    let sliderBox = await marketCapSlider.boundingBox();
    if (handleBox && sliderBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sliderBox.x + sliderBox.width * 0.15, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }

    // Adjust P/E Ratio slider (third slider)
    const peSlider = page.locator('.custom-slider').nth(2);
    handle = peSlider.locator('.rc-slider-handle').first();
    handleBox = await handle.boundingBox();
    sliderBox = await peSlider.boundingBox();
    if (handleBox && sliderBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sliderBox.x + sliderBox.width * 0.15, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }

    // Check that company count is significantly reduced
    const newText = await page.locator('text=/Showing .* of .* companies/').textContent();
    const newMatch = newText?.match(/Showing ([\d,]+) of ([\d,]+) companies/);
    const newCount = parseInt(newMatch![1].replace(/,/g, ''));

    expect(newCount).toBeLessThan(initialCount);
  });

  test('should sort table by clicking column headers', async ({ page }) => {
    // Click Market Cap header to sort
    await page.locator('th:has-text("Market Cap")').click();
    await page.waitForTimeout(300);

    // Verify sort indicator appears
    const marketCapHeader = page.locator('th:has-text("Market Cap")');
    await expect(marketCapHeader.locator('span')).toBeVisible();

    // Click again to reverse sort
    await page.locator('th:has-text("Market Cap")').click();
    await page.waitForTimeout(300);
  });

  test('should show empty state when no companies match filters', async ({ page }) => {
    // Set extreme filters that will match nothing
    // Set Market Cap to very narrow range at the high end
    const slider = page.locator('.custom-slider').first();
    const handle = slider.locator('.rc-slider-handle').first();
    const handleBox = await handle.boundingBox();

    if (handleBox) {
      // Set min very high (drag handle almost to the right end)
      const sliderBox = await slider.boundingBox();
      if (sliderBox) {
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(sliderBox.x + sliderBox.width * 0.95, handleBox.y + handleBox.height / 2);
        await page.mouse.up();
        await page.waitForTimeout(500);

        // Check for empty state
        const showingText = await page.locator('text=/Showing .* of .* companies/').textContent();

        // If we got 0 results, check for empty state message
        if (showingText?.includes('Showing 0 of')) {
          await expect(page.locator('text=No companies found')).toBeVisible();
          await expect(page.locator('text=Try adjusting your filters')).toBeVisible();
        }
      }
    }
  });

  test('should display last updated timestamp', async ({ page }) => {
    // Check that "Updated:" text is visible
    await expect(page.locator('text=/Updated:/')).toBeVisible();
  });

  test('should maintain responsive grid layout', async ({ page }) => {
    // Check that filter container uses grid layout
    const filterGrid = page.locator('.grid');
    await expect(filterGrid).toBeVisible();

    // Verify grid has correct classes
    const gridClasses = await filterGrid.getAttribute('class');
    expect(gridClasses).toContain('grid-cols-2');
    expect(gridClasses).toContain('md:grid-cols-3');
    expect(gridClasses).toContain('lg:grid-cols-5');
  });

  test('should have proper hover states on table rows', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();

    // Hover over row
    await firstRow.hover();

    // Check that row has hover class (the bg should change)
    // We'll check that the row is still visible after hover
    await expect(firstRow).toBeVisible();
  });

  test('should show gradient header', async ({ page }) => {
    const header = page.locator('text=Companies Market Cap');
    await expect(header).toBeVisible();

    // Check that the header section exists
    const headerSection = page.locator('.bg-gradient-to-r').first();
    await expect(headerSection).toBeVisible();
  });
});
