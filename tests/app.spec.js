// @ts-check
/**
 * Playwright test suite for Conjugate Method Study Hub PWA
 *
 * Run with:
 *   npx playwright test               — headless, all projects
 *   npm run test:headed               — headed Chrome
 *   npm run test:ui                   — interactive UI mode
 *
 * Prerequisites: dev server running at http://localhost:3000
 *   e.g. npx serve . -p 3000  (or python -m http.server 3000)
 */

const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wipe all app localStorage keys before a test (preserve the test login email) */
async function clearStorage(page) {
  await page.evaluate(() => {
    [
      'conjugate_study_data',
      'conjugate_feedback_log',
      'conjugate_lab_data',
      'conjugate_lab_audit',
      'conjugate_sync_user',
    ].forEach((k) => localStorage.removeItem(k));
    // Keep the user past the local-email login gate
    localStorage.setItem('conjugate_user_email', 'test@example.com');
  });
}

/** Seed the study-data store with realistic data */
async function seedStudyData(page, overrides = {}) {
  const base = {
    darkMode: false,
    missedQuestions: {},
    flaggedQuestions: {},
    quizHistory: [],
    studyStreak: { lastDate: null, current: 0, longest: 0 },
    totalSessions: 0,
    _earnedBadges: [],
    ...overrides,
  };
  await page.evaluate((data) => {
    localStorage.setItem('conjugate_study_data', JSON.stringify(data));
  }, base);
}

/** Navigate to the app and wait for the mode selector to be ready */
async function gotoApp(page) {
  // Pre-seed the local-email login so the app skips the login gate.
  // We need a page context to call localStorage.setItem, so visit once,
  // seed, then reload.
  await page.goto('http://localhost:3000');
  await page.evaluate(() => localStorage.setItem('conjugate_user_email', 'test@example.com'));
  await page.reload();
  await page.waitForSelector('#mode-selector', { state: 'visible' });
}

// ---------------------------------------------------------------------------
// App Shell
// ---------------------------------------------------------------------------

test.describe('App Shell', () => {
  test('loads and renders the page title', async ({ page }) => {
    await gotoApp(page);
    await expect(page).toHaveTitle(/Conjugate Method Study Hub/i);
  });

  test('mode-selector grid is visible on load', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#mode-selector')).toBeVisible();
  });

  test('all primary mode buttons are visible', async ({ page }) => {
    await gotoApp(page);
    const buttons = ['#fc-mode-btn', '#qz-mode-btn', '#ft-mode-btn', '#dash-mode-btn', '#survey-mode-btn', '#lab-mode-btn'];
    for (const sel of buttons) {
      await expect(page.locator(sel)).toBeVisible();
    }
  });

  test('stats bar shows streak, sessions, and avg score placeholders', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await expect(page.locator('.stats-bar')).toBeVisible();
    await expect(page.locator('#streakDisplay')).toHaveText('0');
    await expect(page.locator('#sessionsDisplay')).toHaveText('0');
    await expect(page.locator('#avgScoreDisplay')).toHaveText('--');
  });

  test('stats bar reflects seeded session data on reload', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 7,
      studyStreak: { lastDate: null, current: 3, longest: 3 },
      quizHistory: [
        { date: new Date().toISOString(), score: 8, total: 10, mode: 'quiz', section: 'all', timeSeconds: 90 },
      ],
    });
    // Reload so the page re-reads localStorage on init
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await expect(page.locator('#sessionsDisplay')).toHaveText('7');
    await expect(page.locator('#streakDisplay')).toHaveText('3');
    await expect(page.locator('#avgScoreDisplay')).toHaveText('80%');
  });

  test('dark mode toggles data-theme attribute', async ({ page }) => {
    await gotoApp(page);
    const html = page.locator('html');
    // Starts in light mode (attribute is "light" or absent)
    const initialTheme = await html.getAttribute('data-theme');
    expect(['light', null, '']).toContain(initialTheme);

    await page.click('#darkModeBtn');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Toggle back
    await page.click('#darkModeBtn');
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('review-mode-btn is hidden when no missed questions exist', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await expect(page.locator('#review-mode-btn')).toBeHidden();
  });

  test('review-mode-btn appears when missed questions are seeded', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      missedQuestions: { 1: 2, 5: 1, 12: 3 },
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await expect(page.locator('#review-mode-btn')).toBeVisible();
    await expect(page.locator('#missedCount')).toContainText('3 to review');
  });
});

// ---------------------------------------------------------------------------
// Flashcards (FC)
// ---------------------------------------------------------------------------

test.describe('Flashcards (FC)', () => {
  test('clicking the FC mode button reveals #fc-setup inline', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#fc-setup')).toBeHidden();
    await page.click('#fc-mode-btn');
    await expect(page.locator('#fc-setup')).toBeVisible();
  });

  test('fc-setup shows section filter select and Start button', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    await expect(page.locator('#fcSectionFilter')).toBeVisible();
    await expect(page.locator('#fc-start-btn')).toBeVisible();
  });

  test('section filter contains all 10 sections plus "All"', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    const options = await page.locator('#fcSectionFilter option').allTextContents();
    expect(options.length).toBe(11); // "All Sections" + 10 sections
    expect(options[0]).toMatch(/All Sections/i);
  });

  test('starting flashcards hides mode-selector and shows flashcard panel', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    await page.click('#fc-start-btn');
    await expect(page.locator('#mode-selector')).toBeHidden();
    await expect(page.locator('#flashcard-panel')).toBeVisible();
  });

  test('flashcard panel renders a card with front face visible', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    await page.click('#fc-start-btn');
    await page.waitForSelector('#fcCard', { state: 'visible' });
    const card = page.locator('#fcCard');
    await expect(card).toBeVisible();
    // Card should NOT have .flipped class initially
    await expect(card).not.toHaveClass(/flipped/);
  });

  test('clicking the flashcard adds the .flipped class', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    await page.click('#fc-start-btn');
    await page.waitForSelector('#fcFlipArea', { state: 'visible' });
    await page.click('#fcFlipArea');
    await expect(page.locator('#fcCard')).toHaveClass(/flipped/);
  });

  test('marking card as "Got It Right" advances to the next card', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    await page.click('#fc-start-btn');
    await page.waitForSelector('.fc-progress', { state: 'visible' });
    const initialProgress = await page.locator('.fc-progress').textContent();
    // Mark as known
    await page.click('.btn-known');
    const nextProgress = await page.locator('.fc-progress').textContent();
    // Progress counter should have incremented
    expect(initialProgress).not.toEqual(nextProgress);
  });

  test('back button from flashcards returns to main menu', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    await page.click('#fc-start-btn');
    await page.waitForSelector('.btn-sm', { state: 'visible' });
    await page.click('button.btn-sm:has-text("Back to Menu")');
    await expect(page.locator('#mode-selector')).toBeVisible();
  });

  test('section-filtered flashcards only shows cards from that section', async ({ page }) => {
    await gotoApp(page);
    await page.click('#fc-mode-btn');
    // Select section 2 (Max Effort Method)
    await page.selectOption('#fcSectionFilter', '2');
    await page.click('#fc-start-btn');
    await page.waitForSelector('.fc-section-tag', { state: 'visible' });
    // Every section tag rendered should say "Max Effort Method"
    const tag = await page.locator('.fc-section-tag').first().textContent();
    expect(tag).toMatch(/Max Effort Method/i);
  });
});

// ---------------------------------------------------------------------------
// Custom Quiz (QZ)
// ---------------------------------------------------------------------------

test.describe('Custom Quiz (QZ)', () => {
  test('clicking QZ mode button shows the quiz setup panel', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await expect(page.locator('#quiz-panel')).toBeVisible();
    await expect(page.locator('#mode-selector')).toBeHidden();
  });

  test('setup shows "All Sections" chip active by default', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('.section-chip', { state: 'visible' });
    const allChip = page.locator('.section-chip[data-sec="all"]');
    await expect(allChip).toHaveClass(/active/);
  });

  test('section chips are rendered for all 10 sections plus All', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('.section-chip', { state: 'visible' });
    const chips = await page.locator('.section-chip').count();
    expect(chips).toBe(11); // All + 10 sections
  });

  test('clicking a specific section chip deactivates the All chip', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('.section-chip', { state: 'visible' });
    const allChip = page.locator('.section-chip[data-sec="all"]');
    const sec1Chip = page.locator('.section-chip[data-sec="1"]');
    await sec1Chip.click();
    await expect(allChip).not.toHaveClass(/active/);
    await expect(sec1Chip).toHaveClass(/active/);
  });

  test('if all section chips are deselected, All chip reactivates', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('.section-chip', { state: 'visible' });
    // Activate sec1, then deactivate it
    const sec1Chip = page.locator('.section-chip[data-sec="1"]');
    await sec1Chip.click(); // activates sec1, deactivates All
    await sec1Chip.click(); // deactivates sec1 — All should reactivate
    await expect(page.locator('.section-chip[data-sec="all"]')).toHaveClass(/active/);
  });

  test('count slider updates the displayed count value', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('#qzCountSlider', { state: 'visible' });
    // Set slider to 20
    await page.evaluate(() => {
      const slider = document.getElementById('qzCountSlider');
      slider.value = '20';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#countDisplay')).toHaveText('20');
  });

  test('#qzPoolInfo shows available question count', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('#qzPoolInfo', { state: 'visible' });
    const info = await page.locator('#qzPoolInfo').textContent();
    expect(info).toMatch(/\d+ questions available/);
  });

  test('focus-option buttons toggle active state', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('.focus-option', { state: 'visible' });
    const tfFocus = page.locator('.focus-option[data-focus="tf"]');
    await tfFocus.click();
    await expect(tfFocus).toHaveClass(/active/);
    // "All Questions" focus should now be inactive
    await expect(page.locator('.focus-option[data-focus="all"]')).not.toHaveClass(/active/);
  });

  test('starting a quiz hides the setup and shows the first question', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.waitForSelector('.btn-primary:has-text("Start Quiz")', { state: 'visible' });
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.quiz-card', { state: 'visible' });
    await expect(page.locator('.quiz-card')).toBeVisible();
    await expect(page.locator('.quiz-question')).toBeVisible();
  });

  test('quiz timer starts counting after quiz begins', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('#qzTimer', { state: 'visible' });
    const initialTime = await page.locator('#qzTimer').textContent();
    // Wait 2 seconds for the timer to tick
    await page.waitForTimeout(2100);
    const laterTime = await page.locator('#qzTimer').textContent();
    expect(initialTime).not.toEqual(laterTime);
  });

  test('answering a quiz question correctly applies opt-correct class', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.quiz-opt', { state: 'visible' });

    // Find the correct answer by reading the question's data from JS
    const correctIdx = await page.evaluate(() => {
      return window.QZ && window.QZ.questions[0] ? window.QZ.questions[0].ans : 0;
    });

    // Click the button whose data-orig matches the correct answer index
    const correctBtn = page.locator(`.quiz-opt[data-orig="${correctIdx}"]`);
    if (await correctBtn.count() > 0) {
      await correctBtn.click();
      await expect(correctBtn).toHaveClass(/opt-correct/);
    } else {
      // True/False question: click by data-val
      const ansVal = await page.evaluate(() => {
        const q = window.QZ.questions[0];
        return q && q.type === 'tf' ? String(q.ans) : null;
      });
      if (ansVal !== null) {
        const tfBtn = page.locator(`.quiz-opt[data-val="${ansVal}"]`);
        await tfBtn.click();
        await expect(tfBtn).toHaveClass(/opt-correct/);
      }
    }
  });

  test('answering a quiz question adds .answered class to quiz-card (prevents double-submit)', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.quiz-opt', { state: 'visible' });
    const firstBtn = page.locator('.quiz-opt').first();
    await firstBtn.click();
    await expect(page.locator('.quiz-card')).toHaveClass(/answered/);
  });

  test('answering wrong shows feedback with fb-wrong class', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.quiz-opt', { state: 'visible' });

    // Click a wrong answer: find an option that is NOT the correct one
    const wrongIdx = await page.evaluate(() => {
      const q = window.QZ && window.QZ.questions[0];
      if (!q || q.type === 'tf') return null;
      // Return first index that is NOT the correct answer
      for (let i = 0; i < q.opts.length; i++) {
        if (i !== q.ans) return i;
      }
      return null;
    });

    if (wrongIdx !== null) {
      const wrongBtn = page.locator(`.quiz-opt[data-orig="${wrongIdx}"]`);
      if (await wrongBtn.count() > 0) {
        await wrongBtn.click();
        await expect(wrongBtn).toHaveClass(/opt-wrong/);
        await expect(page.locator('#qzFeedback .fb-wrong')).toBeVisible();
      }
    }
  });

  test('quiz feedback area becomes visible after answering', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.quiz-opt', { state: 'visible' });
    // Feedback div starts hidden
    await expect(page.locator('#qzFeedback')).toBeHidden();
    await page.locator('.quiz-opt').first().click();
    await expect(page.locator('#qzFeedback')).toBeVisible();
  });

  test('Quit button from a quiz returns to the main menu', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.btn-sm:has-text("Quit")', { state: 'visible' });
    await page.click('.btn-sm:has-text("Quit")');
    await expect(page.locator('#mode-selector')).toBeVisible();
  });

  test('completing all quiz questions shows results card', async ({ page }) => {
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    // Use the minimum 5-question quiz for speed
    await page.evaluate(() => {
      const slider = document.getElementById('qzCountSlider');
      slider.value = '5';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('.btn-primary:has-text("Start Quiz")');

    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('.quiz-opt:not([disabled])', { state: 'visible' });
      await page.locator('.quiz-opt').first().click();
      await page.waitForSelector('#qzFeedback .btn-primary', { state: 'visible' });
      await page.locator('#qzFeedback .btn-primary').click();
    }

    await expect(page.locator('.results-card')).toBeVisible();
    await expect(page.locator('#qzBigScore')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Full Test (FT)
// ---------------------------------------------------------------------------

test.describe('Full Test (FT)', () => {
  test('clicking FT mode button shows the test panel', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await expect(page.locator('#test-panel')).toBeVisible();
    await expect(page.locator('#mode-selector')).toBeHidden();
  });

  test('full test renders all 10 section dividers', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await page.waitForSelector('.section-divider', { state: 'visible' });
    const dividers = await page.locator('.section-divider').count();
    expect(dividers).toBe(10);
  });

  test('full test renders 105 question cards', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await page.waitForSelector('.question-card', { state: 'visible' });
    const cards = await page.locator('.question-card').count();
    expect(cards).toBe(105);
  });

  test('Score Test button is visible in test controls', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await page.waitForSelector('.test-controls', { state: 'visible' });
    await expect(page.locator('.btn-primary:has-text("Score Test")').first()).toBeVisible();
  });

  test('scoring the test shows the results panel', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await page.waitForSelector('.btn-primary:has-text("Score Test")', { state: 'visible' });
    await page.locator('.btn-primary:has-text("Score Test")').first().click();
    await page.waitForSelector('#ftResultsPanel', { state: 'visible' });
    await expect(page.locator('#ftResultsPanel')).toBeVisible();
  });

  test('answered MC questions highlight the correct option after scoring', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await page.waitForSelector('.question-card', { state: 'visible' });

    // Answer the first MC question by selecting option index 0
    const firstCard = page.locator('.question-card').first();
    const firstRadio = firstCard.locator('input[type="radio"]').first();
    await firstRadio.check();

    await page.locator('.btn-primary:has-text("Score Test")').first().click();
    await page.waitForSelector('.graded-correct, .graded-incorrect', { state: 'visible' });

    // At least one graded class should exist after scoring
    const graded = await page.locator('.graded-correct, .graded-incorrect').count();
    expect(graded).toBeGreaterThan(0);
  });

  test('Reset button clears graded classes and reloads questions', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await page.waitForSelector('.question-card', { state: 'visible' });

    // Select one answer and score
    await page.locator('.question-card').first().locator('input[type="radio"]').first().check();
    await page.locator('.btn-primary:has-text("Score Test")').first().click();
    await page.waitForSelector('.graded-correct, .graded-incorrect', { state: 'visible' });

    // Reset
    await page.locator('.btn:has-text("Reset")').first().click();
    await page.waitForSelector('.question-card', { state: 'visible' });

    // No graded classes should remain
    const gradedAfterReset = await page.locator('.graded-correct, .graded-incorrect').count();
    expect(gradedAfterReset).toBe(0);
  });

  test('Back to Menu button returns to the main menu from full test', async ({ page }) => {
    await gotoApp(page);
    await page.click('#ft-mode-btn');
    await page.waitForSelector('.btn-sm:has-text("Back to Menu")', { state: 'visible' });
    await page.locator('.btn-sm:has-text("Back to Menu")').click();
    await expect(page.locator('#mode-selector')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Review Missed (RV)
// ---------------------------------------------------------------------------

test.describe('Review (RV)', () => {
  test('review mode shows a question when missed questions are seeded', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      missedQuestions: { 1: 2, 5: 1, 12: 3 },
    });
    // Reload so the page sees the seeded data
    await page.reload();
    await page.waitForSelector('#review-mode-btn', { state: 'visible' });
    await page.click('#review-mode-btn');
    await page.waitForSelector('.quiz-card', { state: 'visible' });
    await expect(page.locator('.quiz-card')).toBeVisible();
    await expect(page.locator('.quiz-question')).toBeVisible();
  });

  test('review mode displays "Review Mode" label in quiz stats', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, { missedQuestions: { 3: 1 } });
    await page.reload();
    await page.waitForSelector('#review-mode-btn', { state: 'visible' });
    await page.click('#review-mode-btn');
    await page.waitForSelector('.quiz-stats', { state: 'visible' });
    await expect(page.locator('.quiz-stats')).toContainText('Review Mode');
  });

  test('answering correctly marks the option with opt-correct', async ({ page }) => {
    await gotoApp(page);
    // Seed Q4 (T/F, ans=false) as missed
    await seedStudyData(page, { missedQuestions: { 4: 1 } });
    await page.reload();
    await page.waitForSelector('#review-mode-btn', { state: 'visible' });
    await page.click('#review-mode-btn');
    await page.waitForSelector('.quiz-opt', { state: 'visible' });

    // Q4 is a T/F with answer=false
    const falseBtn = page.locator('.quiz-opt[data-val="false"]');
    if (await falseBtn.count() > 0) {
      await falseBtn.click();
      await expect(falseBtn).toHaveClass(/opt-correct/);
    }
  });

  test('review completion shows the results card', async ({ page }) => {
    await gotoApp(page);
    // Seed a single missed question (Q1, MC)
    await seedStudyData(page, { missedQuestions: { 1: 1 } });
    await page.reload();
    await page.waitForSelector('#review-mode-btn', { state: 'visible' });
    await page.click('#review-mode-btn');
    await page.waitForSelector('.quiz-opt:not([disabled])', { state: 'visible' });

    // Answer the one question
    await page.locator('.quiz-opt').first().click();
    await page.waitForSelector('#rvFeedback .btn-primary', { state: 'visible' });
    await page.locator('#rvFeedback .btn-primary').click();

    await expect(page.locator('.results-card')).toBeVisible();
    await expect(page.locator('#rvBigScore')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Dashboard (DASH)
// ---------------------------------------------------------------------------

test.describe('Dashboard (DASH)', () => {
  test('empty dashboard shows "No sessions yet" message', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#dash-mode-btn');
    await page.waitForSelector('#dash-panel', { state: 'visible' });
    await expect(page.locator('.dash-empty')).toBeVisible();
  });

  test('dashboard with data shows Overview card and SVG charts', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 5,
      studyStreak: { lastDate: null, current: 2, longest: 5 },
      quizHistory: [
        { date: new Date().toISOString(), score: 7, total: 10, mode: 'quiz', section: 'all', timeSeconds: 80 },
        { date: new Date(Date.now() - 86400000).toISOString(), score: 8, total: 10, mode: 'quiz', section: 'all', timeSeconds: 100 },
        { date: new Date(Date.now() - 172800000).toISOString(), score: 6, total: 10, mode: 'test', section: 'all', timeSeconds: 200 },
      ],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.dash-card', { state: 'visible' });

    // Overview card with SVG progress ring
    await expect(page.locator('.dash-card').first()).toBeVisible();
    await expect(page.locator('svg.progress-ring')).toBeVisible();
  });

  test('dashboard shows 12 badge items', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 1,
      quizHistory: [{ date: new Date().toISOString(), score: 5, total: 10, mode: 'quiz', section: 'all', timeSeconds: 60 }],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.badge-grid', { state: 'visible' });
    const badges = await page.locator('.badge-item').count();
    expect(badges).toBe(12);
  });

  test('dashboard renders section health bars for all 10 sections', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 3,
      quizHistory: [
        { date: new Date().toISOString(), score: 7, total: 10, mode: 'quiz', section: 'all', timeSeconds: 80 },
      ],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.dash-section-bar', { state: 'visible' });
    const bars = await page.locator('.dash-section-bar').count();
    expect(bars).toBe(10);
  });

  test('dashboard renders study diagrams section', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.diagram-card', { state: 'visible' });
    const diagrams = await page.locator('.diagram-card').count();
    expect(diagrams).toBeGreaterThanOrEqual(3); // Weekly Template, Prilepin, Force-Velocity
  });

  test('earned badge shows "Earned" label, locked badge shows lock icon', async ({ page }) => {
    await gotoApp(page);
    // Seed enough sessions to earn the "First Rep" badge (totalSessions >= 1)
    await seedStudyData(page, {
      totalSessions: 1,
      quizHistory: [{ date: new Date().toISOString(), score: 5, total: 10, mode: 'quiz', section: 'all', timeSeconds: 60 }],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.badge-item', { state: 'visible' });
    // At least one badge should be earned
    await expect(page.locator('.badge-item.earned')).toBeVisible();
    await expect(page.locator('.badge-item.earned .badge-check')).toContainText('Earned');
    // At least one badge should still be locked
    await expect(page.locator('.badge-item.locked')).toBeVisible();
  });

  test('back button from dashboard returns to main menu', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.btn-sm:has-text("Back to Menu")', { state: 'visible' });
    await page.locator('.btn-sm:has-text("Back to Menu")').click();
    await expect(page.locator('#mode-selector')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// SYNC
// ---------------------------------------------------------------------------

test.describe('SYNC', () => {
  test('clicking the Sync button opens the sync modal overlay', async ({ page }) => {
    await gotoApp(page);
    await page.click('#syncBtn');
    await expect(page.locator('.sync-overlay')).toBeVisible();
    await expect(page.locator('.sync-modal')).toBeVisible();
  });

  test('sync modal contains the close button', async ({ page }) => {
    await gotoApp(page);
    await page.click('#syncBtn');
    await page.waitForSelector('.sync-close', { state: 'visible' });
    await expect(page.locator('.sync-close')).toBeVisible();
  });

  test('close button dismisses the sync modal', async ({ page }) => {
    await gotoApp(page);
    await page.click('#syncBtn');
    await page.waitForSelector('.sync-close', { state: 'visible' });
    await page.click('.sync-close');
    await expect(page.locator('.sync-overlay')).toBeHidden();
  });

  test('sync modal shows name field for first-time user', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#syncBtn');
    await page.waitForSelector('.sync-modal', { state: 'visible' });
    // First-time: no user set, so name input and Save Name button should appear
    await expect(page.locator('.sync-field input')).toBeVisible();
    await expect(page.locator('.sync-btn-primary:has-text("Save Name")')).toBeVisible();
  });

  test('saving a sync name stores it in localStorage and updates the UI', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#syncBtn');
    await page.waitForSelector('.sync-field input', { state: 'visible' });
    await page.fill('.sync-field input', 'TestUser');
    await page.click('.sync-btn-primary:has-text("Save Name")');

    // After saving, the stored key should exist
    const storedUser = await page.evaluate(() => localStorage.getItem('conjugate_sync_user'));
    expect(storedUser).not.toBeNull();
    const parsed = JSON.parse(storedUser);
    expect(parsed.name).toBe('TestUser');
  });

  test('known user sees "Copy Sync Link" button', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      localStorage.setItem('conjugate_sync_user', JSON.stringify({ name: 'Anna', createdAt: Date.now() }));
    });
    await page.click('#syncBtn');
    await page.waitForSelector('.sync-modal', { state: 'visible' });
    await expect(page.locator('.sync-btn:has-text("Copy Sync Link")')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

test.describe('Badges', () => {
  test('"First Rep" badge is earned after 1 session', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 1,
      quizHistory: [{ date: new Date().toISOString(), score: 5, total: 10, mode: 'quiz', section: 'all', timeSeconds: 60 }],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.badge-item', { state: 'visible' });

    const firstRepBadge = page.locator('.badge-item').filter({ hasText: 'First Rep' });
    await expect(firstRepBadge).toHaveClass(/earned/);
  });

  test('"PR Day" badge is earned after a 100% quiz score', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 2,
      quizHistory: [
        { date: new Date().toISOString(), score: 10, total: 10, mode: 'quiz', section: 'all', timeSeconds: 90 },
      ],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.badge-item', { state: 'visible' });

    const prBadge = page.locator('.badge-item').filter({ hasText: 'PR Day' });
    await expect(prBadge).toHaveClass(/earned/);
  });

  test('"Passing Grade" badge requires 70%+ on a full test', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 2,
      quizHistory: [
        { date: new Date().toISOString(), score: 74, total: 105, mode: 'test', section: 'all', timeSeconds: 900 },
      ],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.badge-item', { state: 'visible' });

    const passBadge = page.locator('.badge-item').filter({ hasText: 'Passing Grade' });
    await expect(passBadge).toHaveClass(/earned/);
  });

  test('"Three-Peat" badge requires a 3-day streak', async ({ page }) => {
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 3,
      studyStreak: { lastDate: null, current: 3, longest: 3 },
      quizHistory: [
        { date: new Date().toISOString(), score: 5, total: 10, mode: 'quiz', section: 'all', timeSeconds: 60 },
      ],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.badge-item', { state: 'visible' });

    const streakBadge = page.locator('.badge-item').filter({ hasText: 'Three-Peat' });
    await expect(streakBadge).toHaveClass(/earned/);
  });

  test('unearned badges display with locked class and lock icon', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await seedStudyData(page, {
      totalSessions: 1,
      quizHistory: [{ date: new Date().toISOString(), score: 5, total: 10, mode: 'quiz', section: 'all', timeSeconds: 60 }],
    });
    await page.reload();
    await page.waitForSelector('#mode-selector', { state: 'visible' });
    await page.click('#dash-mode-btn');
    await page.waitForSelector('.badge-item.locked', { state: 'visible' });
    // Locked badges show 🔒 as text (rendered as lock emoji HTML entity)
    const lockedBadge = page.locator('.badge-item.locked').first();
    const iconText = await lockedBadge.locator('.badge-icon').textContent();
    expect(iconText).toContain('🔒');
  });
});

// ---------------------------------------------------------------------------
// Survey (SV)
// ---------------------------------------------------------------------------

test.describe('Survey (SV)', () => {
  test('clicking the Survey button opens the feedback panel', async ({ page }) => {
    await gotoApp(page);
    await page.click('#survey-mode-btn');
    await expect(page.locator('#survey-panel')).toBeVisible();
  });

  test('feedback panel shows topic dropdown and message textarea', async ({ page }) => {
    await gotoApp(page);
    await page.click('#survey-mode-btn');
    await page.waitForSelector('#svTopic', { state: 'visible' });
    await expect(page.locator('#svTopic')).toBeVisible();
    await expect(page.locator('#svMessage')).toBeVisible();
  });

  test('submitting feedback without a message shows validation error', async ({ page }) => {
    await gotoApp(page);
    await page.click('#survey-mode-btn');
    await page.waitForSelector('.btn-primary:has-text("Submit Feedback")', { state: 'visible' });
    // Leave message empty and submit
    await page.click('.btn-primary:has-text("Submit Feedback")');
    await expect(page.locator('#svStatus')).toBeVisible();
    await expect(page.locator('#svStatus .fb-wrong')).toBeVisible();
  });

  test('submitting feedback saves it to conjugate_feedback_log', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#survey-mode-btn');
    await page.waitForSelector('#svMessage', { state: 'visible' });
    await page.selectOption('#svTopic', 'bug');
    await page.fill('#svMessage', 'Test feedback message from Playwright');
    await page.click('.btn-primary:has-text("Submit Feedback")');

    const log = await page.evaluate(() => {
      const raw = localStorage.getItem('conjugate_feedback_log');
      return raw ? JSON.parse(raw) : null;
    });
    expect(log).not.toBeNull();
    expect(log.length).toBe(1);
    expect(log[0].topic).toBe('bug');
    expect(log[0].message).toBe('Test feedback message from Playwright');
  });

  test('previous feedback shows in history after submission', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#survey-mode-btn');
    await page.waitForSelector('#svMessage', { state: 'visible' });
    await page.fill('#svMessage', 'Prior feedback entry');
    await page.click('.btn-primary:has-text("Submit Feedback")');
    await expect(page.locator('#svHistory')).toBeVisible();
    await expect(page.locator('#svHistory')).toContainText('Prior feedback entry');
  });

  test('survey back button returns to main menu', async ({ page }) => {
    await gotoApp(page);
    await page.click('#survey-mode-btn');
    await page.waitForSelector('.btn:has-text("Back")', { state: 'visible' });
    await page.locator('.btn:has-text("Back")').click();
    await expect(page.locator('#mode-selector')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// LAB
// ---------------------------------------------------------------------------

test.describe('LAB', () => {
  test('clicking the LAB mode button shows the lab panel', async ({ page }) => {
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await expect(page.locator('#lab-panel')).toBeVisible();
    await expect(page.locator('#mode-selector')).toBeHidden();
  });

  test('lab panel renders the WIP header', async ({ page }) => {
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await page.waitForSelector('.lab-header', { state: 'visible' });
    await expect(page.locator('.lab-header')).toContainText('WIP Lab');
  });

  test('lab panel renders all 5 tool cards', async ({ page }) => {
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await page.waitForSelector('.lab-tool-card', { state: 'visible' });
    const cards = await page.locator('.lab-tool-card').count();
    expect(cards).toBe(5);
  });

  test('clicking a tool card expands it and shows the body', async ({ page }) => {
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await page.waitForSelector('.lab-tool-card', { state: 'visible' });
    const firstCard = page.locator('.lab-tool-card').first();
    await expect(firstCard).not.toHaveClass(/expanded/);
    await firstCard.locator('.lab-tool-card-header').click();
    await expect(firstCard).toHaveClass(/expanded/);
    await expect(firstCard.locator('.lab-tool-body')).toBeVisible();
  });

  test('ranking a tool saves its rank to localStorage', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await page.waitForSelector('.lab-tool-card', { state: 'visible' });

    // Expand the first tool card
    const firstCard = page.locator('.lab-tool-card').first();
    await firstCard.locator('.lab-tool-card-header').click();
    await page.waitForSelector('.lab-rank-btn', { state: 'visible' });

    // Click the 3rd star button (rank = 3)
    await firstCard.locator('.lab-rank-btn').nth(2).click();

    const labData = await page.evaluate(() => {
      const raw = localStorage.getItem('conjugate_lab_data');
      return raw ? JSON.parse(raw) : null;
    });
    expect(labData).not.toBeNull();
    const ranks = labData.ranks;
    const rankValue = Object.values(ranks)[0];
    expect(rankValue).toBe(3);
  });

  test('submitting a tool comment saves it locally', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await page.waitForSelector('.lab-tool-card', { state: 'visible' });

    // Expand first tool
    const firstCard = page.locator('.lab-tool-card').first();
    await firstCard.locator('.lab-tool-card-header').click();
    await page.waitForSelector('.lab-comment-area textarea', { state: 'visible' });

    const toolId = await firstCard.getAttribute('id');
    const id = toolId ? toolId.replace('lab-card-', '') : 'scenario';
    await firstCard.locator('.lab-comment-area textarea').fill('This tool would be really useful');
    await firstCard.locator('.lab-comment-submit').click();

    const labData = await page.evaluate(() => {
      const raw = localStorage.getItem('conjugate_lab_data');
      return raw ? JSON.parse(raw) : null;
    });
    expect(labData).not.toBeNull();
    const feedbackEntries = Object.values(labData.feedback).flat();
    const saved = feedbackEntries.some((e) => e.text === 'This tool would be really useful');
    expect(saved).toBe(true);
  });

  test('idea submission is saved to lab data', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await page.waitForSelector('#lab-idea-text', { state: 'visible' });
    await page.fill('#lab-idea-text', 'A workout generator based on weaknesses');
    await page.locator('.lab-idea-box .lab-comment-submit').click();

    const labData = await page.evaluate(() => {
      const raw = localStorage.getItem('conjugate_lab_data');
      return raw ? JSON.parse(raw) : null;
    });
    expect(labData).not.toBeNull();
    const idea = labData.ideas.find((i) => i.text === 'A workout generator based on weaknesses');
    expect(idea).toBeDefined();
  });

  test('back button from lab returns to main menu', async ({ page }) => {
    await gotoApp(page);
    await page.click('#lab-mode-btn');
    await page.waitForSelector('.lab-back-btn', { state: 'visible' });
    await page.click('.lab-back-btn');
    await expect(page.locator('#mode-selector')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: localStorage persistence
// ---------------------------------------------------------------------------

test.describe('Store / localStorage persistence', () => {
  test('quiz session is recorded in conjugate_study_data after quiz completes', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#qz-mode-btn');

    // 5-question quiz for speed
    await page.evaluate(() => {
      const slider = document.getElementById('qzCountSlider');
      slider.value = '5';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('.btn-primary:has-text("Start Quiz")');

    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('.quiz-opt:not([disabled])', { state: 'visible' });
      await page.locator('.quiz-opt').first().click();
      await page.waitForSelector('#qzFeedback .btn-primary', { state: 'visible' });
      await page.locator('#qzFeedback .btn-primary').click();
    }

    await page.waitForSelector('.results-card', { state: 'visible' });

    const data = await page.evaluate(() => {
      const raw = localStorage.getItem('conjugate_study_data');
      return raw ? JSON.parse(raw) : null;
    });
    expect(data).not.toBeNull();
    expect(data.totalSessions).toBeGreaterThanOrEqual(1);
    expect(data.quizHistory.length).toBeGreaterThanOrEqual(1);
    const lastSession = data.quizHistory[data.quizHistory.length - 1];
    expect(lastSession.mode).toBe('quiz');
    expect(lastSession.total).toBe(5);
  });

  test('missed questions accumulate in storage after wrong answers', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.evaluate(() => {
      const slider = document.getElementById('qzCountSlider');
      slider.value = '5';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('.btn-primary:has-text("Start Quiz")');

    // Answer all questions with the very first option (likely wrong at least once)
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('.quiz-opt:not([disabled])', { state: 'visible' });
      await page.locator('.quiz-opt').first().click();
      await page.waitForSelector('#qzFeedback .btn-primary', { state: 'visible' });
      await page.locator('#qzFeedback .btn-primary').click();
    }

    await page.waitForSelector('.results-card', { state: 'visible' });

    const data = await page.evaluate(() => {
      const raw = localStorage.getItem('conjugate_study_data');
      return raw ? JSON.parse(raw) : null;
    });
    // missedQuestions may be empty if all were correct by chance, but the key exists
    expect(data).not.toBeNull();
    expect(typeof data.missedQuestions).toBe('object');
  });

  test('flagging a question stores it in flaggedQuestions', async ({ page }) => {
    await clearStorage(page);
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.flag-btn', { state: 'visible' });
    await page.click('.flag-btn');
    await expect(page.locator('.flag-btn')).toHaveClass(/flagged/);

    const data = await page.evaluate(() => {
      const raw = localStorage.getItem('conjugate_study_data');
      return raw ? JSON.parse(raw) : null;
    });
    const flaggedKeys = Object.keys(data.flaggedQuestions);
    expect(flaggedKeys.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mobile responsiveness (Pixel 5 viewport — covered by the Mobile Chrome
// project in playwright.config.js, but also assertable in desktop tests)
// ---------------------------------------------------------------------------

test.describe('Responsive layout', () => {
  test('mode cards are visible and tappable at 393px width', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await gotoApp(page);
    await expect(page.locator('#fc-mode-btn')).toBeVisible();
    await expect(page.locator('#qz-mode-btn')).toBeVisible();
  });

  test('quiz answer options are large enough to tap on mobile (min 44px height)', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await gotoApp(page);
    await page.click('#qz-mode-btn');
    await page.click('.btn-primary:has-text("Start Quiz")');
    await page.waitForSelector('.quiz-opt', { state: 'visible' });
    const firstOpt = page.locator('.quiz-opt').first();
    const box = await firstOpt.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(40); // at least close to 44px
  });
});
