const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const envDir = path.join(os.homedir(), 'AppData', 'Roaming', 'MyFingerprintBrowser', 'browser-data', 'env_1780560402251_95s05vn5v');

// Get AES key
const lsData = JSON.parse(fs.readFileSync(path.join(envDir, 'Local State'), 'utf8'));
const encKeyBuf = Buffer.from(lsData.os_crypt.encrypted_key, 'base64');
const dpapiBlob = encKeyBuf.subarray(5);
const tmpFile = path.join(os.tmpdir(), 'fpb-format-' + Date.now() + '.bin');
const resFile = tmpFile + '.plain';
fs.writeFileSync(tmpFile, dpapiBlob);
execSync(`powershell -NoProfile -Command "$b=[System.IO.File]::ReadAllBytes('${tmpFile}'); Add-Type -AssemblyName System.Security; $p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); [System.IO.File]::WriteAllBytes('${resFile}', $p)"`, { timeout: 15000 });
const aesKey = fs.readFileSync(resFile);
try { fs.unlinkSync(tmpFile); } catch (_) {}
try { fs.unlinkSync(resFile); } catch (_) {}
console.log('AES key:', aesKey.toString('hex').substring(0, 32) + '...');

const dbPath = path.join(envDir, 'Default', 'Network', 'Cookies');
const db = new Database(dbPath, { readonly: true });

// Get one baidu cookie's encrypted_value bytes
const rows = db.prepare("SELECT host_key, name, encrypted_value FROM cookies WHERE host_key LIKE '%baidu%' AND name='BDUSS' LIMIT 1").all();
const row = rows[0];
const enc = row.encrypted_value;

console.log('\n=== BDUSS encrypted_value hex dump ===');
console.log('Total length:', enc.length, 'bytes');
console.log('Hex:', enc.toString('hex'));

const ver = enc.toString('utf8', 0, 3);
console.log('Version:', ver);

const nonce = enc.subarray(3, 15);
const ct1 = enc.subarray(15, enc.length - 16);
const tag1 = enc.subarray(enc.length - 16);

console.log('Nonce:', nonce.toString('hex'));
console.log('Tag:', tag1.toString('hex'));
console.log('Ciphertext len:', ct1.length);

// Try standard decryption (tag at end)
try {
  const d1 = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  d1.setAuthTag(tag1);
  const p1 = Buffer.concat([d1.update(ct1), d1.final()]);
  console.log('\n--- Decrypt with tag at END (standard) ---');
  console.log('Plaintext len:', p1.length);
  console.log('Plaintext hex:', p1.toString('hex'));
  console.log('Plaintext utf8:', p1.toString('utf8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '?'));
} catch(e) {
  console.log('Standard decrypt FAILED:', e.message);
}

// Try v10 with tag BEFORE ciphertext: v10(3)+nonce(12)+tag(16)+ciphertext
try {
  const tag2 = enc.subarray(15, 31);
  const ct2 = enc.subarray(31);
  const d2 = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  d2.setAuthTag(tag2);
  const p2 = Buffer.concat([d2.update(ct2), d2.final()]);
  console.log('\n--- Decrypt with tag BEFORE ciphertext ---');
  console.log('Plaintext len:', p2.length);
  console.log('Plaintext hex:', p2.toString('hex'));
  console.log('Plaintext utf8:', p2.toString('utf8'));
} catch(e) {
  console.log('Tag-before FAILED:', e.message);
}

// Try without auth tag to see what we get
console.log('\n--- Direct AES decryption (no auth) ---');
try {
  const d3 = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  // Don't set auth tag - see error
  d3.setAuthTag(Buffer.alloc(16));
  const p3 = Buffer.concat([d3.update(enc.subarray(15)), Buffer.from([])]);
  // This should probably fail
} catch(e) {
  console.log('Expected error:', e.message.substring(0, 80));
}

// Check what the cookie value is by using Chrome's decryption (via a different key technique)
// Actually, let's just look at what format the blob has
console.log('\n=== Encrypted blob structure analysis ===');
console.log('Byte 0-2 (v10):', enc.toString('utf8', 0, 3));
console.log('Byte 3-14 (nonce):', enc.subarray(3, 15).toString('hex'));
console.log('Byte 15-18:', enc.subarray(15, 19).toString('hex'), '(first 4 bytes of what we think is ciphertext)');
console.log('Byte len-20 to len-17:', enc.subarray(enc.length - 20, enc.length - 16).toString('hex'), '(last 4 bytes before tag)');
console.log('Byte len-16 to len-1 (tag):', enc.subarray(enc.length - 16).toString('hex'));

// What if there's NO auth tag in the blob? Try decrypting all remaining bytes as ciphertext
console.log('\n--- Decrypt ALL bytes after nonce (no tag split) ---');
try {
  const fullCt = enc.subarray(15); // v10(3) + nonce(12) = 15, rest is ciphertext
  const d4 = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  d4.setAuthTag(Buffer.alloc(16)); // dummy tag - will likely fail
  const p4 = Buffer.concat([d4.update(fullCt), Buffer.from([])]);
} catch(e) {
  console.log('Expected fail:', e.message.substring(0, 80));
}

// What if we need to skip some bytes? Let's try different offsets
console.log('\n=== Trying different nonce/ciphertext/tag offsets ===');
// Maybe the format is v10(3) + nonce(12) + ciphertext, and tag is derived differently
// Or maybe the first N bytes of "ciphertext" are metadata
for (let skip = 0; skip < 8; skip++) {
  const startOff = 15 + skip;
  const cipherPlusTag = enc.subarray(startOff);
  if (cipherPlusTag.length <= 16) continue;
  const tryCt = cipherPlusTag.subarray(0, cipherPlusTag.length - 16);
  const tryTag = cipherPlusTag.subarray(cipherPlusTag.length - 16);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
    d.setAuthTag(tryTag);
    const p = Buffer.concat([d.update(tryCt), d.final()]);
    if (p.length > 0 && p.length < 500) {
      const asStr = p.toString('utf8');
      // Check if it looks like a real cookie value
      if (asStr.replace(/[\x00-\x1f\x80-\xff]/g, '').length > 5) {
        console.log('Skip=' + skip + ': len=' + p.length + ' hex=' + p.toString('hex').substring(0, 60) + ' text=' + asStr.replace(/[\x00-\x1f\x80-\xff]/g, '').substring(0, 40));
      }
    }
  } catch(_) {}
}

// Check the value field of BDUSS
const valRow = db.prepare("SELECT value FROM cookies WHERE host_key LIKE '%baidu%' AND name='BDUSS'").get();
console.log('\nBDUSS value field:', JSON.stringify(valRow.value));

db.close();
