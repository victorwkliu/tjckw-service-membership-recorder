/**
 * Pure family-domain helpers for Church Service & Membership Recorder.
 * Works in browser (window.FamilyDomain) and Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FamilyDomain = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FAMILY_SCHEMA = 1;
  const RELATIONSHIP_ROLES = [
    '',
    'Primary contact',
    'Spouse',
    'Parent',
    'Child',
    'Relative',
    'Other'
  ];

  function normalizeLabel(s) {
    return (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function nowIso(nowFn) {
    return (typeof nowFn === 'function' ? nowFn() : new Date()).toISOString();
  }

  function cloneState(st) {
    return JSON.parse(JSON.stringify(st));
  }

  function ensureArrays(st) {
    if (!Array.isArray(st.families)) st.families = [];
    if (!Array.isArray(st.familyMembers)) st.familyMembers = [];
    if (!Array.isArray(st.members)) st.members = [];
    if (!Array.isArray(st.services)) st.services = [];
    st.meta = st.meta || {};
    return st;
  }

  function isFamilyEntity(f) {
    return f && typeof f === 'object' && typeof f.id === 'string' && f.id;
  }

  function memberDisplayName(m) {
    if (!m) return '—';
    const name = (m.name || `${m.firstName || ''} ${m.lastName || ''}`).trim();
    return name || '—';
  }

  function memberFirstName(m) {
    if (!m) return '';
    if (m.firstName) return String(m.firstName).trim();
    const parts = String(m.name || '').trim().split(/\s+/).filter(Boolean);
    return parts[0] || '';
  }

  function memberLastName(m) {
    if (!m) return '';
    if (m.lastName) return String(m.lastName).trim();
    const parts = String(m.name || '').trim().split(/\s+/).filter(Boolean);
    return parts.slice(1).join(' ') || '';
  }

  function getFamilyById(st, familyId) {
    if (!familyId) return null;
    return (st.families || []).find((f) => isFamilyEntity(f) && f.id === familyId) || null;
  }

  function getMemberFamilyId(m) {
    if (!m) return '';
    if (m.familyId) return String(m.familyId);
    return '';
  }

  function getFamilyMembership(st, memberId) {
    return (st.familyMembers || []).find((fm) => fm.memberId === memberId) || null;
  }

  function getFamilyMemberLinks(st, familyId) {
    return (st.familyMembers || []).filter((fm) => fm.familyId === familyId);
  }

  function getFamilyMembers(st, familyId) {
    const ids = new Set(getFamilyMemberLinks(st, familyId).map((fm) => fm.memberId));
    return (st.members || [])
      .filter((m) => ids.has(m.id) || getMemberFamilyId(m) === familyId)
      .slice()
      .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));
  }

  function getFamilyDisplayName(st, familyOrId) {
    const fam = typeof familyOrId === 'string' ? getFamilyById(st, familyOrId) : familyOrId;
    if (!fam) return '';
    return (fam.displayName || '').trim();
  }

  function getMemberFamilyDisplayName(st, m) {
    const fid = getMemberFamilyId(m);
    if (fid) {
      const name = getFamilyDisplayName(st, fid);
      if (name) return name;
    }
    // Legacy string fallback during/after migration
    return (m?.family || '').trim();
  }

  function syncMemberFamilyCache(st, memberId) {
    const m = (st.members || []).find((x) => x.id === memberId);
    if (!m) return;
    const link = getFamilyMembership(st, memberId);
    if (!link) {
      m.familyId = '';
      m.family = '';
      return;
    }
    m.familyId = link.familyId;
    m.family = getFamilyDisplayName(st, link.familyId);
    const fam = getFamilyById(st, link.familyId);
    if (fam && link.isPrimaryContact) {
      fam.primaryContactMemberId = memberId;
    }
  }

  function syncAllMemberFamilyCaches(st) {
    for (const m of st.members || []) syncMemberFamilyCache(st, m.id);
  }

  function suggestDisplayName(members) {
    const list = (members || []).filter(Boolean);
    if (!list.length) return '';

    const lastCounts = new Map();
    for (const m of list) {
      const ln = memberLastName(m);
      if (!ln) continue;
      const key = normalizeLabel(ln);
      lastCounts.set(key, (lastCounts.get(key) || 0) + 1);
    }
    let bestLast = '';
    let bestCount = 0;
    for (const m of list) {
      const ln = memberLastName(m);
      const key = normalizeLabel(ln);
      const count = lastCounts.get(key) || 0;
      if (count > bestCount) {
        bestCount = count;
        bestLast = ln;
      }
    }

    const adults = list.filter((m) => {
      const roleHint = normalizeLabel(m._role || '');
      if (roleHint === 'child') return false;
      const group = normalizeLabel(m.group);
      if (group.includes('re(') && /[ejk]/.test(group)) return false;
      return true;
    });
    const primaries = (adults.length ? adults : list).slice(0, 2);
    const firstNames = primaries.map(memberFirstName).filter(Boolean);

    if (bestLast && firstNames.length >= 2) {
      return `${bestLast} — ${firstNames[0]} & ${firstNames[1]}`;
    }
    if (bestLast && firstNames.length === 1) {
      return `${bestLast} — ${firstNames[0]} Household`;
    }
    if (bestLast) return `${bestLast} Household`;
    if (firstNames.length >= 2) return `${firstNames[0]} & ${firstNames[1]} Household`;
    if (firstNames.length === 1) return `${firstNames[0]} Household`;
    return '';
  }

  function createFamilyRecord({ uid, displayName, primaryContactMemberId, notes, nowFn }) {
    const ts = nowIso(nowFn);
    return {
      id: uid(),
      displayName: (displayName || '').trim(),
      primaryContactMemberId: primaryContactMemberId || '',
      notes: (notes || '').trim(),
      createdAt: ts,
      updatedAt: ts
    };
  }

  function createMembership({
    familyId,
    memberId,
    relationshipRole,
    isPrimaryContact,
    joinedFamilyAt,
    nowFn
  }) {
    return {
      familyId,
      memberId,
      relationshipRole: relationshipRole || '',
      isPrimaryContact: !!isPrimaryContact,
      joinedFamilyAt: joinedFamilyAt || nowIso(nowFn)
    };
  }

  function unlinkMember(st, memberId) {
    st.familyMembers = (st.familyMembers || []).filter((fm) => fm.memberId !== memberId);
    const m = (st.members || []).find((x) => x.id === memberId);
    if (m) {
      m.familyId = '';
      m.family = '';
    }
    for (const fam of st.families || []) {
      if (isFamilyEntity(fam) && fam.primaryContactMemberId === memberId) {
        fam.primaryContactMemberId = '';
        fam.updatedAt = nowIso();
      }
    }
  }

  function validateSingleFamilyPerMember(st) {
    const seen = new Map();
    for (const fm of st.familyMembers || []) {
      if (seen.has(fm.memberId)) {
        return {
          ok: false,
          error: `Member ${fm.memberId} is linked to more than one family.`
        };
      }
      seen.set(fm.memberId, fm.familyId);
    }
    return { ok: true };
  }

  function detectAssignmentConflicts(st, memberIds, targetFamilyId) {
    const conflicts = [];
    for (const memberId of memberIds) {
      const m = (st.members || []).find((x) => x.id === memberId);
      if (!m) continue;
      const currentId = getMemberFamilyId(m) || getFamilyMembership(st, memberId)?.familyId || '';
      if (currentId && currentId !== targetFamilyId) {
        conflicts.push({
          memberId,
          memberName: memberDisplayName(m),
          currentFamilyId: currentId,
          currentFamilyName: getMemberFamilyDisplayName(st, m) || getFamilyDisplayName(st, currentId)
        });
      }
    }
    return conflicts;
  }

  /**
   * Apply a family assignment transaction to a state clone.
   * conflictResolutions: { [memberId]: 'keep' | 'move' }
   */
  function applyFamilyAssignment(st, {
    mode, // 'create' | 'join'
    familyId,
    displayName,
    notes,
    primaryContactMemberId,
    memberAssignments, // [{ memberId, relationshipRole, isPrimaryContact }]
    conflictResolutions,
    uid,
    nowFn
  }) {
    const next = cloneState(ensureArrays(st));
    const assignments = (memberAssignments || []).slice();
    if (!assignments.length) {
      return { ok: false, error: 'Select at least one member.', state: st };
    }

    let targetId = familyId || '';
    let family;

    if (mode === 'create') {
      const name = (displayName || '').trim();
      if (!name) {
        return { ok: false, error: 'Enter a family display name before saving.', state: st };
      }
      family = createFamilyRecord({
        uid,
        displayName: name,
        primaryContactMemberId: primaryContactMemberId || '',
        notes,
        nowFn
      });
      next.families.push(family);
      targetId = family.id;
    } else {
      family = getFamilyById(next, targetId);
      if (!family) {
        return { ok: false, error: 'Choose an existing family.', state: st };
      }
      if (displayName != null && String(displayName).trim()) {
        family.displayName = String(displayName).trim();
      }
      if (notes != null) family.notes = String(notes || '').trim();
      family.updatedAt = nowIso(nowFn);
    }

    const resolutions = conflictResolutions || {};
    const conflicts = detectAssignmentConflicts(
      next,
      assignments.map((a) => a.memberId),
      targetId
    );

    for (const c of conflicts) {
      const choice = resolutions[c.memberId];
      if (!choice) {
        return {
          ok: false,
          error: 'Resolve family conflicts before saving.',
          conflicts,
          state: st
        };
      }
      if (choice === 'keep') {
        // Drop this member from the assignment
        const idx = assignments.findIndex((a) => a.memberId === c.memberId);
        if (idx >= 0) assignments.splice(idx, 1);
      } else if (choice === 'move') {
        unlinkMember(next, c.memberId);
      } else {
        return { ok: false, error: `Unknown conflict resolution for ${c.memberName}.`, state: st };
      }
    }

    if (!assignments.length) {
      return { ok: false, error: 'No members left to assign after conflict resolution.', state: st };
    }

    // Remove existing links for members being moved/assigned to target
    const assignIds = new Set(assignments.map((a) => a.memberId));
    next.familyMembers = (next.familyMembers || []).filter((fm) => !assignIds.has(fm.memberId));

    let primaryId = primaryContactMemberId || family.primaryContactMemberId || '';
    for (const a of assignments) {
      const isPrimary = !!a.isPrimaryContact || a.memberId === primaryId;
      if (isPrimary) primaryId = a.memberId;
      next.familyMembers.push(
        createMembership({
          familyId: targetId,
          memberId: a.memberId,
          relationshipRole: a.relationshipRole || '',
          isPrimaryContact: isPrimary,
          nowFn
        })
      );
    }

    // Ensure only one primary contact flag inside the family
    if (primaryId) {
      for (const fm of getFamilyMemberLinks(next, targetId)) {
        fm.isPrimaryContact = fm.memberId === primaryId;
      }
      family.primaryContactMemberId = primaryId;
    }

    family.updatedAt = nowIso(nowFn);
    syncAllMemberFamilyCaches(next);

    const check = validateSingleFamilyPerMember(next);
    if (!check.ok) return { ok: false, error: check.error, state: st };

    return {
      ok: true,
      state: next,
      family,
      memberCount: getFamilyMembers(next, targetId).length
    };
  }

  function applyUnlinkMember(st, memberId, nowFn) {
    const next = cloneState(ensureArrays(st));
    const famId = getFamilyMembership(next, memberId)?.familyId || getMemberFamilyId(
      (next.members || []).find((m) => m.id === memberId)
    );
    unlinkMember(next, memberId);
    if (famId) {
      const fam = getFamilyById(next, famId);
      if (fam) fam.updatedAt = nowIso(nowFn);
    }
    syncAllMemberFamilyCaches(next);
    return { ok: true, state: next };
  }

  function applyRenameFamily(st, familyId, displayName, nowFn) {
    const next = cloneState(ensureArrays(st));
    const fam = getFamilyById(next, familyId);
    if (!fam) return { ok: false, error: 'Family not found.', state: st };
    const name = (displayName || '').trim();
    if (!name) return { ok: false, error: 'Display name is required.', state: st };
    fam.displayName = name;
    fam.updatedAt = nowIso(nowFn);
    syncAllMemberFamilyCaches(next);
    return { ok: true, state: next, family: fam };
  }

  function applyDeleteEmptyFamily(st, familyId) {
    const next = cloneState(ensureArrays(st));
    const members = getFamilyMembers(next, familyId);
    if (members.length) {
      return {
        ok: false,
        error: 'This family still has members. Move or unlink them first.',
        state: st
      };
    }
    next.families = (next.families || []).filter((f) => !(isFamilyEntity(f) && f.id === familyId));
    next.familyMembers = (next.familyMembers || []).filter((fm) => fm.familyId !== familyId);
    return { ok: true, state: next };
  }

  function applyMergeFamilies(st, {
    sourceFamilyId,
    targetFamilyId,
    displayName,
    primaryContactMemberId,
    nowFn
  }) {
    const next = cloneState(ensureArrays(st));
    if (!sourceFamilyId || !targetFamilyId || sourceFamilyId === targetFamilyId) {
      return { ok: false, error: 'Choose two different families to merge.', state: st };
    }
    const source = getFamilyById(next, sourceFamilyId);
    const target = getFamilyById(next, targetFamilyId);
    if (!source || !target) return { ok: false, error: 'Family not found.', state: st };

    for (const fm of getFamilyMemberLinks(next, sourceFamilyId)) {
      fm.familyId = targetFamilyId;
      fm.isPrimaryContact = false;
    }
    if (displayName != null && String(displayName).trim()) {
      target.displayName = String(displayName).trim();
    }
    if (primaryContactMemberId) {
      target.primaryContactMemberId = primaryContactMemberId;
      for (const fm of getFamilyMemberLinks(next, targetFamilyId)) {
        fm.isPrimaryContact = fm.memberId === primaryContactMemberId;
      }
    }
    target.updatedAt = nowIso(nowFn);
    next.families = next.families.filter((f) => !(isFamilyEntity(f) && f.id === sourceFamilyId));
    syncAllMemberFamilyCaches(next);
    const check = validateSingleFamilyPerMember(next);
    if (!check.ok) return { ok: false, error: check.error, state: st };
    return {
      ok: true,
      state: next,
      family: target,
      memberCount: getFamilyMembers(next, targetFamilyId).length
    };
  }

  function addressKey(m) {
    const parts = [
      normalizeLabel(m.street || ''),
      normalizeLabel(m.city || ''),
      normalizeLabel(m.province || ''),
      normalizeLabel(m.postcode || m.postal || '')
    ].filter(Boolean);
    return parts.join('|');
  }

  function phoneKey(m) {
    return String(m.phone || '').replace(/\D+/g, '');
  }

  function findDuplicateFamilySuggestions(st) {
    const families = (st.families || []).filter(isFamilyEntity);
    const suggestions = [];
    const seenPairs = new Set();

    function addSuggestion(a, b, reasons) {
      const key = [a.id, b.id].sort().join('::');
      if (seenPairs.has(key)) {
        const existing = suggestions.find((s) => s.key === key);
        if (existing) {
          for (const r of reasons) {
            if (!existing.reasons.includes(r)) existing.reasons.push(r);
          }
        }
        return;
      }
      seenPairs.add(key);
      suggestions.push({
        key,
        familyA: a,
        familyB: b,
        reasons: reasons.slice(),
        membersA: getFamilyMembers(st, a.id),
        membersB: getFamilyMembers(st, b.id)
      });
    }

    // Similar display labels (not surname-only auto-merge — suggestion only)
    for (let i = 0; i < families.length; i++) {
      for (let j = i + 1; j < families.length; j++) {
        const a = families[i];
        const b = families[j];
        const na = normalizeLabel(a.displayName);
        const nb = normalizeLabel(b.displayName);
        if (!na || !nb) continue;
        const aBase = na.replace(/\s+\d{2}$/, '').replace(/\s+family$/, '').trim();
        const bBase = nb.replace(/\s+\d{2}$/, '').replace(/\s+family$/, '').trim();
        if (aBase && aBase === bBase && na !== nb) {
          addSuggestion(a, b, ['Similar family labels']);
        }
      }
    }

    // Shared phone / address across different families
    const byPhone = new Map();
    const byAddress = new Map();
    for (const m of st.members || []) {
      const fid = getMemberFamilyId(m);
      if (!fid) continue;
      const pk = phoneKey(m);
      if (pk && pk.length >= 7) {
        if (!byPhone.has(pk)) byPhone.set(pk, new Set());
        byPhone.get(pk).add(fid);
      }
      const ak = addressKey(m);
      if (ak && ak.includes('|')) {
        if (!byAddress.has(ak)) byAddress.set(ak, new Set());
        byAddress.get(ak).add(fid);
      }
    }
    for (const [, ids] of byPhone) {
      const arr = [...ids];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = getFamilyById(st, arr[i]);
          const b = getFamilyById(st, arr[j]);
          if (a && b) addSuggestion(a, b, ['Shared phone number']);
        }
      }
    }
    for (const [, ids] of byAddress) {
      const arr = [...ids];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = getFamilyById(st, arr[i]);
          const b = getFamilyById(st, arr[j]);
          if (a && b) addSuggestion(a, b, ['Shared address']);
        }
      }
    }

    // Very small / single-member families with similar labels already covered;
    // also flag singleton pairs that share last-name-only labels as weak suggestions
    const singletons = families.filter((f) => getFamilyMembers(st, f.id).length <= 1);
    for (let i = 0; i < singletons.length; i++) {
      for (let j = i + 1; j < singletons.length; j++) {
        const a = singletons[i];
        const b = singletons[j];
        const ma = getFamilyMembers(st, a.id)[0];
        const mb = getFamilyMembers(st, b.id)[0];
        if (!ma || !mb) continue;
        if (normalizeLabel(memberLastName(ma)) &&
            normalizeLabel(memberLastName(ma)) === normalizeLabel(memberLastName(mb))) {
          addSuggestion(a, b, ['Single-member families with the same surname (review only)']);
        }
      }
    }

    return suggestions;
  }

  /**
   * Migrate legacy string families + member.family labels into entity schema.
   * Preserves member IDs and does not touch services/attendedBy.
   * Does not auto-merge similarly named households.
   */
  function migrateFamilies(st, { uid, nowFn } = {}) {
    ensureArrays(st);
    if (st.meta.familySchema === FAMILY_SCHEMA && (st.families || []).every((f) => isFamilyEntity(f) || f == null)) {
      // Still repair caches / memberships if needed
      repairMembershipConsistency(st, { uid, nowFn });
      return st;
    }

    const legacyLabels = [];
    const pushLabel = (label) => {
      const raw = (label || '').toString().trim();
      if (!raw) return;
      if (!legacyLabels.some((x) => normalizeLabel(x) === normalizeLabel(raw))) {
        legacyLabels.push(raw);
      }
    };

    // Old shape: families was string[]
    for (const f of st.families || []) {
      if (typeof f === 'string') pushLabel(f);
      else if (isFamilyEntity(f) && f.displayName) pushLabel(f.displayName);
    }
    for (const m of st.members || []) {
      pushLabel(m.family);
    }

    const existingEntities = (st.families || []).filter(isFamilyEntity);
    const byNorm = new Map();
    for (const f of existingEntities) {
      byNorm.set(normalizeLabel(f.displayName), f);
    }

    const makeUid = typeof uid === 'function' ? uid : () => 'fam_' + Math.random().toString(16).slice(2);
    for (const label of legacyLabels) {
      const key = normalizeLabel(label);
      if (byNorm.has(key)) continue;
      const entity = createFamilyRecord({
        uid: makeUid,
        displayName: label,
        nowFn
      });
      existingEntities.push(entity);
      byNorm.set(key, entity);
    }

    st.families = existingEntities;
    if (!Array.isArray(st.familyMembers)) st.familyMembers = [];

    // Create memberships from member.family / member.familyId
    for (const m of st.members || []) {
      let famId = m.familyId || '';
      if (famId && !getFamilyById(st, famId)) famId = '';
      if (!famId && m.family) {
        const ent = byNorm.get(normalizeLabel(m.family));
        if (ent) famId = ent.id;
      }
      if (!famId) {
        m.familyId = '';
        continue;
      }
      m.familyId = famId;
      const existing = getFamilyMembership(st, m.id);
      if (!existing) {
        st.familyMembers.push(
          createMembership({
            familyId: famId,
            memberId: m.id,
            isPrimaryContact: false,
            nowFn
          })
        );
      } else if (existing.familyId !== famId) {
        // Prefer explicit familyId if conflicting
        existing.familyId = famId;
      }
    }

    // Drop any memberships pointing at missing members/families
    const memberIds = new Set((st.members || []).map((m) => m.id));
    const familyIds = new Set((st.families || []).filter(isFamilyEntity).map((f) => f.id));
    st.familyMembers = (st.familyMembers || []).filter(
      (fm) => memberIds.has(fm.memberId) && familyIds.has(fm.familyId)
    );

    // One membership per member
    const seen = new Set();
    st.familyMembers = st.familyMembers.filter((fm) => {
      if (seen.has(fm.memberId)) return false;
      seen.add(fm.memberId);
      return true;
    });

    syncAllMemberFamilyCaches(st);
    st.meta.familySchema = FAMILY_SCHEMA;
    return st;
  }

  function repairMembershipConsistency(st, { uid, nowFn } = {}) {
    ensureArrays(st);
    st.families = (st.families || []).filter((f) => isFamilyEntity(f) || typeof f === 'string');
    // Convert any leftover strings
    if ((st.families || []).some((f) => typeof f === 'string')) {
      return migrateFamilies(st, { uid, nowFn });
    }
    const memberIds = new Set((st.members || []).map((m) => m.id));
    const familyIds = new Set((st.families || []).map((f) => f.id));
    st.familyMembers = (st.familyMembers || []).filter(
      (fm) => memberIds.has(fm.memberId) && familyIds.has(fm.familyId)
    );
    for (const m of st.members || []) {
      const link = getFamilyMembership(st, m.id);
      if (link) {
        m.familyId = link.familyId;
      } else if (m.familyId && familyIds.has(m.familyId)) {
        st.familyMembers.push(
          createMembership({ familyId: m.familyId, memberId: m.id, nowFn })
        );
      } else {
        m.familyId = '';
      }
    }
    syncAllMemberFamilyCaches(st);
    st.meta.familySchema = FAMILY_SCHEMA;
    return st;
  }

  /** Atomic save helper for browser apps: mutate clone, then persist via callback. */
  function commitStateTransaction(currentState, mutator, saveFn) {
    const snapshot = cloneState(currentState);
    let draft;
    try {
      draft = mutator(cloneState(currentState));
      if (!draft || draft.ok === false) {
        return { ok: false, error: draft?.error || 'Transaction failed.', conflicts: draft?.conflicts };
      }
      const nextState = draft.state || draft;
      const saved = saveFn(nextState);
      if (!saved) {
        return { ok: false, error: 'Save failed (storage blocked). Rolled back.', rolledBack: true, state: snapshot };
      }
      return { ok: true, state: nextState, result: draft };
    } catch (err) {
      return { ok: false, error: err?.message || String(err), rolledBack: true, state: snapshot };
    }
  }

  return {
    FAMILY_SCHEMA,
    RELATIONSHIP_ROLES,
    normalizeLabel,
    cloneState,
    ensureArrays,
    isFamilyEntity,
    memberDisplayName,
    memberFirstName,
    memberLastName,
    getFamilyById,
    getMemberFamilyId,
    getFamilyMembership,
    getFamilyMemberLinks,
    getFamilyMembers,
    getFamilyDisplayName,
    getMemberFamilyDisplayName,
    syncMemberFamilyCache,
    syncAllMemberFamilyCaches,
    suggestDisplayName,
    createFamilyRecord,
    createMembership,
    detectAssignmentConflicts,
    applyFamilyAssignment,
    applyUnlinkMember,
    applyRenameFamily,
    applyDeleteEmptyFamily,
    applyMergeFamilies,
    findDuplicateFamilySuggestions,
    migrateFamilies,
    repairMembershipConsistency,
    commitStateTransaction,
    validateSingleFamilyPerMember
  };
});
