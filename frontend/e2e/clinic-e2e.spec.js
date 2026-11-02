import { test, expect } from '@playwright/test';

test.describe('Clinic Booking System — End-to-End Test Suite', () => {

  test.describe('Authenticated Workstation Flows', () => {
    let sharedToken = null;
    let sharedStaff = {
      id: 'staff-01',
      name: 'Sarah Aliyu',
      email: 'sarah.aliyu@cedarcare.ng',
      role: 'receptionist',
      roleLabel: 'Lead Receptionist',
      shift: 'Morning Shift (08:00 – 16:00)',
      avatar: 'SA',
      pin: '1234',
      isActive: true,
    };

    test.beforeAll(async ({ request }) => {
      try {
        const loginRes = await request.post('http://127.0.0.1:8000/api/v1/auth/login/', {
          data: { email: 'sarah.aliyu@cedarcare.ng', password: 'password123' },
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
        });
        if (loginRes.ok()) {
          const body = await loginRes.json();
          if (body.access) sharedToken = body.access;
          if (body.user) sharedStaff = { ...sharedStaff, ...body.user };
        }
      } catch (err) {
        console.log('Django login pre-fetch notice:', err.message);
      }
    });

    test.beforeEach(async ({ page }) => {
      // Listen to console and page errors for diagnostic visibility
      page.on('pageerror', (err) => console.log('PAGE UNCAUGHT ERROR:', err.message));

      // Inject authenticated Receptionist session & token into localStorage
      await page.addInitScript(({ token, staffUser }) => {
        if (token) localStorage.setItem('cbs_auth_token', token);
        localStorage.setItem(
          'cbs_auth_session',
          JSON.stringify({
            state: {
              isAuthenticated: true,
              currentStaff: staffUser,
              isLocked: false,
              pin: staffUser.pin || '1234',
            },
            version: 0,
          })
        );
        localStorage.setItem('cedarcare_demo_mode', 'false');
      }, { token: sharedToken, staffUser: sharedStaff });
    });

    test('1. Triage Queue loads and displays inbound requests with FIFO tabs', async ({ page }) => {
      await page.goto('/queue');
      await page.waitForLoadState('domcontentloaded');

      // Verify top header branding
      await expect(page.locator('h1.header-page-title')).toContainText(/Patient Booking Requests/i);

      // Verify FIFO Tabs (New Requests, Re-Requested, Expired Offers, Today's Schedule)
      const newTab = page.locator('button.queue-tab', { hasText: 'New Requests' });
      await expect(newTab).toBeVisible({ timeout: 10000 });

      const reRequestedTab = page.locator('button.queue-tab', { hasText: 'Re-Requested' });
      await expect(reRequestedTab).toBeVisible();

      const expiredTab = page.locator('button.queue-tab', { hasText: 'Expired' });
      await expect(expiredTab).toBeVisible();

      // Verify Queue Cards are rendered
      const queueCards = page.locator('.bento-queue-card');
      await expect(queueCards.first()).toBeVisible({ timeout: 10000 });
      const count = await queueCards.count();
      expect(count).toBeGreaterThan(0);

      // Test Search filtering
      const searchInput = page.locator('.queue-search-input');
      if (await searchInput.isVisible()) {
        await searchInput.fill('Amina');
        await page.waitForTimeout(300);
        const filteredCards = page.locator('.bento-queue-card');
        const filteredCount = await filteredCards.count();
        expect(filteredCount).toBeGreaterThan(0);
        await searchInput.clear();
      }
    });

    test('2. Receptionist can open and inspect a Candidate Slot Review Modal', async ({ page }) => {
      await page.goto('/queue');
      await page.waitForLoadState('domcontentloaded');

      // Click on the first review button
      const reviewBtn = page.locator('.bento-queue-action-btn').first();
      await expect(reviewBtn).toBeVisible({ timeout: 10000 });
      await reviewBtn.click();

      // Modal should open
      const modal = page.locator('.review-modal');
      await expect(modal).toBeVisible({ timeout: 10000 });

      // Verify presence of Review title
      await expect(page.locator('.review-title')).toContainText(/Review booking request/i);

      // Close modal
      const closeBtn = page.locator('button[aria-label="Close review"], .review-head .icon-btn');
      await closeBtn.first().click();
      await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    test('3. Client Pitch Simulator (Web & Telegram channels) intake and dispatch', async ({ page }) => {
      await page.goto('/simulator');
      await page.waitForLoadState('domcontentloaded');

      // Phone chassis should be present
      const phoneFrame = page.locator('.phone-device-wrapper, .phone-chassis');
      await expect(phoneFrame.first()).toBeVisible({ timeout: 10000 });

      // Form input should accept patient name
      const nameInput = page.locator('#input-patient-name, input[placeholder*="Amina"]').first();
      await expect(nameInput).toBeVisible({ timeout: 10000 });
      await nameInput.fill('Amina Yusuf');
      await expect(nameInput).toHaveValue(/Amina/i);

      // Switch to Telegram Channel
      const tgChannelBtn = page.locator('#tab-btn-telegram, button:has-text("Telegram")');
      if (await tgChannelBtn.first().isVisible()) {
        await tgChannelBtn.first().click();
        await expect(page.locator('.telegram-chat-container')).toBeVisible({ timeout: 5000 });
      }

      // Switch back to Web Form
      const webChannelBtn = page.locator('#tab-btn-web, button:has-text("Web")');
      if (await webChannelBtn.first().isVisible()) {
        await webChannelBtn.first().click();
        await expect(page.locator('.web-intake-container')).toBeVisible({ timeout: 5000 });
      }
    });

    test('4. Master Clinical Calendar grid & doctor workload horizons', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForLoadState('domcontentloaded');

      // Calendar container should render
      const calendarView = page.locator('.grid-booking-container, .calendar-view-header');
      await expect(calendarView.first()).toBeVisible({ timeout: 10000 });

      // Doctor selection cards
      const doctorCards = page.locator('.doctor-select-card');
      await expect(doctorCards.first()).toBeVisible({ timeout: 10000 });
      const docCount = await doctorCards.count();
      expect(docCount).toBeGreaterThan(0);

      // Switch to Past Patient Records Archive tab
      const historyTab = page.locator('button:has-text("Past Patient Records")');
      if (await historyTab.isVisible()) {
        await historyTab.click();
        await expect(page.locator('.past-patients-section')).toBeVisible({ timeout: 5000 });
      }
    });

    test('5. Live Clinic Visits 3-swimlane flow & Walk-In admission modal', async ({ page }) => {
      await page.goto('/live-visits');
      await page.waitForLoadState('domcontentloaded');

      // Check 3 swimlanes (Waiting Room, In Consultation, Completed)
      const swimlanes = page.locator('.swimlane-column');
      await expect(swimlanes.first()).toBeVisible({ timeout: 10000 });
      const swimlaneCount = await swimlanes.count();
      expect(swimlaneCount).toBeGreaterThanOrEqual(3);

      // Click Walk-In Check-In button
      const walkInBtn = page.locator('button:has-text("Walk-In Patient")');
      await expect(walkInBtn).toBeVisible({ timeout: 10000 });
      await walkInBtn.click();

      // Modal surface should appear
      const modal = page.locator('.calendar-modal-surface, .calendar-modal-backdrop');
      await expect(modal.first()).toBeVisible({ timeout: 5000 });

      // Close modal
      const closeBtn = page.locator('.icon-btn-close, button[aria-label="Close Walk-In Modal"]');
      if (await closeBtn.first().isVisible()) {
        await closeBtn.first().click();
      }
    });

    test('6. Staff Directory roster & credentials management', async ({ page }) => {
      await page.goto('/admin/staff');
      await page.waitForLoadState('domcontentloaded');

      // Staff roster section
      const staffSection = page.locator('.bento-staff-section, .bento-staff-cards-grid');
      await expect(staffSection.first()).toBeVisible({ timeout: 10000 });

      // Check staff cards
      const staffCards = page.locator('.bento-staff-card');
      await expect(staffCards.first()).toBeVisible({ timeout: 10000 });
      const count = await staffCards.count();
      expect(count).toBeGreaterThan(0);

      // Open first staff edit modal
      const manageBtn = page.locator('.bento-staff-action-btn').first();
      await manageBtn.click();

      const editModal = page.locator('.calendar-modal-surface, [role="dialog"]');
      await expect(editModal.first()).toBeVisible({ timeout: 5000 });

      // Close modal
      const cancelBtn = page.locator('button:has-text("Cancel"), .icon-btn-close');
      if (await cancelBtn.first().isVisible()) {
        await cancelBtn.first().click();
      }
    });

    test('7. Clinic Settings bento & audio chimes test', async ({ page }) => {
      await page.goto('/admin/settings');
      await page.waitForLoadState('domcontentloaded');

      // Clinic settings view container
      const settingsContainer = page.locator('.settings-view-wrapper, .view-container');
      await expect(settingsContainer.first()).toBeVisible({ timeout: 10000 });

      // Test Audio Chimes preview button
      const testChimeBtn = page.locator('button:has-text("Test Sound")');
      await expect(testChimeBtn.first()).toBeVisible({ timeout: 10000 });
      await testChimeBtn.first().click();
    });

  });

  test.describe('Unauthenticated Staff Portal & Security', () => {

    test('8. Staff Login Portal displays clean NDPR notice and rejects invalid credentials', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      // Check login form fields
      const emailInput = page.locator('#staff-email, input[type="email"]');
      const pwdInput = page.locator('#staff-password, input[type="password"]');
      const submitBtn = page.locator('button[type="submit"]');

      await expect(emailInput).toBeVisible({ timeout: 10000 });
      await expect(pwdInput).toBeVisible();
      await expect(submitBtn).toBeVisible();

      // Verify NDPR & HIPAA security badge
      await expect(page.locator('.login-footer-note')).toContainText(/NDPR/i);

      // Test invalid login rejection
      await emailInput.fill('unauthorized.guest@cedarcare.ng');
      await pwdInput.fill('wrongpassword123');
      await submitBtn.click();

      // Error banner should appear
      const errorBanner = page.locator('.login-alert-banner, .login-alert-warning');
      await expect(errorBanner.first()).toBeVisible({ timeout: 15000 });

      // Test Quick 1-Click credential filling
      const quickSarahBtn = page.locator('button:has-text("Sarah (Reception)")');
      if (await quickSarahBtn.isVisible()) {
        await quickSarahBtn.click();
        await expect(emailInput).toHaveValue('sarah.aliyu@cedarcare.ng');
        await submitBtn.click();
        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
        await expect(page).toHaveURL(/queue/);
      }
    });

  });

});
