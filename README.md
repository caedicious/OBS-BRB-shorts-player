# OBS BRB Shorts

A simple, local app that plays YouTube Shorts in shuffle/loop mode — perfect for OBS "Be Right Back" scenes.

[![Release](https://img.shields.io/github/v/release/caedicious/OBS-BRB-shorts-player?include_prereleases)](https://github.com/caedicious/OBS-BRB-shorts-player/releases/)
[![Downloads](https://img.shields.io/github/downloads/caedicious/OBS-BRB-shorts-player/total)](https://github.com/caedicious/OBS-BRB-shorts-player/releases)
[![License](https://img.shields.io/github/license/caedicious/OBS-BRB-shorts-player)](LICENSE.txt)
![Platform](https://img.shields.io/badge/platform-Windows-blue)

## Features

- 🎬 Plays all Shorts from any YouTube channel
- 🔀 Shuffles and loops endlessly
- 🔊 Full audio support (captured via OBS)
- ⏸️ Auto-pauses when OBS scene is hidden
- 🌐 Network accessible (use on any device)
- 🧙 First-run setup wizard (no terminal required)
- 📦 Single executable (no Node.js needed for end users)
- ⬆️ Offers new versions when it starts and installs them for you

## For End Users

### Installation

1. Download `OBS-BRB-Shorts-Setup.exe` from Releases
2. Run the installer. The installer isn't code-signed yet, so Windows SmartScreen may warn you: click **More info**, then **Run anyway**
3. Launch "OBS BRB Shorts" from Start Menu
4. Follow the setup wizard to enter your YouTube API key and Channel ID
5. Add `http://localhost:3000/player` as an OBS Browser Source

### OBS Setup

1. Add a new **Browser Source**
2. URL: `http://localhost:3000/player`
3. Width/Height: Match your canvas (e.g., 1920x1080)
4. ✅ Check "Control audio via OBS"
5. ✅ Check "Shutdown source when not visible"
6. Optionally: "Refresh browser when scene becomes active"

### Updates

When a new version is out, the app asks when it starts: **Install new update** or **Not right now**, with a **Do not remind me about this version** checkbox. Installing downloads the new installer from this repo's Releases, checks it, and installs it in the background. Windows asks for permission once, then the app restarts on its own. The prompt only appears when the app starts, never in the middle of a stream.

Versions older than 1.1.1 can't update themselves: install 1.1.1 once from Releases and it handles updates from then on.

### Getting a YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Click **+ CREATE CREDENTIALS** → **API key**
4. Copy the key
5. Enable [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)

### Finding Your Channel ID

Your Channel ID starts with `UC` and is 24 characters long.

- If your channel URL is `youtube.com/channel/UCxxxxx`, the ID is `UCxxxxx`
- If your URL is `youtube.com/@username`, use [this tool](https://commentpicker.com/youtube-channel-id.php) to find it

---

## For Developers

### Prerequisites

- Node.js 18+ 
- npm
- (For building installer) [Inno Setup 6](https://jrsoftware.org/isdl.php)

### Development Setup

```bash
# Clone the repo
git clone https://github.com/caedicious/OBS-BRB-shorts-player.git
cd OBS-BRB-shorts-player

# Install dependencies
npm install

# Run in development
npm start
```

Visit `http://localhost:3000` to configure and test.

### Building the Executable

**Option A: Use the build script**

```bash
build.bat
```

**Option B: Manual**

```bash
# Install pkg globally
npm install -g pkg

# Build
pkg . --targets node18-win-x64 --output dist/OBS-BRB-Shorts.exe
```

### Building the Installer

1. Install [Inno Setup 6](https://jrsoftware.org/isdl.php)
2. Open `installer.iss` in Inno Setup Compiler and click Build → Compile, or from the command line:
   `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss`
3. Find `OBS-BRB-Shorts-Setup.exe` in the `installer/` folder

When releasing, bump `const VERSION` in `server.js` (the in-app update check compares it against the latest GitHub release tag) and `MyAppVersion` in `installer.iss`.

The in-app updater relies on two things in every release:
- The installer is attached as exactly `OBS-BRB-Shorts-Setup.exe`
- Its SHA-256 is available: GitHub publishes a digest for each uploaded asset, which the updater checks. If that's ever missing, attach a `SHA256SUMS.txt` (`<sha256>  OBS-BRB-Shorts-Setup.exe`); with neither, the updater refuses to install

Installed builds check GitHub at launch and install via `/VERYSILENT`, then restart the app. Dev runs (`npm start`) and exes run straight from `dist/` only print the notice. The download, `update.log` (the updater's steps) and `install.log` (Inno Setup's) live in `%LOCALAPPDATA%\OBS-BRB-Shorts\update`.

### Project Structure

```
obs-brb-shorts/
├── server.js        # Main application
├── package.json     # Dependencies & build config
├── build.bat        # Windows build script
├── installer.iss    # Inno Setup installer script
├── LICENSE.txt      # MIT License
├── README.md        # This file
├── icon.ico         # App icon (create your own)
├── dist/            # Built executable (after build)
└── installer/       # Built installer (after Inno compile)
```

### Configuration Storage

User config is stored in **Windows User Environment Variables** (not plain text files):
- `OBS_BRB_YT_API_KEY` - YouTube Data API v3 key
- `OBS_BRB_YT_CHANNEL_ID` - YouTube channel ID
- `OBS_BRB_FILTER_MODE` - Filter mode ("hashtag" or "duration")
- `OBS_BRB_USE_TRANSITION` - TV static transition between Shorts ("true" or "false")
- `OBS_BRB_SKIP_UPDATE_VERSION` - The version the user asked not to be reminded about

This is more secure than storing credentials in a plain text config file.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Redirects to `/setup` or `/player` |
| `GET /setup` | Setup wizard |
| `GET /settings` | Reconfigure settings |
| `GET /player` | The Shorts player |
| `GET /obs-guide` | Built-in OBS setup guide |
| `GET /api/shorts` | Returns the channel's Short IDs (the player shuffles them) |
| `GET /api/config` | Check config status |
| `GET /api/version` | Current version and update info |
| `GET /api/player-log` | What the player has been doing (paste this into bug reports) |
| `GET /api/network-info` | Local IP address, for the guide page |
| `POST /api/setup` | Save configuration |
| `POST /api/clear-config` | Clear saved configuration |
| `GET /transition.mp4` | TV static transition clip |

### Caching

- Shorts list is cached for 6 hours to conserve API quota
- Player refreshes the list every hour
- Restart the app to force a refresh

---

## Troubleshooting

### "No shorts found"
- Make sure your Shorts have `#shorts` in the title or description
- Check that your API key has YouTube Data API v3 enabled
- Verify your Channel ID is correct (starts with `UC`, 24 chars)

### Audio not working in OBS
- Enable "Control audio via OBS" in Browser Source settings
- Check OBS Audio Mixer for the browser source

### Can't access from other devices
- Make sure Windows Firewall allows port 3000
- Use your computer's local IP (e.g., `http://192.168.x.x:3000/player`)

### API quota exceeded
- The app caches results for 6 hours to minimize API calls
- Free tier allows 10,000 units/day — should be plenty
- If exceeded, wait 24 hours or create a new API key

---

## License

MIT License - see [LICENSE.txt](LICENSE.txt)
