/**
 * Local Google My Maps → member address import helpers.
 * Addresses come only from the user-selected CSV at runtime (never from constants).
 * Label→member name targets are reviewed match rules (names only).
 */
(function (root) {
  'use strict';

  /** Reviewed Google household label → exact existing member full names (no addresses). */
  const REVIEWED_LABEL_TARGETS = Object.freeze({
    'bin bin': Object.freeze(['BinBin Liang']),
    'grace': Object.freeze(['Grace Lu']),
    'monique': Object.freeze(['Monique Chiam']),
    'mandy': Object.freeze(['Mandy Liu']),
    'matthew & jing': Object.freeze(['Matthew Chen', 'Jill Jing Zhen']),
    'jim & ping': Object.freeze(['Jim Chiam', 'Ping Chiam']),
    'quinn': Object.freeze(['Quinn Wei']),
    'cheryl & david': Object.freeze(['Cheryl Cheng', 'David Tate']),
    'brandon & xiaoting': Object.freeze(['Brandon Ng', 'Xiaoting Guo']),
    'victor & polly': Object.freeze(['Victor Liu', 'Polly Lin']),
    'chen chou': Object.freeze(['Chou Chen Liu']),
    'jack & cindy': Object.freeze(['Jack He', 'Cindy Jiang']),
    'james & lily': Object.freeze(['James Wu', 'Lily Wu'])
  });

  const RESULT = Object.freeze({
    READY: 'Ready',
    UNCHANGED: 'Unchanged',
    CONFLICT: 'Conflict',
    REVIEW_REQUIRED: 'Review Required',
    INVALID: 'Invalid',
    SKIPPED: 'Skipped'
  });

  function normalizeLabel(s) {
    return (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizeName(s) {
    return normalizeLabel(s);
  }

  function memberDisplayName(m) {
    if (!m) return '';
    return (m.name || `${m.firstName || ''} ${m.lastName || ''}`).toString().trim();
  }

  function splitCsvAwareLine(line) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === ',' && !inQuotes) {
        fields.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    fields.push(cur);
    return fields;
  }

  /**
   * Parse WKT POINT (longitude latitude) — Google My Maps order.
   * Returns { longitude, latitude } or null.
   */
  function parseWktPoint(wkt) {
    const raw = (wkt || '').toString().trim().replace(/^"|"$/g, '');
    const m = raw.match(/POINT\s*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)/i);
    if (!m) return null;
    const longitude = Number(m[1]);
    const latitude = Number(m[2]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    return { longitude, latitude };
  }

  function inferCountry(province, postcode) {
    const prov = (province || '').toString().trim().toUpperCase();
    const pc = (postcode || '').toString().replace(/\s+/g, '').toUpperCase();
    const usStates = new Set([
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
      'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
      'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
      'WI', 'WY', 'DC'
    ]);
    const caProv = new Set([
      'ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU'
    ]);
    if (usStates.has(prov) && !caProv.has(prov)) return 'US';
    if (/^\d{5}(-\d{4})?$/.test(pc)) return 'US';
    if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(pc)) return 'CA';
    if (caProv.has(prov)) return 'CA';
    return 'CA';
  }

  function countryDisplay(code) {
    const c = (code || '').toString().trim().toUpperCase();
    if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return 'United States';
    if (c === 'CA' || c === 'CAN' || c === 'CANADA') return 'Canada';
    return code || '';
  }

  function countryCode(value) {
    const c = (value || '').toString().trim().toUpperCase();
    if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return 'US';
    if (c === 'CA' || c === 'CAN' || c === 'CANADA') return 'CA';
    return c;
  }

  /** Country-aware postcode formatting (does not reject US ZIP with CA rules). */
  function formatPostcode(value, country) {
    const code = countryCode(country) || inferCountry('', value);
    const raw = (value || '').toString().trim();
    if (!raw) return '';
    if (code === 'US') {
      const digits = raw.replace(/\D/g, '').slice(0, 9);
      if (digits.length <= 5) return digits;
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    if (!cleaned) return '';
    if (cleaned.length <= 3) return cleaned;
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`;
  }

  function isValidPostcode(value, country) {
    const code = countryCode(country) || inferCountry('', value);
    const pc = (value || '').toString().trim();
    if (!pc) return false;
    if (code === 'US') return /^\d{5}(-\d{4})?$/.test(pc);
    const cleaned = pc.replace(/\s+/g, '').toUpperCase();
    return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned);
  }

  function composeAddress(street, city, province, postcode) {
    return [street, city, province, postcode].map((x) => (x || '').toString().trim()).filter(Boolean).join(', ');
  }

  function addressFingerprint(parts) {
    const street = normalizeName(parts.street || '');
    const city = normalizeName(parts.city || '');
    const province = normalizeName(parts.province || '');
    const postcode = (parts.postcode || '').toString().replace(/\s+/g, '').toUpperCase();
    const country = countryCode(parts.country || '');
    return [street, city, province, postcode, country].join('|');
  }

  function memberHasNonblankAddress(m) {
    if (!m) return false;
    return !!(
      (m.street || '').toString().trim()
      || (m.city || '').toString().trim()
      || (m.province || '').toString().trim()
      || (m.postcode || '').toString().trim()
      || (m.address || '').toString().trim()
    );
  }

  function memberExistingAddressText(m) {
    if (!m) return '';
    const composed = composeAddress(m.street, m.city, m.province, m.postcode);
    return composed || (m.address || '').toString().trim();
  }

  function looksLikeProvinceCode(s) {
    return /^[A-Za-z]{2}$/.test((s || '').toString().trim());
  }

  function looksLikePostcodeToken(s) {
    const t = (s || '').toString().trim();
    if (!t) return false;
    if (/^\d{5}(-\d{4})?$/.test(t)) return true;
    const ca = t.replace(/\s+/g, '').toUpperCase();
    return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(ca);
  }

  /** Split "ON L7M 3V4" / "MI 48084" when Google My Maps omits the comma. */
  function splitCombinedProvincePostcode(value) {
    const m = (value || '').toString().trim().match(/^([A-Za-z]{2})\s+(.+)$/);
    if (!m) return null;
    const province = m[1].toUpperCase();
    const postcode = m[2].trim();
    if (!looksLikeProvinceCode(province)) return null;
    if (!looksLikePostcodeToken(postcode)) return null;
    return { province, postcode };
  }

  /**
   * Malformed Google My Maps CSV line:
   * WKT, label, street parts..., city, province/state, postal/ZIP
   * Also supports province+postal combined in the last field: "ON L7M 3V4".
   */
  function parseLocationFields(fields) {
    if (!fields || fields.length < 4) {
      return { error: 'Too few columns' };
    }
    const wkt = (fields[0] || '').trim();
    const label = (fields[1] || '').trim();
    const coords = parseWktPoint(wkt);
    if (!label) return { error: 'Missing label' };
    if (!coords) return { error: 'Invalid WKT POINT' };

    let street = '';
    let city = '';
    let province = '';
    let postcode = '';

    const last = (fields[fields.length - 1] || '').trim();
    const secondLast = fields.length >= 2 ? (fields[fields.length - 2] || '').trim() : '';
    const thirdLast = fields.length >= 3 ? (fields[fields.length - 3] || '').trim() : '';

    // Preferred: separate province + postal (e.g. Chen Chou …,Kitchener,ON,N2P 2A1)
    if (
      fields.length >= 5
      && looksLikePostcodeToken(last)
      && looksLikeProvinceCode(secondLast)
    ) {
      postcode = last;
      province = secondLast.toUpperCase();
      city = thirdLast;
      street = fields.slice(2, fields.length - 3).map((p) => (p || '').trim()).filter(Boolean).join(' ');
    } else {
      // Common My Maps export: "... , City, ON L7M 3V4"
      const combined = splitCombinedProvincePostcode(last);
      if (!combined || fields.length < 4) {
        return { error: 'Incomplete address', label };
      }
      province = combined.province;
      postcode = combined.postcode;
      city = secondLast;
      street = fields.slice(2, fields.length - 2).map((p) => (p || '').trim()).filter(Boolean).join(' ');
    }

    street = street.replace(/\s+/g, ' ').trim();
    city = city.replace(/\s+/g, ' ').trim();
    if (!street || !city || !province || !postcode) {
      return { error: 'Incomplete address', label, street, city, province, postcode };
    }
    const country = inferCountry(province, postcode);
    const formattedPostcode = formatPostcode(postcode, country);
    if (!isValidPostcode(formattedPostcode, country)) {
      return { error: 'Invalid postal/ZIP for country', label, street, city, province, postcode: formattedPostcode, country };
    }
    return {
      label,
      street,
      city,
      province,
      postcode: formattedPostcode,
      country,
      countryDisplay: countryDisplay(country),
      address: composeAddress(street, city, province, formattedPostcode),
      longitude: coords.longitude,
      latitude: coords.latitude,
      wkt
    };
  }

  function parseGoogleMyMapsCsv(text) {
    const lines = (text || '').toString().replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
    const locations = [];
    const errors = [];
    let start = 0;
    if (lines.length && /^wkt\s*,/i.test(lines[0])) start = 1;
    for (let i = start; i < lines.length; i++) {
      const fields = splitCsvAwareLine(lines[i]);
      const parsed = parseLocationFields(fields);
      if (parsed.error && !parsed.label) {
        errors.push({ line: i + 1, error: parsed.error, raw: lines[i].slice(0, 120) });
        continue;
      }
      if (parsed.error) {
        locations.push({
          ...parsed,
          invalid: true,
          error: parsed.error
        });
        continue;
      }
      locations.push(parsed);
    }
    return { locations, errors, sourceLocationCount: locations.length };
  }

  function reviewedTargetsForLabel(label) {
    const key = normalizeLabel(label);
    return REVIEWED_LABEL_TARGETS[key] || null;
  }

  function findMembersByReviewedName(members, targetName) {
    const want = normalizeName(targetName);
    return (members || []).filter((m) => normalizeName(memberDisplayName(m)) === want);
  }

  /**
   * Build preview rows: one row per (location × reviewed member target).
   * Never creates members; never copies to unnamed family members.
   */
  function buildAddressImportPreview(locations, members, options = {}) {
    const conflictChoices = options.conflictChoices || {};
    const rows = [];
    let memberMatchCount = 0;
    const matchedIds = new Set();

    for (const loc of locations || []) {
      const targets = reviewedTargetsForLabel(loc.label);
      if (!targets) {
        rows.push({
          googleLabel: loc.label || '',
          targetName: '',
          memberId: '',
          memberName: '',
          existingAddress: '',
          proposedAddress: loc.address || '',
          street: loc.street || '',
          city: loc.city || '',
          province: loc.province || '',
          postcode: loc.postcode || '',
          country: loc.countryDisplay || loc.country || '',
          longitude: loc.longitude,
          latitude: loc.latitude,
          result: RESULT.SKIPPED,
          detail: 'Label is not in the reviewed mapping',
          location: loc
        });
        continue;
      }

      if (loc.invalid || loc.error) {
        for (const targetName of targets) {
          rows.push({
            googleLabel: loc.label,
            targetName,
            memberId: '',
            memberName: '',
            existingAddress: '',
            proposedAddress: loc.address || '',
            street: loc.street || '',
            city: loc.city || '',
            province: loc.province || '',
            postcode: loc.postcode || '',
            country: loc.countryDisplay || loc.country || '',
            longitude: loc.longitude,
            latitude: loc.latitude,
            result: RESULT.INVALID,
            detail: loc.error || 'Invalid location',
            location: loc
          });
        }
        continue;
      }

      for (const targetName of targets) {
        const hits = findMembersByReviewedName(members, targetName);
        if (hits.length === 0) {
          rows.push({
            googleLabel: loc.label,
            targetName,
            memberId: '',
            memberName: targetName,
            existingAddress: '',
            proposedAddress: loc.address,
            street: loc.street,
            city: loc.city,
            province: loc.province,
            postcode: loc.postcode,
            country: loc.countryDisplay,
            longitude: loc.longitude,
            latitude: loc.latitude,
            result: RESULT.REVIEW_REQUIRED,
            detail: 'No existing member matches this reviewed name',
            location: loc
          });
          continue;
        }
        if (hits.length > 1) {
          rows.push({
            googleLabel: loc.label,
            targetName,
            memberId: '',
            memberName: hits.map(memberDisplayName).join('; '),
            existingAddress: '',
            proposedAddress: loc.address,
            street: loc.street,
            city: loc.city,
            province: loc.province,
            postcode: loc.postcode,
            country: loc.countryDisplay,
            longitude: loc.longitude,
            latitude: loc.latitude,
            result: RESULT.REVIEW_REQUIRED,
            detail: `Multiple members match (${hits.length})`,
            location: loc,
            candidates: hits.map((m) => ({ id: m.id, name: memberDisplayName(m) }))
          });
          continue;
        }

        const member = hits[0];
        memberMatchCount += 1;
        matchedIds.add(member.id);
        const existingAddress = memberExistingAddressText(member);
        const proposed = {
          street: loc.street,
          city: loc.city,
          province: loc.province,
          postcode: loc.postcode,
          country: loc.country,
          address: loc.address
        };
        const existingParts = {
          street: member.street || '',
          city: member.city || '',
          province: member.province || '',
          postcode: member.postcode || '',
          country: member.country || ''
        };
        let result = RESULT.READY;
        let detail = '';
        let conflictChoice = conflictChoices[member.id] || '';

        if (memberHasNonblankAddress(member)) {
          if (addressFingerprint(existingParts) === addressFingerprint(proposed)
            || normalizeName(existingAddress) === normalizeName(loc.address)) {
            result = RESULT.UNCHANGED;
            detail = 'Address already matches';
          } else if (conflictChoice === 'replace') {
            result = RESULT.READY;
            detail = 'Replace existing address (user confirmed)';
          } else if (conflictChoice === 'keep') {
            result = RESULT.SKIPPED;
            detail = 'Keep existing address (user confirmed)';
          } else {
            result = RESULT.CONFLICT;
            detail = 'Existing nonblank address differs — choose Keep or Replace';
          }
        }

        rows.push({
          googleLabel: loc.label,
          targetName,
          memberId: member.id,
          memberName: memberDisplayName(member),
          existingAddress,
          proposedAddress: loc.address,
          street: loc.street,
          city: loc.city,
          province: loc.province,
          postcode: loc.postcode,
          country: loc.countryDisplay,
          countryCode: loc.country,
          longitude: loc.longitude,
          latitude: loc.latitude,
          result,
          detail,
          conflictChoice,
          location: loc,
          proposed
        });
      }
    }

    const counts = {
      sourceLocations: (locations || []).length,
      memberMatches: memberMatchCount,
      newMembers: 0,
      ready: rows.filter((r) => r.result === RESULT.READY).length,
      unchanged: rows.filter((r) => r.result === RESULT.UNCHANGED).length,
      conflict: rows.filter((r) => r.result === RESULT.CONFLICT).length,
      reviewRequired: rows.filter((r) => r.result === RESULT.REVIEW_REQUIRED).length,
      invalid: rows.filter((r) => r.result === RESULT.INVALID).length,
      skipped: rows.filter((r) => r.result === RESULT.SKIPPED).length
    };

    return {
      rows,
      counts,
      matchedMemberIds: [...matchedIds]
    };
  }

  /**
   * Apply Ready rows only. Address fields (+ optional country) exclusively.
   * Returns { working, updated, unchanged, skipped, rejected, undoSnapshot }.
   */
  function applyAddressImport(state, previewRows, options = {}) {
    const cloneFn = options.cloneState || ((s) => JSON.parse(JSON.stringify(s)));
    const undoSnapshot = cloneFn(state);
    const working = cloneFn(state);
    working.members = Array.isArray(working.members) ? working.members.slice() : [];
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let rejected = 0;
    const beforeCount = working.members.length;

    for (const row of previewRows || []) {
      if (row.result === RESULT.UNCHANGED) {
        unchanged += 1;
        continue;
      }
      if (row.result === RESULT.SKIPPED || row.result === RESULT.REVIEW_REQUIRED || row.result === RESULT.INVALID || row.result === RESULT.CONFLICT) {
        if (row.result === RESULT.CONFLICT || row.result === RESULT.REVIEW_REQUIRED || row.result === RESULT.INVALID) rejected += 1;
        else skipped += 1;
        continue;
      }
      if (row.result !== RESULT.READY || !row.memberId || !row.proposed) {
        rejected += 1;
        continue;
      }
      const idx = working.members.findIndex((m) => m.id === row.memberId);
      if (idx < 0) {
        rejected += 1;
        continue;
      }
      const existing = working.members[idx];
      const next = { ...existing };
      next.street = row.proposed.street;
      next.city = row.proposed.city;
      next.province = row.proposed.province;
      next.postcode = row.proposed.postcode;
      next.country = row.proposed.country;
      next.address = composeAddress(next.street, next.city, next.province, next.postcode);
      // Do not touch id, names, phone, email, family, status, attendance, notes, voting, etc.
      working.members[idx] = next;
      updated += 1;
    }

    if (working.members.length !== beforeCount) {
      throw new Error('Address import must not change member count');
    }

    return {
      working,
      undoSnapshot,
      updated,
      unchanged,
      skipped,
      rejected,
      memberCount: working.members.length
    };
  }

  function restoreAddressImport(undoSnapshot, options = {}) {
    const cloneFn = options.cloneState || ((s) => JSON.parse(JSON.stringify(s)));
    if (!undoSnapshot) return null;
    return cloneFn(undoSnapshot);
  }

  const api = {
    REVIEWED_LABEL_TARGETS,
    RESULT,
    normalizeLabel,
    normalizeName,
    memberDisplayName,
    splitCsvAwareLine,
    parseWktPoint,
    inferCountry,
    countryDisplay,
    countryCode,
    formatPostcode,
    isValidPostcode,
    composeAddress,
    addressFingerprint,
    memberHasNonblankAddress,
    memberExistingAddressText,
    looksLikeProvinceCode,
    looksLikePostcodeToken,
    splitCombinedProvincePostcode,
    parseLocationFields,
    parseGoogleMyMapsCsv,
    reviewedTargetsForLabel,
    findMembersByReviewedName,
    buildAddressImportPreview,
    applyAddressImport,
    restoreAddressImport
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MemberAddressImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
