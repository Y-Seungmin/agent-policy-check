import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatFailure, renderErrorSummary, renderSummary } from '../src/report.js';
import type { PolicyViolation } from '../src/check.js';

describe('Action report', () => {
  it('renders deterministic pass and skip summaries', () => {
    assert.equal(
      renderSummary({ result: 'passed', violations: [], changedFileCount: 2 }),
      `# policy-check\n\n✅ Passed — 2 changed files evaluated.\n`,
    );
    assert.equal(
      renderSummary({ result: 'skipped', violations: [] }),
      `# policy-check\n\n⏭️ Skipped — No policy file was found at \`.policy-check.yml\` on the pull request base commit.\n`,
    );
  });

  it('includes matched files and escapes Markdown table content', () => {
    const summary = renderSummary({
      result: 'failed',
      changedFileCount: 1,
      violations: [{
        rule: 'auth | <critical>',
        matchedPaths: ['src/auth/a|b.ts'],
        missing: ['tests/<auth>/**'],
      }],
    });

    assert.match(summary, /auth &#124; &lt;critical&gt;/);
    assert.match(summary, /src\/auth\/a&#124;b\.ts/);
    assert.match(summary, /tests\/&lt;auth&gt;\/\*\*/);
  });

  it('caps large reports and failure messages', () => {
    const violations: PolicyViolation[] = Array.from({ length: 30 }, (_, index) => ({
      rule: `rule ${index}`,
      matchedPaths: [`src/file-${index}.ts`],
      missing: ['tests/**'],
    }));

    const summary = renderSummary({
      result: 'failed',
      violations,
      changedFileCount: 30,
    });
    assert.match(summary, /and 5 more violations/);
    assert.doesNotMatch(summary, /rule 29 \|/);

    const failure = formatFailure(violations);
    assert.match(failure, /and 20 more violations/);
    assert.ok(failure.length < 4_000);

    const manyRequirements = formatFailure([{
      rule: 'one noisy rule',
      matchedPaths: ['src/file.ts'],
      missing: Array.from(
        { length: 100 },
        (_, index) => `${index}-${'requirement'.repeat(50)}`,
      ),
    }]);
    assert.match(manyRequirements, /and 90 more requirements/);
    assert.ok(manyRequirements.length < 4_000);
  });

  it('escapes operational errors for the job summary', () => {
    assert.equal(
      renderErrorSummary('bad | <response>\nsecond line'),
      '# policy-check\n\n❌ Failed — policy-check could not complete.\n\n'
        + '**Error:** bad &#124; &lt;response&gt; second line\n',
    );
  });
});
