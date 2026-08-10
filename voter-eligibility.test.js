/**
 * Node tests for voter-eligibility.js
 * Run: node voter-eligibility.test.js
 */
const assert = require('assert');
const VE = require('./voter-eligibility.js');

function person(overrides = {}) {
  const { corporateVoting, ...rest } = overrides;
  return {
    id: 'm1',
    firstName: 'Test',
    lastName: 'Member',
    name: 'Test Member',
    status: 'Active',
    membershipCategory: 'Member',
    birthYear: '1990',
    birthMonth: '01',
    ...rest,
    corporateVoting: { ...VE.emptyCorporateVoting(), ...(corporateVoting || {}) }
  };
}

function qualified(extraCv = {}, extraPerson = {}) {
  return person({
    ...extraPerson,
    corporateVoting: {
      goodStandingCertified: true,
      goodStandingCertifiedAt: '2025-01-01',
      primaryRegistrationSince: '2024-01-01',
      residenceInKwSince: '2024-01-01',
      temporaryAbsenceApproved: null,
      applicationCompleted: true,
      consentCompleted: true,
      purposesAcknowledged: true,
      boardAdmitted: true,
      boardAdmissionDate: '2025-06-01',
      boardResolutionRef: 'BR-1',
      legalRegisterEnteredAt: '2025-06-15',
      legalRegisterCurrent: true,
      legalRegisterEndedAt: '',
      legalRegisterEndReason: '',
      ...extraCv
    }
  });
}

const RECORD = '2026-07-22';

// 1. Active adult but no Board admission → Needs Review
{
  const r = VE.evaluateVoterEligibility(person(), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NEEDS_REVIEW);
  assert.ok(r.reasons.some(x => x.code === 'BOARD_ADMISSION_PENDING'));
  assert.strictEqual(r.eligible, false);
}

// 2. Current Voting Corporate Member remains Eligible (attendance irrelevant)
{
  const r = VE.evaluateVoterEligibility(qualified(), RECORD);
  assert.strictEqual(r.result, VE.RESULT.ELIGIBLE);
  assert.strictEqual(r.eligible, true);
}

// 3. Missing birth date → Needs Review; never infer age from RE group
{
  const r = VE.evaluateVoterEligibility(qualified({}, { birthYear: '', birthMonth: '', group: 'Choir' }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NEEDS_REVIEW);
  assert.ok(r.reasons.some(x => x.code === 'DOB_MISSING'));
}
{
  const r = VE.evaluateVoterEligibility(qualified({}, { birthYear: '', birthMonth: '', group: 'RE(E)' }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NEEDS_REVIEW);
  assert.ok(r.reasons.some(x => x.code === 'DOB_MISSING'));
}
{
  // Year alone is insufficient — Needs Review (do not guess 18+)
  const r = VE.evaluateVoterEligibility(qualified({}, { birthYear: '1990', birthMonth: '' }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NEEDS_REVIEW);
  assert.ok(r.reasons.some(x => x.code === 'DOB_MISSING'));
}

// 4. Under 18 → Not Eligible
{
  const r = VE.evaluateVoterEligibility(qualified({}, { birthYear: '2015', birthMonth: '01' }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NOT_ELIGIBLE);
  assert.ok(r.reasons.some(x => x.code === 'UNDER_AGE'));
}

// 5. Visiting Member age 18+ → Not Eligible
{
  const r = VE.evaluateVoterEligibility(qualified({}, { membershipCategory: 'Visiting Member' }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NOT_ELIGIBLE);
  assert.ok(r.reasons.some(x => x.code === 'VISITING_MEMBER'));
}

// 6. Approved temporary absence may remain Eligible
{
  const r = VE.evaluateVoterEligibility(qualified({
    residenceInKwSince: '',
    temporaryAbsenceApproved: true,
    temporaryAbsenceNote: 'Study'
  }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.ELIGIBLE);
}

// 7. Inactive but still current in legal register → Eligible
{
  const r = VE.evaluateVoterEligibility(qualified({}, { status: 'Inactive' }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.ELIGIBLE);
}

// 8. Terminated before record date → Not Eligible
{
  const r = VE.evaluateVoterEligibility(qualified({
    legalRegisterCurrent: false,
    legalRegisterEndedAt: '2026-01-01',
    legalRegisterEndReason: 'resignation'
  }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NOT_ELIGIBLE);
  assert.ok(r.reasons.some(x => x.code === 'REGISTER_ENDED'));
}

// 9. Board admission after record date → Not Eligible
{
  const r = VE.evaluateVoterEligibility(qualified({ boardAdmissionDate: '2026-08-01' }), RECORD);
  assert.strictEqual(r.result, VE.RESULT.NOT_ELIGIBLE);
  assert.ok(r.reasons.some(x => x.code === 'BOARD_AFTER_RECORD_DATE'));
}

// 10. All requirements confirmed → Eligible
{
  const r = VE.evaluateVoterEligibility(qualified(), RECORD);
  assert.strictEqual(r.result, VE.RESULT.ELIGIBLE);
}

console.log('voter-eligibility.test.js: all tests passed');
