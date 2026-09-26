const express = require("express");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = 3000;
const VERSION = "1.1.1";
const GITHUB_REPO = "caedicious/OBS-BRB-shorts-player";

// Check for updates from GitHub
const INSTALLER_ASSET = "OBS-BRB-Shorts-Setup.exe";
let updateAvailable = null;   // summary for /api/version and the web banners
let latestRelease = null;     // what the in-app installer needs

// Resolves to the newer release, or null if there isn't one (or GitHub
// is unreachable, which must never break the app)
function checkForUpdates() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  return fetch(url)
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      const latestVersion = String(data.tag_name || "").replace(/^v/, '');
      if (!isVersionString(latestVersion) || compareVersions(latestVersion, VERSION) <= 0) {
        return null;
      }
      const assets = data.assets || [];
      const installer = assets.find(function(a) { return a.name === INSTALLER_ASSET; }) || null;
      const sums = assets.find(function(a) { return a.name === "SHA256SUMS.txt"; }) || null;
      const firstNotice = !updateAvailable || updateAvailable.version !== latestVersion;
      updateAvailable = {
        version: latestVersion,
        url: data.html_url,
        downloadUrl: installer ? installer.browser_download_url : data.html_url
      };
      latestRelease = { version: latestVersion, installer: installer, sums: sums };
      if (firstNotice) {
        console.log("");
        console.log("  *** UPDATE AVAILABLE: v" + latestVersion + " ***");
        console.log("  Download: " + updateAvailable.downloadUrl);
        console.log("");
      }
      return latestRelease;
    })
    .catch(function(e) {
      return null;
    });
}

function isVersionString(v) {
  return /^\d+(\.\d+){1,3}([-+][0-9A-Za-z.-]+)?$/.test(v);
}

// Leading digits of each dot segment, so a tag like "1.2.0-beta" can't
// become NaN and hide an update
function versionParts(v) {
  return String(v).split('.').map(function(p) {
    const m = /^\d+/.exec(p);
    return m ? Number(m[0]) : 0;
  });
}

function compareVersions(a, b) {
  const partsA = versionParts(a);
  const partsB = versionParts(b);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

// This PC's IPv4 addresses, most likely LAN address first. Home LAN ranges
// win; VPN (Tailscale's 100.x), Hyper-V/WSL/VM adapters and link-local
// addresses are pushed down, because a browser source on another PC in
// the room can't usually reach those.
function getLocalIPs() {
  const os = require("os");
  const interfaces = os.networkInterfaces();
  const found = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ((iface.family === "IPv4" || iface.family === 4) && !iface.internal) {
        found.push({ address: iface.address, score: rankAddress(name, iface.address) });
      }
    }
  }
  found.sort((a, b) => b.score - a.score);
  return found.map((f) => f.address);
}

function rankAddress(name, address) {
  let score;
  if (/^192\.168\./.test(address)) score = 40;
  else if (/^10\./.test(address)) score = 30;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score = 20;
  else if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) score = 5;   // Tailscale, carrier NAT
  else if (/^169\.254\./.test(address)) score = -10;                              // no DHCP lease
  else score = 10;
  if (/vethernet|hyper-v|wsl|vmware|virtualbox|vbox|docker|tailscale|zerotier|hamachi|radmin|tunnel|loopback/i.test(name)) score -= 15;
  return score;
}

function getLocalIP() {
  return getLocalIPs()[0] || "YOUR_IP";
}

// Config via environment variables (more secure than plain text file)
// Uses Windows user-level environment variables for persistence

function loadConfig() {
  const apiKey = process.env.OBS_BRB_YT_API_KEY;
  const channelId = process.env.OBS_BRB_YT_CHANNEL_ID;
  const filterMode = process.env.OBS_BRB_FILTER_MODE || "hashtag";
  const useTransition = process.env.OBS_BRB_USE_TRANSITION === "true";
  
  if (apiKey && channelId) {
    return { apiKey, channelId, filterMode, useTransition };
  }
  return null;
}

function saveConfig(config) {
  const { execSync } = require("child_process");
  
  // Set for current process immediately
  process.env.OBS_BRB_YT_API_KEY = config.apiKey;
  process.env.OBS_BRB_YT_CHANNEL_ID = config.channelId;
  process.env.OBS_BRB_FILTER_MODE = config.filterMode || "hashtag";
  process.env.OBS_BRB_USE_TRANSITION = config.useTransition ? "true" : "false";
  
  // Set persistent user environment variables (Windows)
  if (process.platform === "win32") {
    try {
      // Escape any quotes in values
      const safeApiKey = config.apiKey.replace(/"/g, '');
      const safeChannelId = config.channelId.replace(/"/g, '');
      const safeFilterMode = (config.filterMode || "hashtag").replace(/"/g, '');
      const safeUseTransition = config.useTransition ? "true" : "false";
      
      execSync(`setx OBS_BRB_YT_API_KEY "${safeApiKey}"`, { stdio: 'ignore' });
      execSync(`setx OBS_BRB_YT_CHANNEL_ID "${safeChannelId}"`, { stdio: 'ignore' });
      execSync(`setx OBS_BRB_FILTER_MODE "${safeFilterMode}"`, { stdio: 'ignore' });
      execSync(`setx OBS_BRB_USE_TRANSITION "${safeUseTransition}"`, { stdio: 'ignore' });
    } catch (e) {
      console.error("Warning: Could not save to environment variables:", e.message);
    }
  }
}

function clearConfig() {
  const { execSync } = require("child_process");
  
  // Clear from current process
  delete process.env.OBS_BRB_YT_API_KEY;
  delete process.env.OBS_BRB_YT_CHANNEL_ID;
  delete process.env.OBS_BRB_FILTER_MODE;
  delete process.env.OBS_BRB_USE_TRANSITION;
  delete process.env.OBS_BRB_SKIP_UPDATE_VERSION;

  // Clear persistent environment variables (Windows)
  if (process.platform === "win32") {
    try {
      execSync('setx OBS_BRB_YT_API_KEY ""', { stdio: 'ignore' });
      execSync('setx OBS_BRB_YT_CHANNEL_ID ""', { stdio: 'ignore' });
      execSync('setx OBS_BRB_FILTER_MODE ""', { stdio: 'ignore' });
      execSync('setx OBS_BRB_USE_TRANSITION ""', { stdio: 'ignore' });
      execSync('setx OBS_BRB_SKIP_UPDATE_VERSION ""', { stdio: 'ignore' });
    } catch (e) {
      console.error("Warning: Could not clear environment variables:", e.message);
    }
  }
}

// Simple fetch wrapper using Node's https
const https = require("https");
const http = require("http");

function fetch(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    // GitHub's API rejects requests with no User-Agent (403), which silently
    // broke the update check in 1.1.0
    const options = { headers: { "User-Agent": "OBS-BRB-Shorts/" + VERSION } };
    const req = client.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("error", reject);
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        });
      });
    });
    // Never hang forever on a stalled connection
    req.setTimeout(15000, () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
  });
}

// Cache for shorts
let cache = { at: 0, ids: [] };
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve transition video
const fs = require("fs");
app.get("/transition.mp4", (req, res) => {
  // Try multiple paths (packaged vs development)
  const possiblePaths = [
    path.join(__dirname, "transition.mp4"),
    path.join(process.cwd(), "transition.mp4"),
    path.join(path.dirname(process.execPath), "transition.mp4")
  ];
  
  let videoPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      videoPath = p;
      break;
    }
  }
  
  if (!videoPath) {
    return res.status(404).send("Transition video not found");
  }
  
  const stat = fs.statSync(videoPath);
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4"
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": "video/mp4"
    });
    fs.createReadStream(videoPath).pipe(res);
  }
});

// ====== IN-APP UPDATE ======
// At launch, a newer GitHub release is offered in a small dialog:
// "Install new update" / "Not right now", plus "Do not remind me about this
// version" (remembered per version in OBS_BRB_SKIP_UPDATE_VERSION).
// Installing downloads the release's installer, checks its SHA-256, and
// hands off to a detached script that waits for this app to exit, installs
// silently, and starts the app again. Nothing changes unless the download
// verifies. Same flow as Stream Monitor's updater.
const crypto = require("crypto");
const childProcess = require("child_process");
const { pipeline, Transform } = require("stream");

const UPDATE_DIR = path.join(process.env.LOCALAPPDATA || require("os").tmpdir(), "OBS-BRB-Shorts", "update");
const UPDATE_RESULT_FILE = path.join(UPDATE_DIR, "result.txt");
const POWERSHELL = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

// Only an installed, packaged build can replace itself. Dev runs
// (node server.js) and copies run from dist/ just print the notice.
function canSelfUpdate() {
  if (process.platform !== "win32" || !process.pkg) return false;
  try {
    return fs.readdirSync(path.dirname(process.execPath)).some(function(f) {
      return /^unins\d+\.exe$/i.test(f);
    });
  } catch (e) {
    return false;
  }
}

function setUserEnv(name, value) {
  process.env[name] = value;
  if (process.platform !== "win32") return;
  try {
    childProcess.execSync('setx ' + name + ' "' + String(value).replace(/"/g, '') + '"', { stdio: 'ignore' });
  } catch (e) {
    console.error("Warning: Could not save " + name + ":", e.message);
  }
}

// The prompt, as a WinForms dialog run by Windows PowerShell. The versions
// reach it through environment variables, so nothing from GitHub is ever
// parsed as code. It must not contain double quotes (it's passed as one
// command-line argument). Exit codes: 10 install, 11 not right now,
// 12 not right now + don't remind me about this version.
const UPDATE_DIALOG_SCRIPT = "try { " + [
  "Add-Type -AssemblyName System.Windows.Forms",
  "Add-Type -AssemblyName System.Drawing",
  "[System.Windows.Forms.Application]::EnableVisualStyles()",
  "$f = New-Object System.Windows.Forms.Form",
  "$f.Text = 'OBS BRB Shorts Update'",
  "$f.FormBorderStyle = 'FixedDialog'",
  "$f.MaximizeBox = $false",
  "$f.MinimizeBox = $false",
  "$f.ShowIcon = $false",
  "$f.StartPosition = 'CenterScreen'",
  "$f.TopMost = $true",
  "$f.AutoScaleMode = 'Dpi'",
  "$f.AutoSize = $true",
  "$f.AutoSizeMode = 'GrowAndShrink'",
  "$f.Font = New-Object System.Drawing.Font -ArgumentList 'Segoe UI', 9",
  "$p = New-Object System.Windows.Forms.FlowLayoutPanel",
  "$p.FlowDirection = 'TopDown'",
  "$p.WrapContents = $false",
  "$p.AutoSize = $true",
  "$p.Padding = New-Object System.Windows.Forms.Padding -ArgumentList 14",
  "$t = New-Object System.Windows.Forms.Label",
  "$t.Text = 'New update available'",
  "$t.AutoSize = $true",
  "$t.Font = New-Object System.Drawing.Font -ArgumentList 'Segoe UI', 12, ([System.Drawing.FontStyle]::Bold)",
  "$m = New-Object System.Windows.Forms.Label",
  "$m.AutoSize = $true",
  "$m.MaximumSize = New-Object System.Drawing.Size -ArgumentList 390, 0",
  "$m.Margin = New-Object System.Windows.Forms.Padding -ArgumentList 3, 8, 3, 12",
  "$m.Text = 'OBS BRB Shorts v' + $env:BRB_UPDATE_LATEST + ' is available (you have v' + $env:BRB_UPDATE_CURRENT + ').' + [Environment]::NewLine + [Environment]::NewLine + 'Would you like to install it? Windows will ask for permission, then the app restarts itself when it finishes.'",
  "$c = New-Object System.Windows.Forms.CheckBox",
  "$c.Text = 'Do not remind me about this version'",
  "$c.AutoSize = $true",
  "$b = New-Object System.Windows.Forms.FlowLayoutPanel",
  "$b.FlowDirection = 'RightToLeft'",
  "$b.AutoSize = $true",
  "$b.MinimumSize = New-Object System.Drawing.Size -ArgumentList 390, 0",
  "$b.Margin = New-Object System.Windows.Forms.Padding -ArgumentList 0, 14, 0, 0",
  "$i = New-Object System.Windows.Forms.Button",
  "$i.Text = 'Install new update'",
  "$i.AutoSize = $true",
  "$i.Padding = New-Object System.Windows.Forms.Padding -ArgumentList 6, 2, 6, 2",
  "$n = New-Object System.Windows.Forms.Button",
  "$n.Text = 'Not right now'",
  "$n.AutoSize = $true",
  "$n.Padding = New-Object System.Windows.Forms.Padding -ArgumentList 6, 2, 6, 2",
  "$i.Add_Click({ $f.Tag = 'install'; $f.Close() })",
  "$n.Add_Click({ $f.Close() })",
  "$f.CancelButton = $n",
  "$b.Controls.Add($i)",
  "$b.Controls.Add($n)",
  "$p.Controls.AddRange(@($t, $m, $c, $b))",
  "$f.Controls.Add($p)",
  "[void]$f.ShowDialog()",
  "if ($f.Tag -eq 'install') { exit 10 } elseif ($c.Checked) { exit 12 } else { exit 11 }"
].join("; ") + " } catch { exit 1 }";

function showUpdateDialog(latestVersion, callback) {
  let answered = false;
  function answer(choice) {
    if (answered) return;
    answered = true;
    callback(choice);
  }
  try {
    // Shares this app's console, so no extra window appears and nothing gets hidden
    const child = childProcess.spawn(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", UPDATE_DIALOG_SCRIPT], {
      env: Object.assign({}, process.env, { BRB_UPDATE_CURRENT: VERSION, BRB_UPDATE_LATEST: latestVersion }),
      stdio: "ignore"
    });
    child.on("error", function() { answer(null); });
    child.on("exit", function(code) {
      answer(code === 10 ? "install" : code === 11 ? "later" : code === 12 ? "skip" : null);
    });
  } catch (e) {
    answer(null);
  }
}

// HTTPS GET from GitHub only, following its release-download redirects
function githubGet(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function(resolve, reject) {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const trusted = u.protocol === "https:" &&
      (u.hostname === "github.com" || u.hostname === "api.github.com" || /\.githubusercontent\.com$/.test(u.hostname));
    if (!trusted) return reject(new Error("refusing to download from " + u.host));
    const req = https.get(u, { headers: { "User-Agent": "OBS-BRB-Shorts/" + VERSION } }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error("too many redirects"));
        return resolve(githubGet(new URL(res.headers.location, u).toString(), redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode));
      }
      resolve(res);
    });
    req.setTimeout(30000, function() { req.destroy(new Error("connection timed out")); });
    req.on("error", reject);
  });
}

// Streams a download to disk and resolves to its SHA-256 (hex)
function downloadFile(url, dest) {
  return githubGet(url).then(function(res) {
    return new Promise(function(resolve, reject) {
      const hash = crypto.createHash("sha256");
      const tap = new Transform({
        transform: function(chunk, enc, cb) { hash.update(chunk); cb(null, chunk); }
      });
      pipeline(res, tap, fs.createWriteStream(dest), function(err) {
        if (err) reject(err); else resolve(hash.digest("hex"));
      });
    });
  });
}

function fetchText(url) {
  return githubGet(url).then(function(res) {
    return new Promise(function(resolve, reject) {
      const chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() { resolve(Buffer.concat(chunks).toString("utf8")); });
      res.on("error", reject);
      res.on("close", function() { if (!res.complete) reject(new Error("download interrupted")); });
    });
  });
}

// Retries cover flaky connections and a just-published asset that GitHub
// briefly 404s while it propagates
function withRetry(what, fn) {
  const attempts = 5;
  function attempt(n) {
    return fn().catch(function(err) {
      if (n >= attempts) throw err;
      const wait = Math.min(Math.pow(2, n - 1), 15);
      console.log("  " + what + " failed (" + err.message + "), retrying in " + wait + "s...");
      return new Promise(function(r) { setTimeout(r, wait * 1000); }).then(function() { return attempt(n + 1); });
    });
  }
  return attempt(1);
}

// The installer's SHA-256: GitHub's own digest for the asset, or the
// release's SHA256SUMS.txt when the digest is missing
function expectedInstallerHash(release) {
  const m = /^sha256:([0-9a-f]{64})$/i.exec((release.installer && release.installer.digest) || "");
  if (m) return Promise.resolve(m[1].toLowerCase());
  if (!release.sums) return Promise.resolve(null);
  return withRetry("Checksum download", function() { return fetchText(release.sums.browser_download_url); })
    .then(function(text) {
      for (const line of text.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 2 && /^[0-9a-f]{64}$/i.test(parts[0]) && parts[1].replace(/^\*/, '') === INSTALLER_ASSET) {
          return parts[0].toLowerCase();
        }
      }
      return null;
    });
}

function prepareUpdateDir() {
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  for (const f of fs.readdirSync(UPDATE_DIR)) {
    if (/^OBS-BRB-Shorts-Setup-.*\.exe$/i.test(f) || f === "apply-update.cmd" || f === "poll.json") {
      try { fs.unlinkSync(path.join(UPDATE_DIR, f)); } catch (e) {}
    }
  }
}

// The updater, a Windows PowerShell script with its own hidden console:
// waits for this app to exit, installs silently (Windows still asks for
// admin permission), records the installer's exit code, then starts the app
// again through Explorer, launching once more if it doesn't come up. Notes
// go to update.log. Why it looks like this:
// - Everything happens in-process (sleeps, the poll, stopping the app).
//   Console tools would each need a console, which Windows Terminal shows
//   as a flashing window, and a piped one can hang forever.
// - Values arrive through BRB_* environment variables, so nothing is parsed
//   as code and non-ASCII user folders are fine. It travels on a command
//   line, so like the dialog it must not contain double quotes.
// - PKG_EXECPATH is cleared. pkg hands it to child processes, and a pkg exe
//   that inherits it starts as a bare Node REPL instead of the app.
const APPLY_UPDATE_SCRIPT = "try { " + [
  "[System.Net.WebRequest]::DefaultWebProxy = $null",
  "Remove-Item Env:BRB_APPLY_SCRIPT -ErrorAction SilentlyContinue",
  "$dir = $env:BRB_UPDATE_DIR",
  "$ver = $env:BRB_UPDATE_VERSION",
  "$log = Join-Path $dir 'update.log'",
  // Writes fail while anything else has the file open, so retry briefly
  "function Save($path, $text, $enc, [switch]$append) { for ($k = 0; $k -lt 10; $k++) { try { if ($append) { Add-Content -LiteralPath $path -Encoding $enc -Value $text -ErrorAction Stop } else { Set-Content -LiteralPath $path -Encoding $enc -Value $text -ErrorAction Stop }; return } catch { Start-Sleep -Milliseconds 100 } } }",
  "function Note($m) { Save $log ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m) UTF8 -append }",
  "Remove-Item Env:PKG_EXECPATH -ErrorAction SilentlyContinue",
  "Note ('updating to v' + $ver)",
  "Start-Sleep -Seconds 2",
  "Get-Process -Id ([int]$env:BRB_APP_PID) -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:BRB_APP_EXE } | Stop-Process -Force -ErrorAction SilentlyContinue",
  "Start-Sleep -Seconds 1",
  "$installer = Join-Path $dir ('OBS-BRB-Shorts-Setup-' + $ver + '.exe')",
  "$installerArgs = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', ('/LOG=' + [char]34 + (Join-Path $dir 'install.log') + [char]34))",
  "$code = -1",
  "try { $p = Start-Process -FilePath $installer -ArgumentList $installerArgs -Wait -PassThru -ErrorAction Stop; $code = $p.ExitCode } catch { Note ('installer did not start: ' + $_) }",
  "Save (Join-Path $dir 'result.txt') ($ver + ' ' + $code) Ascii",
  "Note ('installer exit code ' + $code)",
  "Start-Sleep -Seconds 5",
  "$up = $false",
  "for ($attempt = 1; $attempt -le 2 -and -not $up; $attempt++) { " + [
    "Note ('starting the app, attempt ' + $attempt)",
    "Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ([char]34 + $env:BRB_APP_EXE + [char]34)",
    "for ($i = 0; $i -lt 6 -and -not $up; $i++) { Start-Sleep -Seconds 3; try { $r = Invoke-RestMethod -UseBasicParsing -TimeoutSec 2 -Uri ('http://127.0.0.1:' + $env:BRB_PORT + '/api/version'); if ($null -ne $r.current) { $up = $true } } catch {} }"
  ].join("; ") + " }",
  "Note ('app answering: ' + $up)",
  "Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue"
].join("; ") + " } catch { Note ('updater error: ' + $_) }";

function installUpdate(release) {
  console.log("");
  console.log("  Downloading update v" + release.version + "...");
  const installerPath = path.join(UPDATE_DIR, "OBS-BRB-Shorts-Setup-" + release.version + ".exe");
  let expected = null;
  Promise.resolve()
    .then(function() {
      prepareUpdateDir();
      return expectedInstallerHash(release);
    })
    .then(function(hash) {
      if (!hash) throw new Error("the release doesn't publish a SHA-256 for the installer");
      expected = hash;
      return withRetry("Download", function() {
        return downloadFile(release.installer.browser_download_url, installerPath);
      });
    })
    .then(function(actual) {
      if (actual !== expected) {
        throw new Error("the downloaded installer failed its SHA-256 check");
      }
      // The updater has to outlive this app, but Windows PowerShell won't run
      // a script without a console (a detached spawn has none). So a
      // short-lived PowerShell sharing this app's console starts the updater
      // with its own hidden console, then exits. Node only kills its direct
      // children when the app exits, so the updater carries on.
      const relay = "Start-Process -FilePath $env:BRB_POWERSHELL -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', $env:BRB_APPLY_SCRIPT)";
      const child = childProcess.spawn(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", relay], {
        stdio: "ignore",
        env: Object.assign({}, process.env, {
          BRB_POWERSHELL: POWERSHELL,
          BRB_APPLY_SCRIPT: APPLY_UPDATE_SCRIPT,
          BRB_APP_EXE: process.execPath,
          BRB_APP_PID: String(process.pid),
          BRB_UPDATE_DIR: UPDATE_DIR,
          BRB_UPDATE_VERSION: release.version,
          BRB_PORT: String(PORT)
        })
      });
      let settled = false;
      function started(ok, why) {
        if (settled) return;
        settled = true;
        if (!ok) {
          console.log("  Couldn't start the installer (" + why + "). Nothing was changed.");
          console.log("");
          return;
        }
        console.log("  Update verified. This window will close now, Windows will ask for");
        console.log("  permission in a few seconds, and the app will start again when it's done.");
        setTimeout(function() { process.exit(0); }, 500);
      }
      child.on("error", function(err) { started(false, err.message); });
      child.on("exit", function(code) { started(code === 0, "PowerShell exit code " + code); });
    })
    .catch(function(e) {
      try { fs.unlinkSync(installerPath); } catch (err) {}
      console.log("  Update failed: " + e.message);
      console.log("  Nothing was changed. It will be offered again the next time the app starts.");
      console.log("");
    });
}

// Written by the updater script: "<version> <installer exit code>"
function readLastUpdateResult() {
  try {
    const parts = fs.readFileSync(UPDATE_RESULT_FILE, "utf8").trim().split(/\s+/);
    fs.unlinkSync(UPDATE_RESULT_FILE);
    return { version: parts[0], code: Number(parts[1]) };
  } catch (e) {
    return null;
  }
}

function startupUpdateCheck() {
  const last = readLastUpdateResult();
  if (last) {
    if (compareVersions(VERSION, last.version) >= 0) {
      console.log("  Updated to v" + VERSION + ".");
    } else if (last.code === 0) {
      console.log("  The installer for v" + last.version + " finished, but this copy is still v" + VERSION + ".");
    } else {
      console.log("  The update to v" + last.version + " wasn't installed (installer exit code " + last.code + ").");
      console.log("  If you declined the Windows permission prompt, that's expected.");
      console.log("  It will be offered again the next time the app starts.");
    }
    console.log("");
  }

  checkForUpdates().then(function(release) {
    if (!release || !release.installer || !canSelfUpdate()) return;
    // Don't re-prompt straight after a failed or declined install
    if (last && compareVersions(VERSION, last.version) < 0) return;
    if (process.env.OBS_BRB_SKIP_UPDATE_VERSION === release.version) {
      console.log("  (Not showing the update prompt: you asked not to be reminded about v" + release.version + ".)");
      console.log("");
      return;
    }
    showUpdateDialog(release.version, function(choice) {
      if (choice === "install") {
        installUpdate(release);
      } else if (choice === "skip") {
        setUserEnv("OBS_BRB_SKIP_UPDATE_VERSION", release.version);
        console.log("  OK, you won't be reminded about v" + release.version + " again.");
        console.log("");
      } else if (choice === null) {
        console.log("  (Couldn't show the update prompt. Use the download link above.)");
        console.log("");
      }
    });
  });
}

// ====== SETUP WIZARD ======
const setupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OBS BRB Shorts - Setup</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 40px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      background: linear-gradient(90deg, #ff6b6b, #feca57);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      color: #888;
      margin-bottom: 30px;
    }
    .step {
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .step-number {
      background: linear-gradient(135deg, #ff6b6b, #ee5a24);
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
    }
    .step-title {
      font-weight: 600;
      font-size: 16px;
    }
    .step-content {
      color: #aaa;
      font-size: 14px;
      line-height: 1.6;
    }
    .step-content a {
      color: #feca57;
      text-decoration: none;
    }
    .step-content a:hover {
      text-decoration: underline;
    }
    .step-content code {
      background: rgba(0,0,0,0.3);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #ccc;
    }
    input[type="text"] {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      background: rgba(0,0,0,0.2);
      color: #fff;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #feca57;
    }
    input[type="text"]::placeholder {
      color: #666;
    }
    .form-group {
      margin-bottom: 20px;
    }
    button {
      width: 100%;
      padding: 14px 24px;
      background: linear-gradient(135deg, #ff6b6b, #ee5a24);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(238, 90, 36, 0.4);
    }
    .error {
      background: rgba(255, 71, 87, 0.2);
      border: 1px solid #ff4757;
      color: #ff6b6b;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .error.show {
      display: block;
    }
    .update-banner {
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.2), rgba(34, 197, 94, 0.2));
      border: 2px solid #4ade80;
      color: #4ade80;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .update-banner a {
      background: #4ade80;
      color: #1a1a2e;
      padding: 6px 14px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
    }
    .update-banner a:hover {
      background: #22c55e;
    }
    .toggle-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }
    .toggle-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: rgba(0,0,0,0.2);
      border: 2px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }
    .toggle-option:hover {
      background: rgba(0,0,0,0.3);
    }
    .toggle-option input[type="radio"] {
      margin-top: 3px;
      accent-color: #feca57;
    }
    .toggle-option input[type="checkbox"] {
      margin-top: 3px;
      accent-color: #feca57;
      width: 18px;
      height: 18px;
    }
    .toggle-option input[type="radio"]:checked + .toggle-label strong,
    .toggle-option input[type="checkbox"]:checked + .toggle-label strong {
      color: #feca57;
    }
    .toggle-option:has(input:checked) {
      border-color: #feca57;
      background: rgba(254, 202, 87, 0.1);
    }
    .toggle-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .toggle-label strong {
      color: #eee;
      font-size: 15px;
    }
    .toggle-label small {
      color: #888;
      font-size: 13px;
    }
    .collapsible {
      cursor: pointer;
      user-select: none;
    }
    .collapsible::after {
      content: " ▼";
      font-size: 10px;
    }
    .collapsible-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .collapsible-content.open {
      max-height: 500px;
    }
    ol {
      margin: 10px 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="update-banner" class="update-banner" style="display:none;">
      <span>🎉 <strong>Update available!</strong> Version <span id="update-version"></span> is ready.</span>
      <a id="update-link" href="#" target="_blank">Download now</a>
    </div>
    
    <h1>🎬 OBS BRB Shorts</h1>
    <p class="subtitle">Let's get you set up in just a few minutes. After setup, check the <a href="/obs-guide" style="color:#feca57">OBS Setup Guide</a>.</p>

    <div class="error" id="error"></div>

    <div class="step">
      <div class="step-header">
        <div class="step-number">1</div>
        <div class="step-title collapsible" onclick="toggleCollapsible(this)">Get a YouTube API Key</div>
      </div>
      <div class="collapsible-content">
        <div class="step-content">
          <ol>
            <li>Go to the <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a></li>
            <li>Create a new project (or select existing)</li>
            <li>Click <strong>+ CREATE CREDENTIALS</strong> → <strong>API key</strong></li>
            <li>Copy the generated key</li>
            <li>Go to <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank">YouTube Data API v3</a> and click <strong>Enable</strong></li>
          </ol>
        </div>
      </div>
    </div>

    <div class="step">
      <div class="step-header">
        <div class="step-number">2</div>
        <div class="step-title collapsible" onclick="toggleCollapsible(this)">Find Your Channel ID</div>
      </div>
      <div class="collapsible-content">
        <div class="step-content">
          <ol>
            <li>Go to your YouTube channel page</li>
            <li>Click on your profile → <strong>View your channel</strong></li>
            <li>Look at the URL — if it shows <code>/channel/UCxxxxx</code>, that's your ID</li>
            <li>If it shows <code>/@username</code>, go to <a href="https://commentpicker.com/youtube-channel-id.php" target="_blank">this tool</a> and paste your channel URL to get the ID</li>
          </ol>
          <p>Channel IDs start with <code>UC</code> and are 24 characters long.</p>
        </div>
      </div>
    </div>

    <form id="setupForm">
      <div class="form-group">
        <label for="apiKey">YouTube API Key</label>
        <input type="text" id="apiKey" name="apiKey" placeholder="AIzaSy..." required>
      </div>

      <div class="form-group">
        <label for="channelId">YouTube Channel ID</label>
        <input type="text" id="channelId" name="channelId" placeholder="UCu3-t9QMeUJWyRQ1Xd992bg" required>
      </div>

      <div class="form-group">
        <label>Which videos should play?</label>
        <div class="toggle-group">
          <label class="toggle-option">
            <input type="radio" name="filterMode" value="hashtag" checked>
            <span class="toggle-label">
              <strong>Only #shorts</strong>
              <small>Videos with #shorts in title or description (60 sec max)</small>
            </span>
          </label>
          <label class="toggle-option">
            <input type="radio" name="filterMode" value="duration">
            <span class="toggle-label">
              <strong>All short videos</strong>
              <small>Any video 90 seconds or shorter</small>
            </span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>Transition effect</label>
        <div class="toggle-group">
          <label class="toggle-option">
            <input type="checkbox" name="useTransition" id="useTransition">
            <span class="toggle-label">
              <strong>TV Static transition</strong>
              <small>Play a brief static effect between each Short</small>
            </span>
          </label>
        </div>
      </div>

      <button type="submit">Save & Continue →</button>
    </form>
  </div>

  <script>
    function toggleCollapsible(el) {
      const content = el.closest('.step').querySelector('.collapsible-content');
      content.classList.toggle('open');
    }

    document.getElementById('setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('error');
      errorEl.classList.remove('show');

      const apiKey = document.getElementById('apiKey').value.trim();
      const channelId = document.getElementById('channelId').value.trim();
      const filterMode = document.querySelector('input[name="filterMode"]:checked').value;
      const useTransition = document.getElementById('useTransition').checked;

      if (!apiKey || !channelId) {
        errorEl.textContent = 'Please fill in both fields.';
        errorEl.classList.add('show');
        return;
      }

      if (!channelId.startsWith('UC') || channelId.length !== 24) {
        errorEl.textContent = 'Channel ID should start with "UC" and be 24 characters long.';
        errorEl.classList.add('show');
        return;
      }

      try {
        const resp = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, channelId, filterMode, useTransition })
        });

        const data = await resp.json();

        if (data.success) {
          window.location.href = '/player';
        } else {
          errorEl.textContent = data.error || 'Setup failed. Please check your credentials.';
          errorEl.classList.add('show');
        }
      } catch (err) {
        errorEl.textContent = 'Connection error. Is the server running?';
        errorEl.classList.add('show');
      }
    });
    
    // Check for updates
    fetch('/api/version')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.updateAvailable) {
          document.getElementById('update-version').textContent = 'v' + data.updateAvailable.version;
          document.getElementById('update-link').href = data.updateAvailable.downloadUrl;
          document.getElementById('update-banner').style.display = 'flex';
        }
      })
      .catch(function() {});
  </script>
</body>
</html>`;

// ====== ROUTES ======

// Root - redirect to setup or player
app.get("/", (req, res) => {
  const config = loadConfig();
  if (config && config.apiKey && config.channelId) {
    res.redirect("/player");
  } else {
    res.redirect("/setup");
  }
});

// Setup page
app.get("/setup", (req, res) => {
  res.type("html").send(setupHtml);
});

// Setup API
app.post("/api/setup", async (req, res) => {
  const { apiKey, channelId, filterMode, useTransition } = req.body;

  if (!apiKey || !channelId) {
    return res.json({ success: false, error: "Missing API key or Channel ID" });
  }

  // Validate API key by making a test request
  try {
    const testUrl = `https://www.googleapis.com/youtube/v3/channels?key=${encodeURIComponent(apiKey)}&part=id&id=${encodeURIComponent(channelId)}`;

    const resp = await fetch(testUrl);
    const data = await resp.json();

    if (data.error) {
      return res.json({
        success: false,
        error: `API Error: ${data.error.message || "Invalid API key"}`
      });
    }

    if (!data.items || data.items.length === 0) {
      return res.json({
        success: false,
        error: "Channel not found. Check your Channel ID."
      });
    }

    // Save config with filter mode and transition setting
    saveConfig({ 
      apiKey, 
      channelId, 
      filterMode: filterMode || "hashtag",
      useTransition: useTransition || false
    });

    // Clear cache so it fetches fresh
    cache = { at: 0, ids: [] };

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: `Connection error: ${e.message}` });
  }
});

// Get current config (without exposing full API key)
app.get("/api/config", (req, res) => {
  const config = loadConfig();
  if (config) {
    res.json({
      configured: true,
      channelId: config.channelId,
      apiKeySet: !!config.apiKey,
      filterMode: config.filterMode || "hashtag",
      useTransition: config.useTransition || false
    });
  } else {
    res.json({ configured: false });
  }
});

// Clear config (reset to unconfigured state)
app.post("/api/clear-config", (req, res) => {
  try {
    clearConfig();
    cache = { at: 0, ids: [] };
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Check for updates
app.get("/api/version", (req, res) => {
  res.json({
    current: VERSION,
    updateAvailable: updateAvailable
  });
});

// ====== PLAYER LOG ======
// The player reports what it's doing. Important lines show in this console;
// everything (including per-video state changes) is kept in memory and
// served by GET /api/player-log, so it can be pasted into a bug report.
const PLAYER_LOG_MAX = 500;
const playerLog = [];
const playerPages = new Map();   // page id -> where it connected from

function localStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
    pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

app.post("/api/player-log", (req, res) => {
  const page = String((req.body && req.body.page) || "").replace(/[^0-9a-z]/gi, "").slice(0, 8) || "?";
  const lines = Array.isArray(req.body && req.body.lines) ? req.body.lines.slice(0, 50) : [];
  if (!playerPages.has(page)) {
    const ip = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    const from = (ip === "127.0.0.1" || ip === "::1") ? "this computer" : (ip || "unknown");
    if (playerPages.size >= 100) playerPages.delete(playerPages.keys().next().value);
    playerPages.set(page, from);
    playerLog.push(localStamp() + "  [" + page + "] player opened from " + from);
    console.log("  [player " + page + "] opened from " + from);
  }
  for (const line of lines) {
    const text = String(line && line.text != null ? line.text : line).replace(/[\r\n]+/g, " ").slice(0, 300);
    const quiet = !!(line && line.quiet);
    playerLog.push(localStamp() + "  [" + page + "] " + (quiet ? "  " : "") + text);
    if (playerLog.length > PLAYER_LOG_MAX) playerLog.shift();
    if (!quiet) console.log("  [player " + page + "] " + text);
  }
  res.json({ ok: true });
});

app.get("/api/player-log", (req, res) => {
  res.type("text/plain").send(
    "OBS BRB Shorts v" + VERSION + " player log (newest last; indented lines are detail)\n\n" +
    playerLog.join("\n") + "\n"
  );
});

// Shorts API
app.get("/api/shorts", async (req, res) => {
  try {
    const config = loadConfig();

    if (!config || !config.apiKey || !config.channelId) {
      return res.status(500).json({
        error: "Not configured. Visit /setup to configure."
      });
    }

    const { apiKey, channelId, filterMode } = config;
    const useHashtagFilter = filterMode !== "duration";
    const maxDuration = useHashtagFilter ? 60 : 90;

    const now = Date.now();
    if (cache.ids.length && now - cache.at < CACHE_MS) {
      return res.json({ ids: cache.ids, cached: true, count: cache.ids.length });
    }

    // 1) Get uploads playlist ID
    const chanUrl = `https://www.googleapis.com/youtube/v3/channels?key=${encodeURIComponent(apiKey)}&part=contentDetails&id=${encodeURIComponent(channelId)}`;

    const chanResp = await fetch(chanUrl);
    const chanJson = await chanResp.json();

    if (chanJson.error) {
      return res.status(500).json({ error: chanJson.error.message });
    }

    const uploadsPlaylist =
      chanJson.items &&
      chanJson.items[0] &&
      chanJson.items[0].contentDetails &&
      chanJson.items[0].contentDetails.relatedPlaylists &&
      chanJson.items[0].contentDetails.relatedPlaylists.uploads;

    if (!uploadsPlaylist) {
      cache = { at: now, ids: [] };
      return res.json({ ids: [], cached: false, count: 0 });
    }

    // 2) Page through playlistItems
    const all = [];
    let pageToken = "";

    while (true) {
      let plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${encodeURIComponent(apiKey)}&part=snippet&playlistId=${encodeURIComponent(uploadsPlaylist)}&maxResults=50`;
      if (pageToken) plUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

      const plResp = await fetch(plUrl);
      const plJson = await plResp.json();

      if (plJson.error) {
        return res.status(500).json({ error: plJson.error.message });
      }

      const items = plJson.items || [];
      for (const it of items) {
        const vid =
          it.snippet &&
          it.snippet.resourceId &&
          it.snippet.resourceId.videoId;
        const title = (it.snippet && it.snippet.title) || "";
        const desc = (it.snippet && it.snippet.description) || "";
        if (!vid) continue;

        // If using hashtag filter, check for #shorts
        if (useHashtagFilter) {
          const text = (title + " " + desc).toLowerCase();
          if (text.includes("#shorts")) {
            all.push(vid);
          }
        } else {
          // Duration mode: include all videos (filter by duration later)
          all.push(vid);
        }
      }

      pageToken = plJson.nextPageToken || "";
      if (!pageToken) break;
    }

    if (!all.length) {
      cache = { at: now, ids: [] };
      return res.json({ ids: [], cached: false, count: 0 });
    }

    // 3) Filter by duration
    const toSeconds = (iso) => {
      const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return 0;
      const h = Number(m[1] || 0);
      const min = Number(m[2] || 0);
      const s = Number(m[3] || 0);
      return h * 3600 + min * 60 + s;
    };

    const shorts = [];
    for (let i = 0; i < all.length; i += 50) {
      const chunk = all.slice(i, i + 50);
      const vidsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${encodeURIComponent(apiKey)}&part=contentDetails&id=${chunk.join(",")}`;

      const vidsResp = await fetch(vidsUrl);
      const vidsJson = await vidsResp.json();

      if (vidsJson.error) {
        return res.status(500).json({ error: vidsJson.error.message });
      }

      const items = vidsJson.items || [];
      for (const v of items) {
        const duration =
          v.contentDetails && v.contentDetails.duration
            ? v.contentDetails.duration
            : "PT0S";
        const sec = toSeconds(duration);
        if (sec > 0 && sec <= maxDuration) shorts.push(v.id);
      }
    }

    cache = { at: now, ids: shorts };
    res.json({ ids: shorts, cached: false, count: shorts.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Player
app.get("/player", (req, res) => {
  const config = loadConfig();
  if (!config || !config.apiKey || !config.channelId) {
    return res.redirect("/setup");
  }
  res.type("html").send(playerHtml);
});

// OBS Setup Guide
const obsGuideHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OBS BRB Shorts - OBS Setup Guide</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 32px;
      background: linear-gradient(90deg, #ff6b6b, #feca57);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      color: #888;
      margin-bottom: 30px;
    }
    .nav {
      margin-bottom: 30px;
    }
    .nav a {
      color: #feca57;
      text-decoration: none;
      margin-right: 20px;
    }
    .nav a:hover {
      text-decoration: underline;
    }
    .section {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .section h2 {
      margin: 0 0 16px 0;
      font-size: 20px;
      color: #feca57;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section h3 {
      margin: 20px 0 12px 0;
      font-size: 16px;
      color: #ff6b6b;
    }
    .section p, .section li {
      color: #bbb;
      line-height: 1.7;
    }
    .section ol, .section ul {
      padding-left: 24px;
    }
    .section li {
      margin-bottom: 10px;
    }
    .url-box {
      background: rgba(0,0,0,0.3);
      border: 2px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 16px 20px;
      font-family: monospace;
      font-size: 16px;
      color: #4ade80;
      margin: 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .url-box button {
      background: rgba(255,255,255,0.1);
      border: none;
      color: #fff;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .url-box button:hover {
      background: rgba(255,255,255,0.2);
    }
    .warning {
      background: rgba(255, 193, 7, 0.15);
      border-left: 4px solid #ffc107;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
    }
    .warning-title {
      color: #ffc107;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .info {
      background: rgba(59, 130, 246, 0.15);
      border-left: 4px solid #3b82f6;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
    }
    .info-title {
      color: #3b82f6;
      font-weight: 600;
      margin-bottom: 8px;
    }
    code {
      background: rgba(0,0,0,0.3);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: monospace;
      color: #4ade80;
    }
    .step-number {
      background: linear-gradient(135deg, #ff6b6b, #ee5a24);
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
      margin-right: 8px;
    }
    .toc {
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .toc h3 {
      margin: 0 0 12px 0;
      color: #888;
      font-size: 14px;
      text-transform: uppercase;
    }
    .toc a {
      color: #feca57;
      text-decoration: none;
      display: block;
      padding: 6px 0;
    }
    .toc a:hover {
      text-decoration: underline;
    }
    img.screenshot {
      max-width: 100%;
      border-radius: 8px;
      border: 2px solid rgba(255,255,255,0.1);
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav">
      <a href="/">← Home</a>
      <a href="/player">Player</a>
      <a href="/settings">Settings</a>
    </div>
    
    <h1>📺 OBS Setup Guide</h1>
    <p class="subtitle">Complete guide to setting up the BRB Shorts player in OBS Studio</p>
    
    <div class="toc">
      <h3>Table of Contents</h3>
      <a href="#urls">1. Choose Your Player URL</a>
      <a href="#browser-source">2. Add Browser Source to OBS</a>
      <a href="#audio">3. Configure Audio Settings</a>
      <a href="#vod">4. Protect Twitch VODs from Copyright</a>
      <a href="#scene">5. Set Up Your BRB Scene</a>
      <a href="#troubleshooting">6. Troubleshooting</a>
    </div>

    <div class="section" id="urls">
      <h2>📍 1. Choose Your Player URL</h2>
      
      <p>You have two options for accessing the player:</p>
      
      <h3>Option A: Same Computer (Recommended)</h3>
      <p>If OBS is running on the same computer as this app, use:</p>
      <div class="url-box">
        <span id="localhost-url">http://localhost:3000/player</span>
        <button onclick="copyUrl('localhost-url')">Copy</button>
      </div>
      
      <h3>Option B: Different Computer on Your Network</h3>
      <p>If OBS is on a different computer (like a dedicated streaming PC), use your local IP address:</p>
      <div class="url-box">
        <span id="network-url">http://<span id="local-ip">loading...</span>:3000/player</span>
        <button onclick="copyUrl('network-url')">Copy</button>
      </div>
      
      <div class="info">
        <div class="info-title">💡 Finding Your IP Address</div>
        <p>Your local IP address is shown above automatically. If you need to find it manually:</p>
        <ol>
          <li>Press <code>Win + R</code>, type <code>cmd</code>, press Enter</li>
          <li>Type <code>ipconfig</code> and press Enter</li>
          <li>Look for "IPv4 Address" under your network adapter (usually starts with 192.168.x.x or 10.0.x.x)</li>
        </ol>
      </div>
    </div>

    <div class="section" id="browser-source">
      <h2>🌐 2. Add Browser Source to OBS</h2>
      
      <ol>
        <li>In OBS, go to your <strong>BRB scene</strong> (or create one)</li>
        <li>Click the <strong>+</strong> button in the Sources panel</li>
        <li>Select <strong>"Browser"</strong></li>
        <li>Name it something like "BRB Shorts" and click OK</li>
        <li>Configure the browser source:
          <ul>
            <li><strong>URL:</strong> Paste your player URL from above</li>
            <li><strong>Width:</strong> Match your canvas width (e.g., 1920)</li>
            <li><strong>Height:</strong> Match your canvas height (e.g., 1080)</li>
          </ul>
        </li>
        <li>Check these important options:
          <ul>
            <li>✅ <strong>Control audio via OBS</strong> — Required for audio to work!</li>
            <li>✅ <strong>Shutdown source when not visible</strong> — Pauses when you switch scenes</li>
            <li>✅ <strong>Refresh browser when scene becomes active</strong> — Optional but recommended</li>
          </ul>
        </li>
        <li>Click <strong>OK</strong></li>
      </ol>
      
      <h3>Fitting the Video</h3>
      <p>YouTube Shorts are vertical (9:16), so you have options:</p>
      <ul>
        <li><strong>Center with black bars:</strong> Right-click the source → Transform → Center Horizontally</li>
        <li><strong>Crop to fill:</strong> Right-click the source → Transform → Stretch to Screen (will crop top/bottom)</li>
        <li><strong>Add overlay:</strong> Place BRB text or graphics around the vertical video</li>
      </ul>
    </div>

    <div class="section" id="audio">
      <h2>🔊 3. Configure Audio Settings</h2>
      
      <p>To hear the Shorts audio and capture it in your stream:</p>
      
      <ol>
        <li>Find your browser source in the <strong>Audio Mixer</strong> panel in OBS</li>
        <li>Make sure it's not muted and the volume slider is up</li>
        <li>Click the <strong>⚙️ gear icon</strong> next to the browser source</li>
        <li>Select <strong>"Advanced Audio Properties"</strong></li>
        <li>Find your browser source row and set:
          <ul>
            <li><strong>Audio Monitoring:</strong> "Monitor and Output"</li>
          </ul>
        </li>
      </ol>
      
      <div class="info">
        <div class="info-title">💡 Audio Monitoring Modes</div>
        <ul>
          <li><strong>Monitor Off:</strong> Audio goes to stream only (you won't hear it)</li>
          <li><strong>Monitor Only:</strong> You hear it, but stream doesn't (for preview)</li>
          <li><strong>Monitor and Output:</strong> Both you and stream hear it ✓</li>
        </ul>
      </div>
    </div>

    <div class="section" id="vod">
      <h2>⚠️ 4. Protect Twitch VODs from Copyright</h2>
      
      <div class="warning">
        <div class="warning-title">🚨 Important: YouTube Shorts May Contain Copyrighted Music!</div>
        <p>Many Shorts use licensed music that could trigger copyright claims on your Twitch VODs. 
        Follow these steps to keep the audio out of your VOD while still streaming it live.</p>
      </div>
      
      <h3>Step-by-Step: Exclude Audio from VOD</h3>
      
      <ol>
        <li>In OBS, click <strong>Settings</strong> → <strong>Output</strong></li>
        <li>Under "Streaming", find <strong>"Twitch VOD Track"</strong> (you may need to enable Advanced output mode)</li>
        <li>Note which track number is your VOD track (usually Track 2)</li>
        <li>Click <strong>OK</strong> to close settings</li>
        <li>Go to <strong>Edit</strong> → <strong>Advanced Audio Properties</strong></li>
        <li>Find your <strong>BRB Shorts</strong> browser source</li>
        <li>In the "Tracks" column, <strong>UNCHECK</strong> the VOD track number</li>
        <li>Keep the other tracks checked (so it still plays on your live stream)</li>
      </ol>
      
      <div class="info">
        <div class="info-title">💡 How This Works</div>
        <p>OBS can send different audio to different "tracks". Twitch records your VOD using a specific track. 
        By removing the Shorts audio from that track only, your live viewers hear everything, 
        but your VOD won't have the potentially copyrighted music.</p>
      </div>
      
      <h3>Quick Reference: Track Setup</h3>
      <ul>
        <li><strong>Track 1:</strong> Main stream audio (keep Shorts checked ✓)</li>
        <li><strong>Track 2:</strong> Twitch VOD track (UNCHECK Shorts ✗)</li>
      </ul>
    </div>

    <div class="section" id="scene">
      <h2>🎬 5. Set Up Your BRB Scene</h2>
      
      <p>Recommended BRB scene setup:</p>
      
      <ol>
        <li><strong>Background:</strong> Your BRB Shorts browser source</li>
        <li><strong>Overlay (optional):</strong> Add "Be Right Back" text or graphics</li>
        <li><strong>Chat (optional):</strong> Add a chat widget so viewers can still interact</li>
      </ol>
      
      <h3>Pro Tips</h3>
      <ul>
        <li>Create a <strong>hotkey</strong> to quickly switch to your BRB scene (Settings → Hotkeys)</li>
        <li>Use <strong>scene transitions</strong> for a smooth switch (fade, stinger, etc.)</li>
        <li>Test the scene before going live to make sure audio works</li>
      </ul>
    </div>

    <div class="section" id="troubleshooting">
      <h2>🔧 6. Troubleshooting</h2>
      
      <h3>No Audio</h3>
      <ul>
        <li>Make sure "Control audio via OBS" is checked in browser source properties</li>
        <li>Check that the browser source isn't muted in the Audio Mixer</li>
        <li>Verify Audio Monitoring is set to "Monitor and Output"</li>
      </ul>
      
      <h3>Video Not Playing</h3>
      <ul>
        <li>Check that this app is running (keep the console window open!)</li>
        <li>Try refreshing the browser source (right-click → Refresh)</li>
        <li>Verify your API key and Channel ID at <a href="/settings">/settings</a></li>
        <li>Config is stored in Windows environment variables — restart the app after changing settings</li>
        <li>Open <a href="/api/player-log">/api/player-log</a> to see what the player has been doing. If you ask for help, include that page</li>
      </ul>
      
      <h3>"No Shorts Found"</h3>
      <ul>
        <li>Make sure your YouTube Shorts have <code>#shorts</code> in the title or description</li>
        <li>Check that your Channel ID is correct (starts with UC, 24 characters)</li>
        <li>Verify your API key has YouTube Data API v3 enabled</li>
      </ul>
      
      <h3>Can't Access from Other Computer</h3>
      <ul>
        <li>Make sure Windows Firewall allows port 3000</li>
        <li>Verify both computers are on the same network</li>
        <li>Try disabling VPN if connected</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin-top: 40px; color: #666;">
      <p>Need more help? Visit the <a href="/settings" style="color: #feca57;">Settings page</a> to reconfigure.</p>
    </div>
  </div>
  
  <script>
    // Fetch local IP
    fetch('/api/network-info')
      .then(r => r.json())
      .then(data => {
        document.getElementById('local-ip').textContent = data.localIP;
      })
      .catch(() => {
        document.getElementById('local-ip').textContent = 'unable to detect';
      });
    
    function copyUrl(elementId) {
      const text = document.getElementById(elementId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('#' + elementId + ' + button');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      });
    }
  </script>
</body>
</html>`;

// Network info API (for the guide page)
app.get("/api/network-info", (req, res) => {
  const ips = getLocalIPs();
  res.json({ localIP: ips[0] || "YOUR_IP", otherIPs: ips.slice(1) });
});

// OBS Guide page
app.get("/obs-guide", (req, res) => {
  res.type("html").send(obsGuideHtml);
});

// Settings page (to reconfigure)
app.get("/settings", (req, res) => {
  const config = loadConfig();
  const currentFilterMode = (config && config.filterMode) || "hashtag";
  const currentUseTransition = config && config.useTransition;
  
  // Add a "Clear Config" section for settings page
  const clearConfigSection = `
    <div class="step" style="margin-top: 30px; border: 2px solid rgba(255,71,87,0.3);">
      <div class="step-header">
        <div class="step-number" style="background: linear-gradient(135deg, #ff4757, #c0392b);">!</div>
        <div class="step-title">Danger Zone</div>
      </div>
      <div class="step-content">
        <p>Clear all saved configuration. You'll need to set up again.</p>
        <button type="button" onclick="clearConfig()" style="background: linear-gradient(135deg, #ff4757, #c0392b); margin-top: 10px;">
          Clear All Settings
        </button>
      </div>
    </div>
    <script>
      async function clearConfig() {
        if (!confirm('Are you sure you want to clear all settings? You will need to enter your API key and Channel ID again.')) return;
        try {
          const resp = await fetch('/api/clear-config', { method: 'POST' });
          const data = await resp.json();
          if (data.success) {
            alert('Settings cleared! Redirecting to setup...');
            window.location.href = '/setup';
          } else {
            alert('Failed to clear settings: ' + (data.error || 'Unknown error'));
          }
        } catch (e) {
          alert('Error: ' + e.message);
        }
      }
    </script>
  `;
  
  let settingsHtml = setupHtml
    .replace(
      "<h1>🎬 OBS BRB Shorts</h1>",
      "<h1>🎬 OBS BRB Shorts - Settings</h1>"
    )
    .replace(
      'Let\'s get you set up in just a few minutes. After setup, check the <a href="/obs-guide" style="color:#feca57">OBS Setup Guide</a>.',
      'Update your configuration below. <a href="/player" style="color:#feca57">← Back to player</a>'
    )
    .replace(
      '</form>',
      '</form>' + clearConfigSection
    );
  
  // Pre-select the current filter mode
  if (currentFilterMode === "duration") {
    settingsHtml = settingsHtml
      .replace('value="hashtag" checked', 'value="hashtag"')
      .replace('value="duration">', 'value="duration" checked>');
  }
  
  // Pre-check the transition checkbox if enabled
  if (currentUseTransition) {
    settingsHtml = settingsHtml
      .replace('name="useTransition" id="useTransition">', 'name="useTransition" id="useTransition" checked>');
  }
  
  res.type("html").send(settingsHtml);
});

app.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIP();
  
  // Check for updates at startup (offering to install one), then every 6
  // hours for the web banners. The app often runs for days, but the prompt
  // only ever appears at launch so it can't pop up mid-stream.
  setTimeout(startupUpdateCheck, 3000);
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
  
  console.log("");
  console.log("==========================================================");
  console.log("   OBS BRB Shorts - Server Running!");
  console.log("==========================================================");
  console.log("");
  console.log("  PLAYER URLs:");
  console.log("  -----------------------------------------------------");
  console.log("  This computer:     http://localhost:" + PORT + "/player");
  console.log("  Other devices:     http://" + localIP + ":" + PORT + "/player");
  console.log("");
  console.log("  Use 'localhost' if OBS is on this computer.");
  console.log("  Use the IP address (" + localIP + ") to access from");
  console.log("  other computers on your local network.");
  const otherIPs = getLocalIPs().slice(1);
  if (otherIPs.length) {
    console.log("  (If that address doesn't work from the other computer,");
    console.log("   this PC also has: " + otherIPs.join(", ") + ")");
  }
  console.log("");
  console.log("  SETUP & HELP:");
  console.log("  -----------------------------------------------------");
  console.log("  First-time setup:  http://localhost:" + PORT + "/setup");
  console.log("  OBS Guide:         http://localhost:" + PORT + "/obs-guide");
  console.log("  Settings:          http://localhost:" + PORT + "/settings");
  console.log("");
  console.log("  Config stored in:  Windows Environment Variables");
  console.log("                     (OBS_BRB_YT_API_KEY, OBS_BRB_YT_CHANNEL_ID)");
  console.log("==========================================================");
  console.log("");
  console.log("  Keep this window open while streaming!");
  console.log("  Press Ctrl+C to stop the server.");
  console.log("");

  // Try to open browser on first run
  const config = loadConfig();
  if (!config) {
    const url = "http://localhost:" + PORT;
    if (process.platform === "win32") {
      exec('start "" "' + url + '"');
    } else if (process.platform === "darwin") {
      exec("open " + url);
    } else {
      exec("xdg-open " + url);
    }
  }
});

// ====== PLAYER HTML ======
const playerHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BRB Shorts</title>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:black; overflow:hidden; }
    #player { width:100%; height:100%; }
    #transition-video {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 100;
      display: none;
    }
    #status {
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: sans-serif;
      font-size: 12px;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.3s;
    }
    #status.show { opacity: 1; }
    #settings-btn {
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(255,255,255,0.1);
      border: none;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
    }
    body:hover #settings-btn { opacity: 1; }
    #guide-btn {
      position: fixed;
      top: 10px;
      right: 100px;
      background: rgba(255,255,255,0.1);
      border: none;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
    }
    body:hover #guide-btn { opacity: 1; }
    #update-btn {
      position: fixed;
      top: 10px;
      right: 200px;
      background: linear-gradient(135deg, #4ade80, #22c55e);
      border: none;
      color: #1a1a2e;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
      display: none;
    }
    body:hover #update-btn { opacity: 1; }
    #update-btn.show { display: block; }
  </style>
</head>
<body>
  <div id="status"></div>
  <a id="update-btn" href="#" target="_blank">🎉 Update Available</a>
  <button id="guide-btn" onclick="location.href='/obs-guide'">📺 OBS Guide</button>
  <button id="settings-btn" onclick="location.href='/settings'">⚙️ Settings</button>
  <video id="transition-video" src="/transition.mp4" playsinline></video>
  <div id="player"></div>

  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    let ids = [];
    let queue = [];
    let index = 0;
    let player = null;
    let pausedByHidden = false;
    let useTransition = false;
    let transitionVideo = null;

    // State guards
    let advancing = false;        // a transition-or-load cycle is in flight
    let audioFixed = false;       // audio fix applied to the CURRENT video
    let currentId = null;
    let pendingLoad = false;      // next short deferred because OBS hid the source
    let endTransition = null;     // cuts the transition in flight short, if any

    // Stall watchdog: skip a short that makes no progress for STALL_MS
    const STALL_MS = 30000;
    let progressMark = 0;
    let progressAt = Date.now();

    // Loop guard: some embeds restart a Short from 0 when it ends instead
    // of reporting ENDED (seen in OBS). A playhead that jumps back without
    // one of our own seeks counts as the end of the video.
    let wrapLastT = 0;
    let lastSeekAt = 0;

    // End timer: cut to the next short just before this one ends, so an
    // embed that loops never gets the chance to show the restart. ENDED
    // (where it does arrive) and the loop guard remain as backstops.
    const END_LEAD_S = 0.4;
    let endTimer = null;
    function armEndTimer() {
      clearTimeout(endTimer);
      endTimer = null;
      try {
        const d = player.getDuration() || 0;
        const t = player.getCurrentTime() || 0;
        if (d < 1) return;
        endTimer = setTimeout(function() {
          endTimer = null;
          if (advancing || document.hidden) return;
          log("reached the end of", currentId, "(" + d.toFixed(1) + "s)");
          advance("finished");
        }, Math.max(0, (d - t - END_LEAD_S) * 1000));
      } catch (e) {}
    }
    function disarmEndTimer() {
      clearTimeout(endTimer);
      endTimer = null;
    }

    function checkForLoop(t) {
      if (advancing || !(wrapLastT > 3 && t < wrapLastT - 2) || Date.now() - lastSeekAt < 3000) return false;
      log("video restarted itself at", wrapLastT, "without ending, treating that as the end:", currentId);
      wrapLastT = 0;
      advance("looped");
      return true;
    }

    // Player log: log() lines show in the app's console window, trace()
    // lines only go to /api/player-log. Both are batched to the server.
    const pageId = Math.random().toString(36).slice(2, 6);
    let logQueue = [];
    let logTimer = null;
    function fmtArgs(args) {
      return Array.prototype.map.call(args, function(a) {
        if (typeof a === "string") return a;
        if (typeof a === "number") return Number.isInteger(a) ? String(a) : a.toFixed(2);
        try { return JSON.stringify(a); } catch (e) { return String(a); }
      }).join(" ");
    }
    function queueLog(quiet, args) {
      const text = fmtArgs(args);
      console.log("[brb]", text);
      logQueue.push({ text: text, quiet: quiet });
      if (logQueue.length > 200) logQueue.splice(0, logQueue.length - 200);
      if (!logTimer) logTimer = setTimeout(flushLog, 300);
    }
    function log() { queueLog(false, arguments); }
    function trace() { queueLog(true, arguments); }
    function flushLog() {
      logTimer = null;
      const lines = logQueue;
      logQueue = [];
      try {
        fetch("/api/player-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: pageId, lines: lines }),
          keepalive: true
        }).catch(function() {});
      } catch (e) {}
    }
    function stateName(s) {
      return { "-1": "UNSTARTED", "0": "ENDED", "1": "PLAYING", "2": "PAUSED", "3": "BUFFERING", "5": "CUED" }[String(s)] || String(s);
    }
    function playerInfo() {
      try {
        return "t=" + (player.getCurrentTime() || 0).toFixed(1) + " muted=" + player.isMuted() + " hidden=" + document.hidden + (advancing ? " advancing" : "") + (pendingLoad ? " pendingLoad" : "");
      } catch (e) { return ""; }
    }
    trace("page loaded", "hidden=" + document.hidden, "ua=" + navigator.userAgent);

    const statusEl = document.getElementById('status');
    function showStatus(msg, duration) {
      duration = duration || 3000;
      statusEl.textContent = msg;
      statusEl.classList.add('show');
      setTimeout(function() { statusEl.classList.remove('show'); }, duration);
    }

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
      return arr;
    }

    function loadConfig() {
      return fetch("/api/config")
        .then(function(resp) { return resp.json(); })
        .then(function(json) {
          useTransition = json.useTransition || false;
          if (useTransition) {
            transitionVideo = document.getElementById('transition-video');
            if (transitionVideo) { transitionVideo.load(); }
          }
        })
        .catch(function() {
          useTransition = false;
        });
    }

    function loadIds() {
      return fetch("/api/shorts")
        .then(function(resp) { return resp.json(); })
        .then(function(json) {
          if (json.error) {
            showStatus("Error: " + json.error, 5000);
            return;
          }
          ids = json.ids || [];
          queue = shuffle(ids.slice());
          index = 0;
          if (ids.length) {
            showStatus("Loaded " + ids.length + " shorts" + (json.cached ? " (cached)" : "") + (useTransition ? " + transitions" : ""));
          } else {
            showStatus("No shorts found! Check settings.", 10000);
          }
        })
        .catch(function() {
          showStatus("Failed to load shorts", 5000);
        });
    }

    // Refresh the pool without disturbing the current playthrough
    function refreshIds() {
      return fetch("/api/shorts")
        .then(function(resp) { return resp.json(); })
        .then(function(json) {
          if (json.ids && json.ids.length) { ids = json.ids; }
        })
        .catch(function() {});
    }

    function nextId() {
      if (!queue.length) return null;
      const id = queue[index++];
      if (index >= queue.length) {
        queue = shuffle(ids.slice());
        index = 0;
        // Don't let a reshuffle play the same short twice in a row
        if (queue.length > 1 && queue[0] === id) {
          const j = 1 + Math.floor(Math.random() * (queue.length - 1));
          queue[0] = queue[j];
          queue[j] = id;
        }
      }
      return id;
    }

    // Load the next short. Only ever called from advance(), or to resume a
    // load that was deferred while the source was hidden.
    function loadNextVideo() {
      // Never start a short while OBS has the source hidden. advancing stays
      // true until the load actually happens.
      if (document.hidden) {
        pendingLoad = true;
        log("source hidden, next short deferred");
        return;
      }
      pendingLoad = false;
      const id = nextId();
      if (!id || !player) { advancing = false; return; }
      currentId = id;
      audioFixed = false;
      progressMark = 0;
      progressAt = Date.now();
      wrapLastT = 0;
      log("loading", id);
      try {
        player.loadVideoById({ videoId: id });
      } catch (e) {
        log("loadVideoById failed", String(e));
      }
      advancing = false;
    }

    // Single entry point for moving to the next short.
    // Re-entrant calls are dropped, which is what stops a repeat loop.
    function advance(reason) {
      if (advancing) {
        log("advance ignored (in flight), reason:", reason);
        return;
      }
      advancing = true;
      disarmEndTimer();
      log("advance, reason:", reason, playerInfo());

      if (!useTransition || !transitionVideo || document.hidden) {
        loadNextVideo();
        return;
      }

      // Pause the YouTube player so it cannot emit state changes
      // while the transition is on screen.
      try { player.pauseVideo(); } catch (e) {}

      let done = false;
      let ceiling = null;
      function finish(how) {
        if (done) return;
        done = true;
        endTransition = null;
        clearTimeout(ceiling);
        transitionVideo.onended = null;
        transitionVideo.onerror = null;
        transitionVideo.style.display = 'none';
        try { transitionVideo.pause(); } catch (e) {}
        log("transition finished:", how);
        loadNextVideo();
      }
      endTransition = finish;

      // Attach handlers BEFORE play() so a fast/short clip cannot
      // fire 'ended' before we are listening.
      transitionVideo.onended = function() { finish("ended"); };
      transitionVideo.onerror = function() { finish("error"); };

      transitionVideo.style.display = 'block';
      try { transitionVideo.currentTime = 0; } catch (e) {}

      // Hard ceiling: a stalled or missing transition.mp4 can never
      // wedge the playlist.
      ceiling = setTimeout(function() { finish("timeout"); }, 8000);

      const p = transitionVideo.play();
      if (p && typeof p.catch === "function") {
        p.catch(function() { finish("play rejected"); });
      }
    }

    // Audio fix, applied at most once per video. The player starts muted so
    // autoplay is allowed; after unmuting, restart the short so its opening is
    // heard. A short that starts unmuted is left alone: seeking it only causes
    // a rebuffer stutter at the start.
    function applyAudioFix() {
      if (audioFixed) return;
      audioFixed = true; // set first, so the seek's own PLAYING event is a no-op
      try {
        if (player.isMuted()) {
          trace("audio fix: started muted, unmuting and restarting");
          player.unMute();
          player.setVolume(100);
          lastSeekAt = Date.now();
          player.seekTo(0, true);
        } else {
          trace("audio fix: started unmuted, nothing to do");
        }
      } catch (e) {}
    }

    function createPlayer() {
      player = new YT.Player("player", {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          mute: 1
        },
        events: {
          onReady: function() {
            trace("player ready", "hidden=" + document.hidden, "transition=" + useTransition);
            // Opening transition (if enabled), then the first short
            advance("onReady");

            // Recovery nudge and stall watchdog. The nudge never seeks or
            // advances; the watchdog skips a short stuck for STALL_MS.
            // Loop guard backstop, checked every second (the state-change
            // handler usually catches a restart first)
            setInterval(function() {
              if (!player || advancing || document.hidden) { wrapLastT = 0; return; }
              try {
                if (player.getPlayerState() !== YT.PlayerState.PLAYING) return;
                const t = player.getCurrentTime() || 0;
                if (checkForLoop(t)) return;
                wrapLastT = t;
              } catch (e) {}
            }, 1000);

            let ticks = 0;
            setInterval(function() {
              ticks++;
              if (ticks % 3 === 0) {
                try { trace("heartbeat", currentId, "state=" + stateName(player.getPlayerState()), playerInfo()); } catch (e) {}
              }
              if (pendingLoad && !document.hidden) { loadNextVideo(); return; }
              if (document.hidden || !player || advancing) {
                progressAt = Date.now();
                return;
              }
              try {
                const t = player.getCurrentTime() || 0;
                if (t < progressMark || t - progressMark >= 1) {
                  progressMark = t;
                  progressAt = Date.now();
                } else if (Date.now() - progressAt > STALL_MS) {
                  log("stalled at", t, "on", currentId, "state=" + stateName(player.getPlayerState()));
                  advance("stalled");
                  return;
                }
                const s = player.getPlayerState();
                if (s === YT.PlayerState.PAUSED || s === YT.PlayerState.UNSTARTED) {
                  player.playVideo();
                }
              } catch (e) {}
            }, 5000);
          },
          onStateChange: function(e) {
            trace(stateName(e.data), currentId, playerInfo());
            // A restart shows up first as BUFFERING or PLAYING back near 0:00
            if (e.data === YT.PlayerState.BUFFERING || e.data === YT.PlayerState.PLAYING) {
              try { if (checkForLoop(player.getCurrentTime() || 0)) return; } catch (err) {}
            }
            if (e.data === YT.PlayerState.PLAYING) {
              // A load that was already under way when OBS hid the source
              if (document.hidden) {
                pausedByHidden = true;
                try { player.pauseVideo(); } catch (err) {}
                return;
              }
              applyAudioFix();
              // (re)armed on every PLAYING, so a seek or a rebuffer recomputes it
              armEndTimer();
            } else if (e.data === YT.PlayerState.ENDED) {
              disarmEndTimer();
              advance("ended");
            } else {
              disarmEndTimer();
            }
          },
          onError: function(e) {
            log("player error", e.data, "on", currentId);
            advance("error " + e.data);
          }
        }
      });
    }

    // Keep retrying (with backoff) until the pool loads, so a network hiccup
    // at startup can't leave a dead black source.
    let retryDelay = 30000;
    function start() {
      loadIds().then(function() {
        if (!ids.length) {
          log("no shorts loaded, retrying in", retryDelay / 1000, "s");
          setTimeout(start, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 10 * 60 * 1000);
          return;
        }
        createPlayer();
      });
    }

    window.onYouTubeIframeAPIReady = function() {
      showStatus("Loading...");
      loadConfig().then(start);
    };

    // If the YouTube API script itself failed to load (no internet yet),
    // reload the page and try again.
    setTimeout(function() {
      if (!window.YT || !window.YT.Player) {
        log("YouTube API not loaded, reloading");
        flushLog();
        location.reload();
      }
    }, 30000);

    document.addEventListener("visibilitychange", function() {
      trace("visibility:", document.hidden ? "hidden" : "visible", player ? playerInfo() : "(no player yet)");
      if (!player) return;
      if (document.hidden) {
        pausedByHidden = true;
        try { player.pauseVideo(); } catch(e) {}
        // Cut a transition short; the next short loads when the source is shown again
        if (endTransition) { endTransition("hidden"); }
      } else {
        const resume = pausedByHidden;
        pausedByHidden = false;
        if (pendingLoad) {
          loadNextVideo();
        } else if (resume && !advancing) {
          try { player.playVideo(); } catch(e) {}
          // A quick hide/show can leave the player paused, so check again
          setTimeout(function() {
            if (document.hidden || advancing || !player) return;
            try {
              if (player.getPlayerState() === YT.PlayerState.PAUSED) { player.playVideo(); }
            } catch(e) {}
          }, 1000);
        }
      }
    });

    // Refresh the shorts pool hourly, without resetting playback position
    setInterval(function() {
      refreshIds();
    }, 60 * 60 * 1000);

    // Check for updates
    fetch('/api/version')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.updateAvailable) {
          var btn = document.getElementById('update-btn');
          btn.href = data.updateAvailable.downloadUrl;
          btn.textContent = '🎉 Update v' + data.updateAvailable.version;
          btn.classList.add('show');
        }
      })
      .catch(function() {});
  </script>
</body>
</html>`;
