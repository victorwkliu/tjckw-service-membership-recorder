/**
 * TJCKW Voting Corporate Member eligibility (proposed by-law §§4.02–4.07, 4.09–4.11, 5.06).
 *
 * Active status, attendance, ministry/RE group, offerings, and volunteer service
 * must NEVER create or remove corporate voting rights.
 *
 * Missing legal facts → Needs Review (never infer Eligible).
 */
(function (root) {
  'use strict';

  const RESULT = {
    ELIGIBLE: 'Eligible',
    NOT_ELIGIBLE: 'Not Eligible',
    NEEDS_REVIEW: 'Needs Review'
  };

  function normalizeLabel(s) {
    return (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function emptyCorporateVoting() {
    return {
      goodStandingCertified: null,
      goodStandingCertifiedAt: '',
      primaryRegistrationSince: '',
      residenceInKwSince: '',
      temporaryAbsenceApproved: null,
      temporaryAbsenceNote: '',
      applicationCompleted: null,
      consentCompleted: null,
      purposesAcknowledged: null,
      boardAdmitted: null,
      boardAdmissionDate: '',
      boardResolutionRef: '',
      legalRegisterEnteredAt: '',
      legalRegisterCurrent: null,
      legalRegisterEndedAt: '',
      legalRegisterEndReason: ''
    };
  }

  function ensureCorporateVoting(person) {
    const base = emptyCorporateVoting();
    const raw = person && typeof person === 'object' ? (person.corporateVoting || {}) : {};
    return { ...base, ...raw };
  }

  function parseISODate(value) {
    if (!value) return null;
    const s = String(value).trim();
    if (!s) return null;
    // Accept YYYY-MM-DD or YYYY-MM
    const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (!m) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = m[3] ? Number(m[3]) : 1;
    const d = new Date(y, mo - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toDateOnly(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function monthsBetween(earlier, later) {
    const a = toDateOnly(earlier);
    const b = toDateOnly(later);
    let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months -= 1;
    return months;
  }

  function getMembershipCategory(person) {
    if (!person) return '';
    const raw = (person.membershipCategory || person.category || '').toString().trim();
    const n = normalizeLabel(raw);
    if (n === 'truth seeker' || n === 'true seeker') return 'True Seeker';
    if (n === 'visitor' || n === 'visiting member') return 'Visiting Member';
    if (n === 'member') return 'Member';
    if (raw) return raw;
    const statusN = normalizeLabel(person.status);
    if (statusN === 'true seeker' || statusN === 'truth seeker') return 'True Seeker';
    if (statusN === 'visiting member' || statusN === 'visitor') return 'Visiting Member';
    return 'Member';
  }

  /**
   * Age as of meetingRecordDate using birthYear + optional birthMonth.
   * Returns { ok:true, age } | { ok:false, reason:'missing'|'under18', age }.
   * NEVER infers age from RE/ministry group.
   */
  function ageAsOfRecordDate(person, meetingRecordDate) {
    const record = toDateOnly(meetingRecordDate);

    // Prefer full dateOfBirth (YYYY-MM-DD) when present.
    let birth = null;
    const dob = person?.dateOfBirth ? String(person.dateOfBirth).trim() : '';
    if (dob) {
      birth = parseISODate(dob);
    }
    if (!birth) {
      const year = person?.birthYear ? parseInt(String(person.birthYear), 10) : NaN;
      if (!Number.isFinite(year) || year < 1900 || year > record.getFullYear()) {
        return { ok: false, reason: 'missing', age: null };
      }
      const month = person?.birthMonth ? parseInt(String(person.birthMonth), 10) : NaN;
      if (!Number.isFinite(month) || month < 1 || month > 12) {
        return { ok: false, reason: 'missing', age: null };
      }
      const dayRaw = person?.birthDay ? parseInt(String(person.birthDay), 10) : NaN;
      if (Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31) {
        birth = new Date(year, month - 1, dayRaw);
      } else {
        // Without a birth day, use the last day of the birth month (conservative).
        birth = new Date(year, month, 0);
      }
    }
    if (!birth || Number.isNaN(birth.getTime())) {
      return { ok: false, reason: 'missing', age: null };
    }

    birth = toDateOnly(birth);
    let age = record.getFullYear() - birth.getFullYear();
    const hadBirthday =
      record.getMonth() > birth.getMonth() ||
      (record.getMonth() === birth.getMonth() && record.getDate() >= birth.getDate());
    if (!hadBirthday) age -= 1;
    if (age < 18) return { ok: false, reason: 'under18', age };
    return { ok: true, age };
  }

  function addReason(list, code, message, severity) {
    list.push({ code, message, severity });
  }

  /**
   * @param {object} person - member record
   * @param {Date|string} meetingRecordDate - corporate meeting record date
   * @returns {{
   *   result: 'Eligible'|'Not Eligible'|'Needs Review',
   *   text: string,
   *   reasons: Array<{code,message,severity}>,
   *   detail: string,
   *   eligible: boolean
   * }}
   */
  function evaluateVoterEligibility(person, meetingRecordDate) {
    const reasons = [];
    const recordDate = parseISODate(
      meetingRecordDate instanceof Date
        ? meetingRecordDate.toISOString().slice(0, 10)
        : meetingRecordDate
    ) || toDateOnly(new Date());

    if (!person || typeof person !== 'object') {
      addReason(reasons, 'NO_PERSON', 'No member record provided.', 'fail');
      return finalize(RESULT.NOT_ELIGIBLE, reasons);
    }

    const cv = ensureCorporateVoting(person);
    const category = getMembershipCategory(person);
    const catN = normalizeLabel(category);

    // 1. Age 18+ — never infer from RE/ministry
    const ageInfo = ageAsOfRecordDate(person, recordDate);
    if (ageInfo.reason === 'missing') {
      addReason(reasons, 'DOB_MISSING', 'Date of birth is missing or unverified.', 'review');
    } else if (ageInfo.reason === 'under18') {
      addReason(reasons, 'UNDER_AGE', `Under age 18 as of the meeting record date (age ${ageInfo.age}).`, 'fail');
    }

    // 2. Congregational Member (local) — Visiting / True Seeker are not Voting Corporate Members
    if (catN === 'true seeker' || catN === 'truth seeker') {
      addReason(reasons, 'NOT_CONGREGATIONAL', 'True Seeker is not a Congregational Member.', 'fail');
    } else if (catN === 'visiting member' || catN === 'visitor') {
      addReason(reasons, 'VISITING_MEMBER', 'Visiting Member is registered with another congregation.', 'fail');
    } else if (catN !== 'member') {
      addReason(reasons, 'CATEGORY_UNCLEAR', 'Congregational membership category is unclear.', 'review');
    }

    // Inactive alone does NOT remove voting rights (by-law). Only note for operators.
    // (No fail/review solely from status === Inactive.)

    // 3. Spiritual good standing certified by Church Council
    if (cv.goodStandingCertified === true) {
      // ok
    } else if (cv.goodStandingCertified === false) {
      addReason(reasons, 'NOT_GOOD_STANDING', 'Church Council has not certified spiritual good standing.', 'fail');
    } else {
      addReason(reasons, 'GOOD_STANDING_PENDING', 'Good-standing certification is not recorded.', 'review');
    }

    // 4. Six months primary local registration in KW
    const regSince = parseISODate(cv.primaryRegistrationSince);
    if (!regSince) {
      addReason(reasons, 'REGISTRATION_DATE_MISSING', 'Primary local registration date is missing.', 'review');
    } else if (monthsBetween(regSince, recordDate) < 6) {
      addReason(reasons, 'REGISTRATION_TOO_RECENT', 'Primary local registration is less than six continuous months as of the record date.', 'fail');
    }

    // 5. Six months residence in KW, unless approved temporary absence
    const resSince = parseISODate(cv.residenceInKwSince);
    if (cv.temporaryAbsenceApproved === true) {
      // Approved temporary absence may preserve eligibility (study/work/health/ministry).
    } else if (!resSince) {
      addReason(reasons, 'RESIDENCE_DATE_MISSING', 'Kitchener–Waterloo residence start date is missing (or temporary-absence approval not recorded).', 'review');
    } else if (monthsBetween(resSince, recordDate) < 6) {
      addReason(reasons, 'RESIDENCE_TOO_RECENT', 'Residence in Kitchener–Waterloo is less than six continuous months as of the record date.', 'fail');
    }

    // 6–7. Corporate application, consent, purposes acknowledgement
    if (cv.applicationCompleted === true) {
      // ok
    } else if (cv.applicationCompleted === false) {
      addReason(reasons, 'APPLICATION_MISSING', 'Corporate membership application is not completed.', 'fail');
    } else {
      addReason(reasons, 'APPLICATION_PENDING', 'Corporate membership application / completion is not recorded.', 'review');
    }

    if (cv.consentCompleted === true) {
      // ok
    } else if (cv.consentCompleted === false) {
      addReason(reasons, 'CONSENT_MISSING', 'Legal-register consent is not completed.', 'fail');
    } else {
      addReason(reasons, 'CONSENT_PENDING', 'Legal-register consent is not recorded.', 'review');
    }

    if (cv.purposesAcknowledged === true) {
      // ok
    } else if (cv.purposesAcknowledged === false) {
      addReason(reasons, 'PURPOSES_NOT_ACKNOWLEDGED', 'Acknowledgement of charitable purposes / by-law compliance is not completed.', 'fail');
    } else {
      addReason(reasons, 'PURPOSES_PENDING', 'Acknowledgement of charitable purposes / by-law compliance is not recorded.', 'review');
    }

    // 8. Board admission by resolution on or before record date
    if (cv.boardAdmitted === true) {
      const admittedAt = parseISODate(cv.boardAdmissionDate);
      if (!admittedAt) {
        addReason(reasons, 'BOARD_DATE_MISSING', 'Board admission is marked but the admission date is missing.', 'review');
      } else if (toDateOnly(admittedAt) > recordDate) {
        addReason(reasons, 'BOARD_AFTER_RECORD_DATE', 'Board admission occurred after the meeting record date.', 'fail');
      }
    } else if (cv.boardAdmitted === false) {
      addReason(reasons, 'NOT_BOARD_ADMITTED', 'Board has not admitted the person as a Voting Corporate Member.', 'fail');
    } else {
      addReason(reasons, 'BOARD_ADMISSION_PENDING', 'Board admission by resolution is not recorded.', 'review');
    }

    // 9–10. Legal corporate membership register
    const enteredAt = parseISODate(cv.legalRegisterEnteredAt);
    if (!enteredAt) {
      addReason(reasons, 'REGISTER_ENTRY_MISSING', 'Legal corporate membership register entry date is missing.', 'review');
    } else if (toDateOnly(enteredAt) > recordDate) {
      addReason(reasons, 'REGISTER_AFTER_RECORD_DATE', 'Legal-register entry occurred after the meeting record date.', 'fail');
    }

    if (cv.legalRegisterCurrent === true) {
      const endedAt = parseISODate(cv.legalRegisterEndedAt);
      if (endedAt && toDateOnly(endedAt) <= recordDate) {
        addReason(reasons, 'REGISTER_ENDED', `Corporate membership ended on or before the record date (${cv.legalRegisterEndReason || 'ended'}).`, 'fail');
      }
    } else if (cv.legalRegisterCurrent === false) {
      const endedAt = parseISODate(cv.legalRegisterEndedAt);
      if (endedAt && toDateOnly(endedAt) <= recordDate) {
        addReason(reasons, 'REGISTER_ENDED', `Corporate membership ended on or before the record date (${cv.legalRegisterEndReason || 'ended'}).`, 'fail');
      } else if (endedAt && toDateOnly(endedAt) > recordDate) {
        // Ended after record date — still current on record date
      } else {
        addReason(reasons, 'REGISTER_NOT_CURRENT', 'Legal-register status is not current.', 'fail');
      }
    } else {
      addReason(reasons, 'REGISTER_STATUS_UNCLEAR', 'Legal-register status is unclear.', 'review');
    }

    const hasFail = reasons.some(r => r.severity === 'fail');
    const hasReview = reasons.some(r => r.severity === 'review');
    if (hasFail) return finalize(RESULT.NOT_ELIGIBLE, reasons);
    if (hasReview) return finalize(RESULT.NEEDS_REVIEW, reasons);
    return finalize(RESULT.ELIGIBLE, reasons);
  }

  function finalize(result, reasons) {
    const detail = reasons.map(r => r.message).filter(Boolean).join('; ');
    return {
      result,
      text: result,
      reasons,
      detail: detail || (result === RESULT.ELIGIBLE ? 'All required legal elements confirmed.' : ''),
      eligible: result === RESULT.ELIGIBLE,
      // Back-compat colour hints for UI badges
      color:
        result === RESULT.ELIGIBLE
          ? 'bg-emerald-100 text-emerald-800'
          : result === RESULT.NEEDS_REVIEW
            ? 'bg-amber-100 text-amber-900'
            : 'bg-rose-50 text-rose-700'
    };
  }

  function migrateMemberCorporateVoting(person) {
    if (!person || typeof person !== 'object') return person;
    person.corporateVoting = ensureCorporateVoting(person);
    return person;
  }

  const api = {
    RESULT,
    emptyCorporateVoting,
    ensureCorporateVoting,
    migrateMemberCorporateVoting,
    evaluateVoterEligibility,
    ageAsOfRecordDate,
    getMembershipCategory,
    monthsBetween,
    parseISODate
  };

  root.VoterEligibility = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
