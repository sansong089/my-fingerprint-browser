const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const importedUd = path.join(os.homedir(), 'AppData', 'Roaming', 'MyFingerprintBrowser', 'browser-data', 'env_1780562135069_2eyq035yz');
const originalUd = path.join(os.homedir(), 'AppData', 'Roaming', 'MyFingerprintBrowser', 'browser-data', 'env_1780560402251_95s05vn5v');
const importedCp = path.join(importedUd, 'Default', 'Network', 'Cookies');
const originalCp = path.join(originalUd, 'Default', 'Network', 'Cookies');

console.log('='.repeat(70));
console.log('步骤 1: 验证两个环境的 Cookies 文件和 Local State');
console.log('='.repeat(70));

console.log('\n原始环境:');
console.log('  userDataDir:', originalUd);
console.log('  Local State:', fs.existsSync(path.join(originalUd, 'Local State')));
console.log('  Cookies:', fs.existsSync(originalCp));

console.log('\n导入环境:');
console.log('  userDataDir:', importedUd);
console.log('  Local State:', fs.existsSync(path.join(importedUd, 'Local State')));
console.log('  Cookies:', fs.existsSync(importedCp));

// 比较两个 Local State 的 encrypted_key
function getEncryptedKey(userDataDir) {
  const lsPath = path.join(userDataDir, 'Local State');
  if (!fs.existsSync(lsPath)) return null;
  const data = JSON.parse(fs.readFileSync(lsPath, 'utf8'));
  return data.os_crypt?.encrypted_key || null;
}

const origKey = getEncryptedKey(originalUd);
const impKey = getEncryptedKey(importedUd);
console.log('\n原始 Local State encrypted_key:', origKey ? origKey.substring(0, 30) + '...' : 'MISSING');
console.log('导入 Local State encrypted_key:', impKey ? impKey.substring(0, 30) + '...' : 'MISSING');
console.log('key 相同:', origKey === impKey);

// DPAPI decrypt key
function dpapiDecrypt(blob) {
  const tmpFile = path.join(os.tmpdir(), 'fpb-dpapi-debug-' + Date.now() + '.bin');
  const resultFile = tmpFile + '.plain';
  try {
    fs.writeFileSync(tmpFile, blob);
    execSync(
      `powershell -NoProfile -Command "$b=[System.IO.File]::ReadAllBytes('${tmpFile}'); Add-Type -AssemblyName System.Security; $p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); [System.IO.File]::WriteAllBytes('${resultFile}', $p)"`,
      { timeout: 15000, encoding: 'utf8' }
    );
    if (fs.existsSync(resultFile)) {
      return fs.readFileSync(resultFile);
    }
  } catch(e) {
    console.log('DPAPI error:', e.message.substring(0, 100));
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(_) {}
    try { fs.unlinkSync(resultFile); } catch(_) {}
  }
  return null;
}

function getAesKey(userDataDir) {
  const lsPath = path.join(userDataDir, 'Local State');
  if (!fs.existsSync(lsPath)) return null;
  const data = JSON.parse(fs.readFileSync(lsPath, 'utf8'));
  const b64 = data.os_crypt?.encrypted_key;
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  const dpapiBlob = buf.subarray(5); // strip "DPAPI"
  return dpapiDecrypt(dpapiBlob);
}

console.log('\n原始 AES key:', getAesKey(originalUd) ? getAesKey(originalUd).toString('hex').substring(0, 20) + '...' : 'FAILED');
console.log('导入 AES key:', getAesKey(importedUd) ? getAesKey(importedUd).toString('hex').substring(0, 20) + '...' : 'FAILED');

// 读取两个环境的 baidu cookies
console.log('\n' + '='.repeat(70));
console.log('步骤 2: 比较两个环境的 Baidu cookie');
console.log('='.repeat(70));

function readBaiduCookies(cookiesPath) {
  if (!fs.existsSync(cookiesPath)) return null;
  const db = new Database(cookiesPath, { readonly: true });
  const cookies = db.prepare("SELECT host_key, name, length(value) as vlen, length(encrypted_value) as elen, hex(substr(encrypted_value,1,3)) as prefix FROM cookies WHERE host_key LIKE '%baidu%' ORDER BY host_key, name").all();
  db.close();
  return cookies;
}

const origBaidu = readBaiduCookies(originalCp);
const impBaidu = readBaiduCookies(importedCp);

console.log('\n原始环境 Baidu cookies:', origBaidu ? origBaidu.length : 'N/A');
if (origBaidu) origBaidu.forEach(c => console.log('  ' + c.host_key.padEnd(20) + ' ' + c.name.padEnd(25) + ' vlen:' + c.vlen + ' elen:' + c.elen + ' prefix:' + c.prefix));

console.log('\n导入环境 Baidu cookies:', impBaidu ? impBaidu.length : 'N/A');
if (impBaidu) impBaidu.forEach(c => console.log('  ' + c.host_key.padEnd(20) + ' ' + c.name.padEnd(25) + ' vlen:' + c.vlen + ' elen:' + c.elen + ' prefix:' + c.prefix));

// 检查原始环境的 cookies 的 v10 格式和 top_frame_site_key
if (origBaidu && origBaidu.length > 0) {
  console.log('\n' + '='.repeat(70));
  console.log('步骤 3: 检查原始环境的 baidu cookie 完整数据');
  console.log('='.repeat(70));
  const db = new Database(originalCp, { readonly: true });
  const full = db.prepare("SELECT host_key, top_frame_site_key, name, samesite, source_scheme, source_port, has_cross_site_ancestor FROM cookies WHERE host_key LIKE '%baidu%'").all();
  full.forEach(c => console.log(JSON.stringify(c)));
  db.close();
}

// Check the imported environment's cookies v10 format validity
console.log('\n' + '='.repeat(70));
console.log('步骤 4: 验证导入环境 cookie 加密格式');
console.log('='.repeat(70));
const aesKey = getAesKey(importedUd);
if (aesKey && fs.existsSync(importedCp)) {
  const db = new Database(importedCp, { readonly: true });
  const allEnc = db.prepare('SELECT host_key, name, encrypted_value FROM cookies WHERE length(encrypted_value) > 0').all();
  console.log('加密 cookies:', allEnc.length);
  let ok = 0, fail = 0;
  for (const row of allEnc) {
    const enc = row.encrypted_value;
    if (enc.length < 31) { // v10(3) + nonce(12) + min(0) + tag(16) = 31
      console.log('  ❌ ' + row.name + ' @ ' + row.host_key + ' - 数据太短: ' + enc.length + ' bytes');
      fail++;
      continue;
    }
    const ver = enc.toString('utf8', 0, 3);
    if (ver !== 'v10' && ver !== 'v11') {
      console.log('  ❌ ' + row.name + ' @ ' + row.host_key + ' - 版本前缀错误: ' + ver);
      fail++;
      continue;
    }
    // 尝试解密
    const nonce = enc.subarray(3, 15);
    const ciphertext = enc.subarray(15, enc.length - 16);
    const tag = enc.subarray(enc.length - 16);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      console.log('  ✅ ' + row.name.padEnd(25) + ' @ ' + row.host_key.padEnd(20) + ' = ' + plain.toString('utf8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').substring(0, 40));
      ok++;
    } catch(e) {
      console.log('  ❌ ' + row.name + ' @ ' + row.host_key + ' - 解密失败: ' + e.message.substring(0, 50));
      fail++;
    }
  }
  console.log('解密: ' + ok + ' 成功, ' + fail + ' 失败');
  db.close();
} else {
  console.log('无法获取 AES key 或 Cookies 文件不存在');
}
