# OBS BRB Shorts

A simple, local app that plays YouTube Shorts in shuffle/loop mode — perfect for OBS "Be Right Back" scenes.

## Features

- 🎬 Plays all Shorts from any YouTube channel
- 🔀 Shuffles and loops endlessly
- 🔊 Full audio support (captured via OBS)
- ⏸️ Auto-pauses when OBS scene is hidden
- 🌐 Network accessible (use on any device)
- 🧙 First-run setup wizard (no terminal required)
- 📦 Single executable (no Node.js needed for end users)

## For End Users

### Installation

1. Download `OBS-BRB-Shorts-Setup.exe` from Releases
2. Run the installer
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
git clone https://github.com/yourusername/obs-brb-shorts.git
cd obs-brb-shorts

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
2. Create an `icon.ico` file (256x256 recommended) or remove `SetupIconFile` from `installer.iss`
3. Open `installer.iss` in Inno Setup Compiler
4. Build → Compile
5. Find `OBS-BRB-Shorts-Setup.exe` in the `installer/` folder

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

This is more secure than storing credentials in a plain text config file.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Redirects to `/setup` or `/player` |
| `GET /setup` | Setup wizard |
| `GET /settings` | Reconfigure settings |
| `GET /player` | The Shorts player |
| `GET /api/shorts` | Returns shuffled Short IDs |
| `GET /api/config` | Check config status |
| `POST /api/setup` | Save configuration |

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
