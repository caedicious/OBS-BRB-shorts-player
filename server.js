const express = require("express");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = 3000;

// Get local IP address
function getLocalIP() {
  const os = require("os");
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "YOUR_IP";
}

// Config via environment variables (more secure than plain text file)
// Uses Windows user-level environment variables for persistence

function loadConfig() {
  const apiKey = process.env.OBS_BRB_YT_API_KEY;
  const channelId = process.env.OBS_BRB_YT_CHANNEL_ID;
  const filterMode = process.env.OBS_BRB_FILTER_MODE || "hashtag";
  
  if (apiKey && channelId) {
    return { apiKey, channelId, filterMode };
  }
  return null;
}

function saveConfig(config) {
  const { execSync } = require("child_process");
  
  // Set for current process immediately
  process.env.OBS_BRB_YT_API_KEY = config.apiKey;
  process.env.OBS_BRB_YT_CHANNEL_ID = config.channelId;
  process.env.OBS_BRB_FILTER_MODE = config.filterMode || "hashtag";
  
  // Set persistent user environment variables (Windows)
  if (process.platform === "win32") {
    try {
      // Escape any quotes in values
      const safeApiKey = config.apiKey.replace(/"/g, '');
      const safeChannelId = config.channelId.replace(/"/g, '');
      const safeFilterMode = (config.filterMode || "hashtag").replace(/"/g, '');
      
      execSync(`setx OBS_BRB_YT_API_KEY "${safeApiKey}"`, { stdio: 'ignore' });
      execSync(`setx OBS_BRB_YT_CHANNEL_ID "${safeChannelId}"`, { stdio: 'ignore' });
      execSync(`setx OBS_BRB_FILTER_MODE "${safeFilterMode}"`, { stdio: 'ignore' });
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
  
  // Clear persistent environment variables (Windows)
  if (process.platform === "win32") {
    try {
      execSync('setx OBS_BRB_YT_API_KEY ""', { stdio: 'ignore' });
      execSync('setx OBS_BRB_YT_CHANNEL_ID ""', { stdio: 'ignore' });
      execSync('setx OBS_BRB_FILTER_MODE ""', { stdio: 'ignore' });
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
    
    const req = client.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        });
      });
    });
    req.on("error", reject);
  });
}

// Cache for shorts
let cache = { at: 0, ids: [] };
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    .toggle-option input[type="radio"]:checked + .toggle-label strong {
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
          body: JSON.stringify({ apiKey, channelId, filterMode })
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
  const { apiKey, channelId, filterMode } = req.body;

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

    // Save config with filter mode (default to hashtag if not provided)
    saveConfig({ 
      apiKey, 
      channelId, 
      filterMode: filterMode || "hashtag" 
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
      filterMode: config.filterMode || "hashtag"
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
  res.json({ localIP: getLocalIP() });
});

// OBS Guide page
app.get("/obs-guide", (req, res) => {
  res.type("html").send(obsGuideHtml);
});

// Settings page (to reconfigure)
app.get("/settings", (req, res) => {
  const config = loadConfig();
  const currentFilterMode = (config && config.filterMode) || "hashtag";
  
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
  
  res.type("html").send(settingsHtml);
});

app.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIP();
  
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
  </style>
</head>
<body>
  <div id="status"></div>
  <button id="guide-btn" onclick="location.href='/obs-guide'">📺 OBS Guide</button>
  <button id="settings-btn" onclick="location.href='/settings'">⚙️ Settings</button>
  <div id="player"></div>

  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    let ids = [];
    let queue = [];
    let index = 0;
    let player = null;
    let pausedByHidden = false;

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
          showStatus("Loaded " + ids.length + " shorts" + (json.cached ? " (cached)" : ""));
        })
        .catch(function() {
          showStatus("Failed to load shorts", 5000);
        });
    }

    function nextId() {
      if (!queue.length) return null;
      const id = queue[index++];
      if (index >= queue.length) {
        queue = shuffle(ids.slice());
        index = 0;
      }
      return id;
    }

    function playNext() {
      const id = nextId();
      if (!id || !player) return;
      player.loadVideoById({ videoId: id, suggestedQuality: "hd1080" });
    }

    function tryUnmuteAndPlay() {
      if (!player) return;
      try { player.unMute(); } catch(e) {}
      try { player.setVolume(100); } catch(e) {}
      try { player.playVideo(); } catch(e) {}
    }

    window.onYouTubeIframeAPIReady = function() {
      showStatus("Loading shorts...");
      loadIds().then(function() {
        if (!ids.length) {
          showStatus("No shorts found! Check settings.", 10000);
          return;
        }

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
              playNext();
              setTimeout(function() {
                tryUnmuteAndPlay();
              }, 600);

              setInterval(function() {
                if (!document.hidden) tryUnmuteAndPlay();
              }, 3000);
            },
            onStateChange: function(e) {
              if (e.data === YT.PlayerState.ENDED) playNext();
            },
            onError: function(e) {
              console.log("Player error:", e.data);
              playNext();
            }
          }
        });
      });
    };

    document.addEventListener("visibilitychange", function() {
      if (!player) return;
      if (document.hidden) {
        pausedByHidden = true;
        try { player.pauseVideo(); } catch(e) {}
      } else if (pausedByHidden) {
        pausedByHidden = false;
        tryUnmuteAndPlay();
      }
    });

    // Refresh shorts list every hour
    setInterval(function() {
      loadIds().catch(function() {});
    }, 60 * 60 * 1000);
  </script>
</body>
</html>`;
