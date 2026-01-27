import { test, expect } from '@playwright/test';

test.describe('Company Table with Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the page to load and table to be visible
    await page.waitForSelector('table');
  });

  test('should display all 9 filter input groups', async ({ page }) => {
    // Check that all filter labels are present
    await expect(page.locator('label:has-text("Market Cap")')).toBeVisible();
    await expect(page.locator('label:has-text("Earnings (TTM)")')).toBeVisible();
    await expect(page.locator('label:has-text("Revenue (TTM)")')).toBeVisible();
    await expect(page.locator('label:has-text("P/E Ratio")')).toBeVisible();
    await expect(page.locator('label:has-text("Div. Yield %")')).toBeVisible();
    await expect(page.locator('label:has-text("Fwd P/E")')).toBeVisible();
    await expect(page.locator('label:has-text("Op. Margin %")')).toBeVisible();
    await expect(page.locator('label:has-text("Rev CAGR 5Y")')).toBeVisible();
    await expect(page.locator('label:has-text("EPS CAGR 5Y")')).toBeVisible();

    // Check that input fields are present (2 per filter: min and max = 18 total)
    const inputs = page.locator('input[type="number"]');
    await expect(inputs).toHaveCount(18);
  });

  test('should show pagination with correct format', async ({ page }) => {
    // Should show "Showing X-Y of Z" format
    const paginationText = page.locator('text=/Showing \\d+-\\d+ of [\\d,]+/');
    await expect(paginationText).toBeVisible();

    // Extract and verify pagination info
    const text = await paginationText.textContent();
    const match = text?.match(/Showing (\d+)-(\d+) of ([\d,]+)/);
    expect(match).toBeTruthy();

    const startItem = parseInt(match![1]);
    const endItem = parseInt(match![2]);
    const totalItems = parseInt(match![3].replace(/,/g, ''));

    expect(startItem).toBe(1); // First page starts at 1
    expect(endItem).toBe(100); // First page shows 100 items
    expect(totalItems).toBeGreaterThan(3000); // Total should be 3,500+
  });

  test('should display Previous and Next pagination buttons', async ({ page }) => {
    // Check pagination buttons exist
    await expect(page.locator('button:has-text("Previous 100")')).toBeVisible();
    await expect(page.locator('button:has-text("Next 100")')).toBeVisible();

    // Previous should be disabled on first page
    const prevButton = page.locator('button:has-text("Previous 100")');
    await expect(prevButton).toBeDisabled();

    // Next should be enabled on first page
    const nextButton = page.locator('button:has-text("Next 100")');
    await expect(nextButton).toBeEnabled();
  });

  test('should navigate to next page when Next button is clicked', async ({ page }) => {
    // Click Next button
    await page.locator('button:has-text("Next 100")').click();

    // Wait for navigation
    await page.waitForURL(/\?page=2/);

    // Verify URL has page=2
    expect(page.url()).toContain('page=2');

    // Verify pagination text shows 101-200
    const paginationText = page.locator('text=/Showing \\d+-\\d+ of [\\d,]+/');
    const text = await paginationText.textContent();
    const match = text?.match(/Showing (\d+)-(\d+)/);
    expect(match).toBeTruthy();
    expect(parseInt(match![1])).toBe(101);
    expect(parseInt(match![2])).toBe(200);

    // Previous button should now be enabled
    await expect(page.locator('button:has-text("Previous 100")')).toBeEnabled();
  });

  test('should navigate back with Previous button', async ({ page }) => {
    // Go to page 2 first
    await page.goto('/?page=2');
    await page.waitForSelector('table');

    // Click Previous button
    await page.locator('button:has-text("Previous 100")').click();

    // Wait for navigation back to page 1
    await page.waitForURL('/');

    // Verify pagination shows first page
    const paginationText = page.locator('text=/Showing \\d+-\\d+ of [\\d,]+/');
    const text = await paginationText.textContent();
    const match = text?.match(/Showing (\d+)-(\d+)/);
    expect(match).toBeTruthy();
    expect(parseInt(match![1])).toBe(1);
    expect(parseInt(match![2])).toBe(100);
  });

  test('should display table with company data', async ({ page }) => {
    // Check table headers
    await expect(page.locator('th:has-text("Name")')).toBeVisible();
    await expect(page.locator('th:has-text("Market cap")')).toBeVisible();
    await expect(page.locator('th:has-text("Price")')).toBeVisible();
    await expect(page.locator('th:has-text("Today")')).toBeVisible();

    // Check that table has 100 data rows (first page)
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(100);
  });

  test('should sort table by clicking column headers', async ({ page }) => {
    // Click Market Cap header to sort (first click on new column = toggle to desc from default asc)
    await page.locator('th:has-text("Market cap")').click();

    // Wait for navigation
    await page.waitForURL(/sortBy=marketCap/);

    // Verify URL contains sort params - first click toggles default asc
    expect(page.url()).toContain('sortBy=marketCap');

    // Click again to toggle sort direction
    await page.locator('th:has-text("Market cap")').click();
    await page.waitForURL(/sortOrder=desc/);
    expect(page.url()).toContain('sortOrder=desc');
  });

  test('should filter companies with market cap filter', async ({ page }) => {
    // Fill in minimum market cap filter (100 billion)
    await page.locator('input[placeholder="Min billions"]').first().fill('100');

    // Click Apply
    await page.locator('button:has-text("Apply")').click();

    // Wait for navigation with filter params
    await page.waitForURL(/minMarketCap=100/);

    // Verify URL contains filter
    expect(page.url()).toContain('minMarketCap=100');

    // Verify total count decreased (filtered results)
    const paginationText = page.locator('text=/Showing \\d+-\\d+ of [\\d,]+/');
    const text = await paginationText.textContent();
    const match = text?.match(/of ([\d,]+)/);
    expect(match).toBeTruthy();
    const total = parseInt(match![1].replace(/,/g, ''));
    expect(total).toBeLessThan(3000); // Should be less than full dataset
  });

  test('should show Clear button when filters are active', async ({ page }) => {
    // Initially, Clear button should not be visible
    await expect(page.locator('button:has-text("Clear")')).not.toBeVisible();

    // Apply a filter via URL
    await page.goto('/?minMarketCap=100');
    await page.waitForSelector('table');

    // Now Clear button should be visible
    await expect(page.locator('button:has-text("Clear")')).toBeVisible();
  });

  test('should clear filters when Clear is clicked', async ({ page }) => {
    // Apply a filter
    await page.goto('/?minMarketCap=100&maxMarketCap=500');
    await page.waitForSelector('table');

    // Verify filter is active
    await expect(page.locator('button:has-text("Clear")')).toBeVisible();

    // Click Clear
    await page.locator('button:has-text("Clear")').click();

    // Wait for navigation (filters removed)
    await page.waitForURL('/');

    // Clear button should disappear
    await expect(page.locator('button:has-text("Clear")')).not.toBeVisible();
  });

  test('should reset to page 1 when filters change', async ({ page }) => {
    // Go to page 2
    await page.goto('/?page=2');
    await page.waitForSelector('table');

    // Fill in a filter
    await page.locator('input[placeholder="Min billions"]').first().fill('50');

    // Click Apply
    await page.locator('button:has-text("Apply")').click();

    // Should reset to page 1 (page param removed)
    await page.waitForURL(/minMarketCap=50/);
    expect(page.url()).not.toContain('page=');

    // Verify showing from 1
    const paginationText = page.locator('text=/Showing \\d+-\\d+ of [\\d,]+/');
    const text = await paginationText.textContent();
    expect(text).toContain('Showing 1-');
  });

  test('should apply filter on Enter key press', async ({ page }) => {
    // Fill in market cap filter and press Enter
    const input = page.locator('input[placeholder="Min billions"]').first();
    await input.fill('100');
    await input.press('Enter');

    // Wait for navigation
    await page.waitForURL(/minMarketCap=100/);
    expect(page.url()).toContain('minMarketCap=100');
  });

  test('should show empty state when no companies match filters', async ({ page }) => {
    // Apply very restrictive filter
    await page.goto('/?minMarketCap=50000');
    await page.waitForSelector('table');

    // Check for empty state
    await expect(page.locator('text=No companies found')).toBeVisible();
    await expect(page.locator('text=Try adjusting your filters')).toBeVisible();
  });

  test('should display data source in footer', async ({ page }) => {
    // Check that footer with data source is visible
    await expect(page.locator('text=Data sourced from Financial Modeling Prep API')).toBeVisible();
  });

  test('should maintain responsive grid layout for filters', async ({ page }) => {
    // Check that filter container uses grid layout
    const filterGrid = page.locator('.grid.grid-cols-2').first();
    await expect(filterGrid).toBeVisible();

    // Verify grid has correct responsive classes (9 filters)
    const gridClasses = await filterGrid.getAttribute('class');
    expect(gridClasses).toContain('md:grid-cols-3');
    expect(gridClasses).toContain('lg:grid-cols-5');
    expect(gridClasses).toContain('xl:grid-cols-9');
  });

  test('should have proper hover states on table rows', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();

    // Hover over row
    await firstRow.hover();

    // Check that row is still visible after hover
    await expect(firstRow).toBeVisible();
  });

  test('should preserve sort when paginating', async ({ page }) => {
    // Sort by name
    await page.locator('th:has-text("Name")').click();
    await page.waitForURL(/sortBy=name/);

    // Go to next page
    await page.locator('button:has-text("Next 100")').click();
    await page.waitForURL(/page=2/);

    // Verify sort is preserved
    expect(page.url()).toContain('sortBy=name');
    expect(page.url()).toContain('page=2');
  });

  test('should preserve filters when paginating', async ({ page }) => {
    // Apply filter
    await page.goto('/?minMarketCap=10');
    await page.waitForSelector('table');

    // Go to next page
    await page.locator('button:has-text("Next 100")').click();
    await page.waitForURL(/page=2/);

    // Verify filter is preserved
    expect(page.url()).toContain('minMarketCap=10');
    expect(page.url()).toContain('page=2');
  });
});
