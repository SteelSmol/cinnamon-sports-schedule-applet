/**
 * Minimal test runner for Sports Schedule Applet.
 * Run with: node tests/runner.js
 *
 * Tests pure logic only — no GJS/Cinnamon dependencies.
 */

let totalPassed = 0;
let totalFailed = 0;
const errors = [];

function describe(name, fn) {
    console.log(`\n  ${name}`);
    fn();
}

function it(name, fn) {
    try {
        fn();
        totalPassed++;
        console.log(`    \x1b[32m✓\x1b[0m ${name}`);
    } catch (e) {
        totalFailed++;
        errors.push({ name, error: e.message });
        console.log(`    \x1b[31m✗\x1b[0m ${name}`);
        console.log(`      \x1b[31m${e.message}\x1b[0m`);
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertNotNull(value, msg = '') {
    if (value === null || value === undefined) {
        throw new Error(`${msg}Expected non-null value, got ${value}`);
    }
}

function assertNull(value, msg = '') {
    if (value !== null && value !== undefined) {
        throw new Error(`${msg}Expected null, got ${JSON.stringify(value)}`);
    }
}

function assertTrue(value, msg = '') {
    if (!value) {
        throw new Error(`${msg}Expected truthy, got ${JSON.stringify(value)}`);
    }
}

function assertFalse(value, msg = '') {
    if (value) {
        throw new Error(`${msg}Expected falsy, got ${JSON.stringify(value)}`);
    }
}

function assertGreaterThan(actual, expected, msg = '') {
    if (actual <= expected) {
        throw new Error(`${msg}Expected ${actual} > ${expected}`);
    }
}

function assertLessThanOrEqual(actual, expected, msg = '') {
    if (actual > expected) {
        throw new Error(`${msg}Expected ${actual} <= ${expected}`);
    }
}

// Export for test files
module.exports = {
    describe,
    it,
    assertEqual,
    assertNotNull,
    assertNull,
    assertTrue,
    assertFalse,
    assertGreaterThan,
    assertLessThanOrEqual,
    getSummary: () => ({ totalPassed, totalFailed, errors })
};

// Run all test files when executed directly
if (require.main === module) {
    console.log('\n  Sports Schedule Applet — Test Suite');
    console.log('  ===================================');

    require('./game-selection.test');
    require('./espn-parsing.test');
    require('./refresh-delay.test');
    require('./cache-validity.test');

    console.log('\n  -----------------------------------');
    console.log(`  \x1b[32m${totalPassed} passing\x1b[0m`);
    if (totalFailed > 0) {
        console.log(`  \x1b[31m${totalFailed} failing\x1b[0m`);
    }
    console.log('');

    process.exit(totalFailed > 0 ? 1 : 0);
}
