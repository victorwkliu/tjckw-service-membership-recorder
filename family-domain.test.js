/**
 * Node tests for family-domain.js
 * Run: node family-domain.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');
const FD = require(path.join(__dirname, 'family-domain.js'));

function uidFactory(prefix = 'id') {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

function baseState(members) {
  return {
    meta: {},
    families: [],
    familyMembers: [],
    members: members.slice(),
    services: [
      { id: 'svc1', date: '2026-01-01', attendedBy: members.map((m) => m.id), attendance: members.length }
    ]
  };
}

function run(name, fn) {
  try {
    fn();
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

run('migrate string families to entities without merging similar names', () => {
  const uid = uidFactory('fam');
  const st = baseState([
    { id: 'm1', firstName: 'Victor', lastName: 'Liu', name: 'Victor Liu', family: 'Liu Family' },
    { id: 'm2', firstName: 'Polly', lastName: 'Liu', name: 'Polly Liu', family: 'Liu Family' },
    { id: 'm3', firstName: 'Other', lastName: 'Liu', name: 'Other Liu', family: 'Liu Family 02' }
  ]);
  st.families = ['Liu Family', 'Liu Family 02'];
  FD.migrateFamilies(st, { uid });

  assert.strictEqual(st.meta.familySchema, FD.FAMILY_SCHEMA);
  assert.strictEqual(st.families.length, 2);
  assert.ok(st.families.every(FD.isFamilyEntity));
  assert.strictEqual(st.families.filter((f) => f.displayName === 'Liu Family').length, 1);
  assert.strictEqual(st.families.filter((f) => f.displayName === 'Liu Family 02').length, 1);
  assert.strictEqual(st.members[0].familyId, st.members[1].familyId);
  assert.notStrictEqual(st.members[0].familyId, st.members[2].familyId);
  // service history untouched
  assert.deepStrictEqual(st.services[0].attendedBy, ['m1', 'm2', 'm3']);
});

run('create one family for five members in a single operation', () => {
  const uid = uidFactory('x');
  const members = [1, 2, 3, 4, 5].map((i) => ({
    id: `m${i}`,
    firstName: `P${i}`,
    lastName: 'Ng',
    name: `P${i} Ng`
  }));
  const st = baseState(members);
  FD.migrateFamilies(st, { uid });

  const result = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Ng — P1 & P2',
    primaryContactMemberId: 'm1',
    memberAssignments: members.map((m, idx) => ({
      memberId: m.id,
      relationshipRole: idx === 0 ? 'Primary contact' : '',
      isPrimaryContact: idx === 0
    })),
    uid,
    nowFn: () => new Date('2026-07-21T12:00:00.000Z')
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state.families.length, 1);
  assert.strictEqual(result.memberCount, 5);
  assert.strictEqual(result.family.displayName, 'Ng — P1 & P2');
  assert.ok(!/0\d/.test(result.family.displayName));
});

run('never auto-number display names in suggestDisplayName', () => {
  const members = [
    { firstName: 'Victor', lastName: 'Liu', name: 'Victor Liu' },
    { firstName: 'Polly', lastName: 'Liu', name: 'Polly Liu' }
  ];
  const name = FD.suggestDisplayName(members);
  assert.strictEqual(name, 'Liu — Victor & Polly');
  assert.ok(!name.includes('02'));
});

run('bulk add to existing family', () => {
  const uid = uidFactory('f');
  const st = baseState([
    { id: 'a', firstName: 'Ann', lastName: 'Ng', name: 'Ann Ng' },
    { id: 'b', firstName: 'Bob', lastName: 'Ng', name: 'Bob Ng' },
    { id: 'c', firstName: 'Cara', lastName: 'Ng', name: 'Cara Ng' }
  ]);
  FD.migrateFamilies(st, { uid });
  const created = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Ng — Ann Household',
    memberAssignments: [{ memberId: 'a', isPrimaryContact: true }],
    uid
  });
  assert.ok(created.ok);
  const joined = FD.applyFamilyAssignment(created.state, {
    mode: 'join',
    familyId: created.family.id,
    memberAssignments: [{ memberId: 'b' }, { memberId: 'c' }],
    uid
  });
  assert.ok(joined.ok);
  assert.strictEqual(joined.memberCount, 3);
  assert.strictEqual(joined.state.families.length, 1);
});

run('conflict detection requires explicit resolution', () => {
  const uid = uidFactory('c');
  let st = baseState([
    { id: 'a', firstName: 'Ann', lastName: 'Ng', name: 'Ann Ng' },
    { id: 'b', firstName: 'Brandon', lastName: 'Ng', name: 'Brandon Ng' }
  ]);
  FD.migrateFamilies(st, { uid });
  st = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Ng — Brandon Household',
    memberAssignments: [{ memberId: 'b', isPrimaryContact: true }],
    uid
  }).state;

  const blocked = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Ng — Ann & Brandon',
    memberAssignments: [{ memberId: 'a' }, { memberId: 'b' }],
    uid
  });
  assert.strictEqual(blocked.ok, false);
  assert.ok(Array.isArray(blocked.conflicts));
  assert.strictEqual(blocked.conflicts[0].memberId, 'b');

  const moved = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Ng — Ann & Brandon',
    memberAssignments: [{ memberId: 'a' }, { memberId: 'b' }],
    conflictResolutions: { b: 'move' },
    uid
  });
  assert.ok(moved.ok);
  assert.strictEqual(moved.state.families.length, 2); // old family remains (possibly empty)
  assert.strictEqual(FD.getMemberFamilyId(moved.state.members.find((m) => m.id === 'b')), moved.family.id);

  const kept = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Ng — Ann Household',
    memberAssignments: [{ memberId: 'a' }, { memberId: 'b' }],
    conflictResolutions: { b: 'keep' },
    uid
  });
  assert.ok(kept.ok);
  assert.strictEqual(kept.memberCount, 1);
});

run('merge families preserves member ids and attendance', () => {
  const uid = uidFactory('m');
  let st = baseState([
    { id: 'a', firstName: 'Ann', lastName: 'Liu', name: 'Ann Liu' },
    { id: 'b', firstName: 'Bob', lastName: 'Liu', name: 'Bob Liu' }
  ]);
  FD.migrateFamilies(st, { uid });
  const f1 = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Liu Family',
    memberAssignments: [{ memberId: 'a' }],
    uid
  });
  const f2 = FD.applyFamilyAssignment(f1.state, {
    mode: 'create',
    displayName: 'Liu Family 02',
    memberAssignments: [{ memberId: 'b' }],
    uid
  });
  const merged = FD.applyMergeFamilies(f2.state, {
    sourceFamilyId: f2.family.id,
    targetFamilyId: f1.family.id,
    displayName: 'Liu — Ann & Bob',
    primaryContactMemberId: 'a'
  });
  assert.ok(merged.ok);
  assert.strictEqual(merged.memberCount, 2);
  assert.strictEqual(merged.state.families.length, 1);
  assert.deepStrictEqual(merged.state.services[0].attendedBy, ['a', 'b']);
  assert.strictEqual(merged.state.members[0].id, 'a');
  assert.strictEqual(merged.state.members[1].id, 'b');
});

run('delete empty family only', () => {
  const uid = uidFactory('d');
  let st = baseState([{ id: 'a', firstName: 'Ann', lastName: 'Ng', name: 'Ann Ng' }]);
  FD.migrateFamilies(st, { uid });
  const created = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Ng Household',
    memberAssignments: [{ memberId: 'a' }],
    uid
  });
  const blocked = FD.applyDeleteEmptyFamily(created.state, created.family.id);
  assert.strictEqual(blocked.ok, false);

  const unlinked = FD.applyUnlinkMember(created.state, 'a');
  const deleted = FD.applyDeleteEmptyFamily(unlinked.state, created.family.id);
  assert.ok(deleted.ok);
  assert.strictEqual(deleted.state.families.length, 0);
});

run('commitStateTransaction rolls back when save fails', () => {
  const uid = uidFactory('t');
  const st = baseState([{ id: 'a', firstName: 'Ann', lastName: 'Ng', name: 'Ann Ng' }]);
  FD.migrateFamilies(st, { uid });
  const result = FD.commitStateTransaction(
    st,
    (draft) =>
      FD.applyFamilyAssignment(draft, {
        mode: 'create',
        displayName: 'Ng Household',
        memberAssignments: [{ memberId: 'a' }],
        uid
      }),
    () => false
  );
  assert.strictEqual(result.ok, false);
  assert.ok(result.rolledBack);
  assert.strictEqual(result.state.families.length, 0);
});

run('duplicate suggestions are advisory only', () => {
  const uid = uidFactory('dup');
  let st = baseState([
    { id: 'a', firstName: 'Ann', lastName: 'Liu', name: 'Ann Liu', phone: '1112223333' },
    { id: 'b', firstName: 'Bob', lastName: 'Liu', name: 'Bob Liu', phone: '1112223333' }
  ]);
  FD.migrateFamilies(st, { uid });
  st = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Liu Family',
    memberAssignments: [{ memberId: 'a' }],
    uid
  }).state;
  st = FD.applyFamilyAssignment(st, {
    mode: 'create',
    displayName: 'Liu Family 02',
    memberAssignments: [{ memberId: 'b' }],
    uid
  }).state;
  const suggestions = FD.findDuplicateFamilySuggestions(st);
  assert.ok(suggestions.length >= 1);
  assert.strictEqual(st.families.length, 2); // nothing auto-merged
});

console.log(process.exitCode ? '\nSome tests failed.' : '\nAll family-domain tests passed.');
