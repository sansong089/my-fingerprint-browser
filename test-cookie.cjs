const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const envDir = path.join(os.homedir(), 'AppData', 'Roaming', 'MyFingerprintBrowser', 'browser-data', 'env_1780560402251_95s05vn5v');
console.log('=== Step 1: Check paths ===');
console.log('envDir:', envDir);
console.log('Local State:', fs.existsSync(path.join(envDir, 'Local State')));
console.log('Cookies:', fs.existsSync(path.join(envDir, 'Default', 'Network', 'Cookies')));

console.log('\n=== Step 2: DPAPI decrypt AES key ===');
const lsData = JSON.parse(fs.readFileSync(path.join(envDir, 'Local State'), 'utf8'));
const encKeyB64 = lsData.os_crypt?.encrypted_key;
console.log('encrypted_key exists:', !!encKeyB64);

const encBuf = Buffer.from(encKeyB64, 'base64');
const dpapiBlob = encBuf.subarray(5); // strip "DPAPI"
console.log('DPAPI blob size:', dpapiBlob.length, 'bytes');

// DPAPI via PowerShell
const tmpFile = path.join(os.tmpdir(), 'fpb-test-' + Date.now() + '.bin');
const resFile = tmpFile + '.plain';
fs.writeFileSync(tmpFile, dpapiBlob);
console.log('Writing DPAPI blob to:', tmpFile);
console.log('Running PowerShell DPAPI decrypt...');

try {
  const psCmd = `powershell -NoProfile -Command "$b=[System.IO.File]::ReadAllBytes('${tmpFile}'); Add-Type -AssemblyName System.Security; $p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); [System.IO.File]::WriteAllBytes('${resFile}', $p)"`;
  console.log('PS command length:', psCmd.length);
  
  const output = execSync(psCmd, { 
    timeout: 15000, 
    encoding: 'utf8',
    windowsHide: true
  });
  console.log('PowerShell output:', output || '(empty)');
  
  if (fs.existsSync(resFile)) {
    const aesKey = fs.readFileSync(resFile);
    console.log('AES key size:', aesKey.length, 'bytes');
    console.log('AES key hex (first 16):', aesKey.toString('hex').substring(0, 32));
    
    if (aesKey.length === 32) {
      console.log('\n=== Step 3: Read and decrypt cookies ===');
      const Database = require('better-sqlite3');
      const dbPath = path.join(envDir, 'Default', 'Network', 'Cookies');
      const db = new Database(dbPath, { readonly: true });
      
      const count = db.prepare('SELECT COUNT(*) as c FROM cookies').get();
      console.log('Total cookies:', count.c);
      
      // Read some cookies with encrypted values
      const rows = db.prepare('SELECT host_key, name, value, encrypted_value FROM cookies WHERE length(encrypted_value) > 0 LIMIT 50').all();
      console.log('Encrypted cookies:', rows.length);
      
      let ok = 0, fail = 0;
      for (const row of rows) {
        const enc = row.encrypted_value;
        if (enc.length < 31) { // v10(3)+nonce(12)+min(0)+tag(16) = 31
          console.log('  SKIP ' + row.name + ' @ ' + row.host_key + ' - too short: ' + enc.length);
          continue;
        }
        const ver = enc.toString('utf8', 0, 3);
        if (ver !== 'v10' && ver !== 'v11') continue;
        
        const nonce = enc.subarray(3, 15);
        const ct = enc.subarray(15, enc.length - 16);
        const tag = enc.subarray(enc.length - 16);
        
        try {
          const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
          decipher.setAuthTag(tag);
          const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
          console.log('  OK ' + row.name.padEnd(25) + ' @ ' + row.host_key.padEnd(20) + ' = ' + plain.toString('utf8').substring(0, 40));
          ok++;
        } catch (e) {
          console.log('  FAIL ' + row.name + ' @ ' + row.host_key + ' - ' + e.message.substring(0, 50));
          fail++;
        }
      }
      console.log('Decryption: ' + ok + ' OK, ' + fail + ' FAIL');
      
      // Also check how many cookies have value (non-empty text)
      const valCount = db.prepare('SELECT COUNT(*) as c FROM cookies WHERE value != \'\'').get();
      console.log('Cookies with non-empty value field:', valCount.c);
      
      db.close();
    } else {
      console.log('AES key has wrong size:', aesKey.length);
    }
  } else {
    console.log('Result file not found:', resFile);
  }
} catch (e) {
  console.log('ERROR:', e.message);
  if (e.stderr) console.log('STDERR:', e.stderr.toString().substring(0, 500));
} finally {
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  try { fs.unlinkSync(resFile); } catch (_) {}
  console.log('\n=== Test complete ===');
}
