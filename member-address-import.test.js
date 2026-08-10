/**
 * Node tests for member-address-import.js (fictional names/addresses only).
 * Run: node member-address-import.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');
const MAI = require(path.join(__dirname, 'member-address-import.js'));

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

const FICTIONAL_CSV = [
  'WKT,name,description',
  // Common My Maps form: province + postal in one field (no comma between them)
  '"POINT (-79.1000001 43.1000001)",Bin Bin,100 Maple Ave, Sampletown, ON A1A 1A1',
  '"POINT (-79.2000002 43.2000002)",Grace,200 Oak St, Sampletown, ON B2B 2B2',
  '"POINT (-79.3000003 43.3000003)",Monique,300 Pine Rd, Sampletown, ON C3C 3C3',
  '"POINT (-79.4000004 43.4000004)",Mandy,400 Cedar Ln, Sampletown, ON A4A 4A4',
  '"POINT (-79.5000005 43.5000005)",Matthew & Jing,500 Elm Dr, Sampletown, ON B5B 5B5',
  '"POINT (-79.6000006 43.6000006)",Jim & Ping,600 Birch Ct, Sampletown, ON C6C 6C6',
  '"POINT (-79.7000007 43.7000007)",Quinn,700 Spruce Way, Sampletown, ON E7E 7E7',
  '"POINT (-79.8000008 43.8000008)",Cheryl & David,800 Willow Blvd, Sampletown, ON G8G 8G8',
  '"POINT (-79.9000009 43.9000009)",Brandon & Xiaoting,900 Aspen Pl, Sampletown, ON H9H 9H9',
  '"POINT (-80.0100010 44.0100010)",Victor & Polly,10 Poplar St, Sampletown, ON K1K 1K1',
  // Separate province / postal + split street parts (Chen Chou style)
  '"POINT (-80.1100011 44.1100011)",Chen Chou,214-55, Green Valley Dr,Sampletown,ON,L2L 2L2',
  '"POINT (-80.2100012 44.2100012)",Jack & Cindy,12 Fir Ave, Sampletown, ON M3M 3M3',
  '"POINT (-83.1500000 42.5500000)",James & Lily,248 Example Blvd, Troyville, MI 48084'
].join('\n');

function fictionalMembers() {
  return [
    { id: 'id-binbin', firstName: 'BinBin', lastName: 'Liang', name: 'BinBin Liang', street: '', city: '', province: '', postcode: '', address: '' },
    { id: 'id-grace', firstName: 'Grace', lastName: 'Lu', name: 'Grace Lu' },
    { id: 'id-monique', firstName: 'Monique', lastName: 'Chiam', name: 'Monique Chiam' },
    { id: 'id-mandy', firstName: 'Mandy', lastName: 'Liu', name: 'Mandy Liu' },
    { id: 'id-matthew', firstName: 'Matthew', lastName: 'Chen', name: 'Matthew Chen' },
    { id: 'id-jing', firstName: 'Jill Jing', lastName: 'Zhen', name: 'Jill Jing Zhen' },
    { id: 'id-manuela', firstName: 'Manuela', lastName: 'Chen', name: 'Manuela Chen' },
    { id: 'id-jim', firstName: 'Jim', lastName: 'Chiam', name: 'Jim Chiam' },
    { id: 'id-ping', firstName: 'Ping', lastName: 'Chiam', name: 'Ping Chiam' },
    { id: 'id-howard', firstName: 'Howard', lastName: 'Chiam', name: 'Howard Chiam' },
    { id: 'id-quinn', firstName: 'Quinn', lastName: 'Wei', name: 'Quinn Wei' },
    { id: 'id-cheryl', firstName: 'Cheryl', lastName: 'Cheng', name: 'Cheryl Cheng' },
    { id: 'id-david-tate', firstName: 'David', lastName: 'Tate', name: 'David Tate' },
    { id: 'id-david-mck', firstName: 'David', lastName: 'McKenzie', name: 'David McKenzie' },
    { id: 'id-brandon', firstName: 'Brandon', lastName: 'Ng', name: 'Brandon Ng' },
    { id: 'id-xiaoting', firstName: 'Xiaoting', lastName: 'Guo', name: 'Xiaoting Guo' },
    { id: 'id-victor', firstName: 'Victor', lastName: 'Liu', name: 'Victor Liu' },
    { id: 'id-polly', firstName: 'Polly', lastName: 'Lin', name: 'Polly Lin' },
    { id: 'id-chou', firstName: 'Chou Chen', lastName: 'Liu', name: 'Chou Chen Liu' },
    { id: 'id-bethany', firstName: 'Bethany', lastName: 'Liu', name: 'Bethany Liu' },
    { id: 'id-jack', firstName: 'Jack', lastName: 'He', name: 'Jack He' },
    { id: 'id-cindy', firstName: 'Cindy', lastName: 'Jiang', name: 'Cindy Jiang' },
    { id: 'id-james', firstName: 'James', lastName: 'Wu', name: 'James Wu' },
    { id: 'id-lily-wu', firstName: 'Lily', lastName: 'Wu', name: 'Lily Wu' },
    { id: 'id-lily-chiu', firstName: 'Lily', lastName: 'Chiu', name: 'Lily Chiu' },
    { id: 'id-phone', firstName: 'Phone', lastName: 'Keeper', name: 'Phone Keeper', phone: '519-555-0100', email: 'keep@example.test', familyId: 'fam-x', notes: 'secret', status: 'Active', membershipCategory: 'Member' }
  ];
}

run('parses 13 malformed CSV locations', () => {
  const { locations, sourceLocationCount } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  assert.strictEqual(sourceLocationCount, 13);
  assert.strictEqual(locations.length, 13);
  assert.ok(locations.every((l) => !l.invalid));
});

run('parses Chen Chou street without stray comma', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const chen = locations.find((l) => l.label === 'Chen Chou');
  assert.ok(chen);
  assert.strictEqual(chen.street, '214-55 Green Valley Dr');
  assert.strictEqual(chen.city, 'Sampletown');
  assert.strictEqual(chen.province, 'ON');
  assert.strictEqual(chen.postcode, 'L2L 2L2');
});

run('does not reverse longitude and latitude', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const first = locations[0];
  assert.strictEqual(first.longitude, -79.1000001);
  assert.strictEqual(first.latitude, 43.1000001);
  const mi = locations.find((l) => l.label === 'James & Lily');
  assert.ok(mi.longitude < -80);
  assert.ok(mi.latitude > 40 && mi.latitude < 45);
});

run('accepts Michigan ZIP 48084', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const mi = locations.find((l) => l.label === 'James & Lily');
  assert.strictEqual(mi.country, 'US');
  assert.strictEqual(mi.postcode, '48084');
  assert.ok(MAI.isValidPostcode('48084', 'US'));
  assert.strictEqual(MAI.formatPostcode('48084', 'US'), '48084');
});

run('proposes exactly 20 member updates and creates zero new members', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const members = fictionalMembers();
  const preview = MAI.buildAddressImportPreview(locations, members);
  assert.strictEqual(preview.counts.sourceLocations, 13);
  assert.strictEqual(preview.counts.memberMatches, 20);
  assert.strictEqual(preview.counts.newMembers, 0);
  assert.strictEqual(preview.counts.ready, 20);
  assert.strictEqual(preview.matchedMemberIds.length, 20);
});

run('couple labels update only the two reviewed members', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const preview = MAI.buildAddressImportPreview(locations, fictionalMembers());
  const jimPing = preview.rows.filter((r) => r.googleLabel === 'Jim & Ping');
  assert.strictEqual(jimPing.length, 2);
  assert.deepStrictEqual(jimPing.map((r) => r.memberName).sort(), ['Jim Chiam', 'Ping Chiam']);
  assert.ok(!preview.matchedMemberIds.includes('id-howard'));
  assert.ok(!preview.matchedMemberIds.includes('id-manuela'));
  assert.ok(!preview.matchedMemberIds.includes('id-bethany'));
});

run('David Tate is selected instead of David McKenzie', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const preview = MAI.buildAddressImportPreview(locations, fictionalMembers());
  const david = preview.rows.find((r) => r.targetName === 'David Tate');
  assert.strictEqual(david.memberId, 'id-david-tate');
  assert.ok(!preview.matchedMemberIds.includes('id-david-mck'));
});

run('Lily Wu is selected instead of Lily Chiu', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const preview = MAI.buildAddressImportPreview(locations, fictionalMembers());
  const lily = preview.rows.find((r) => r.targetName === 'Lily Wu');
  assert.strictEqual(lily.memberId, 'id-lily-wu');
  assert.ok(!preview.matchedMemberIds.includes('id-lily-chiu'));
});

run('Chou Chen Liu matches Chen Chou label', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const preview = MAI.buildAddressImportPreview(locations, fictionalMembers());
  const row = preview.rows.find((r) => r.googleLabel === 'Chen Chou');
  assert.strictEqual(row.memberId, 'id-chou');
  assert.strictEqual(row.memberName, 'Chou Chen Liu');
});

run('nonblank existing address produces Conflict', () => {
  const members = fictionalMembers();
  members.find((m) => m.id === 'id-grace').street = '1 Old Road';
  members.find((m) => m.id === 'id-grace').city = 'Elsewhere';
  members.find((m) => m.id === 'id-grace').province = 'ON';
  members.find((m) => m.id === 'id-grace').postcode = 'Z9Z 9Z9';
  members.find((m) => m.id === 'id-grace').address = '1 Old Road, Elsewhere, ON Z9Z 9Z9';
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const preview = MAI.buildAddressImportPreview(locations, members);
  const grace = preview.rows.find((r) => r.memberId === 'id-grace');
  assert.strictEqual(grace.result, MAI.RESULT.CONFLICT);
});

run('reimport identical data produces Unchanged', () => {
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const members = fictionalMembers();
  const preview1 = MAI.buildAddressImportPreview(locations, members);
  const applied = MAI.applyAddressImport({ members, meta: {} }, preview1.rows);
  const preview2 = MAI.buildAddressImportPreview(locations, applied.working.members);
  assert.strictEqual(preview2.counts.ready, 0);
  assert.strictEqual(preview2.counts.unchanged, 20);
  assert.strictEqual(applied.working.members.length, members.length);
});

run('cancel/undo restores prior data; unrelated fields untouched', () => {
  const members = fictionalMembers();
  const phoneKeeper = members.find((m) => m.id === 'id-phone');
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  // Give phone keeper a reviewed blank address target by temporarily mapping? Instead update Grace and check phone keeper untouched.
  const preview = MAI.buildAddressImportPreview(locations, members);
  const applied = MAI.applyAddressImport({ members, meta: {}, families: [{ id: 'f1' }] }, preview.rows);
  const restored = MAI.restoreAddressImport(applied.undoSnapshot);
  assert.strictEqual(restored.members.find((m) => m.id === 'id-grace').street || '', '');
  assert.strictEqual(applied.working.members.find((m) => m.id === 'id-grace').street, '200 Oak St');
  const afterKeeper = applied.working.members.find((m) => m.id === 'id-phone');
  assert.strictEqual(afterKeeper.phone, phoneKeeper.phone);
  assert.strictEqual(afterKeeper.email, phoneKeeper.email);
  assert.strictEqual(afterKeeper.familyId, phoneKeeper.familyId);
  assert.strictEqual(afterKeeper.notes, phoneKeeper.notes);
  assert.strictEqual(afterKeeper.status, phoneKeeper.status);
  assert.strictEqual(applied.working.members.length, members.length);
});

run('missing member marks Review Required and never creates', () => {
  const members = fictionalMembers().filter((m) => m.id !== 'id-quinn');
  const { locations } = MAI.parseGoogleMyMapsCsv(FICTIONAL_CSV);
  const preview = MAI.buildAddressImportPreview(locations, members);
  const quinn = preview.rows.find((r) => r.targetName === 'Quinn Wei');
  assert.strictEqual(quinn.result, MAI.RESULT.REVIEW_REQUIRED);
  const applied = MAI.applyAddressImport({ members }, preview.rows);
  assert.ok(!applied.working.members.some((m) => m.name === 'Quinn Wei'));
  assert.strictEqual(applied.working.members.length, members.length);
});

if (!process.exitCode) {
  console.log('\nAll member-address-import tests passed.');
}
