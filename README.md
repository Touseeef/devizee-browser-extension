# Devizee - Privacy-Focused Download Manager
### Universal Browser Companion for Devizee Lite & Devizee Pro

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Devizee Extension Logo" style="border-radius: 20px; box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);" />
</p>

<p align="center">
  <b>The fastest, cleanest, and most private media downloader extension for modern Chromium browsers.</b><br>
  Interactive crosshair sniffer, intelligent multi-video detection, and zero-latency local relaying.
</p>

<p align="center">
  <a href="https://github.com/Touseeef/devizee-lite-universal-video-downloader"><img src="https://img.shields.io/badge/Desktop_App-Devizee_Lite-6366f1?style=for-the-badge&logo=windows&logoColor=white" alt="Devizee Lite" /></a>
  <img src="https://img.shields.io/badge/Manifest-V3-10b981?style=for-the-badge" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Privacy-100%25_Local-38bdf8?style=for-the-badge" alt="100% Local" />
  <img src="https://img.shields.io/badge/Telemetry-Zero-f59e0b?style=for-the-badge" alt="Zero Telemetry" />
  <img src="https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge" alt="License" />
</p>

---

## ⚡ What is Devizee Extension?

**Devizee Extension** is the official open-source browser companion for the [Devizee Desktop Application](https://github.com/Touseeef/devizee-lite-universal-video-downloader). It bridges the gap between web browsing and desktop downloading—eliminating messy copy-pasting, sketchy online conversion websites, and invasive tracking cookies.

Whenever you encounter a video, audio track, live stream, or media link on the web, Devizee lets you capture it with a single click and beams it straight into your desktop app for ultra-fast, multi-threaded downloading in up to **8K, 4K, 60fps HDR video** or studio-grade **uncompressed audio (MP3 320kbps, FLAC, WAV, Opus)**.

---

## 🚀 Key Features

### 🎯 1. Interactive Link & Media Sniffer (Crosshair Selector Mode)
* Click the **Sniffer** icon in the extension popup or on the floating action pill to activate **Targeting Mode**.
* Your mouse cursor transforms into an interactive **precision crosshair**.
* Hover over any video player, audio element, YouTube/Vimeo embed, or downloadable link to reveal a **glowing violet highlight box** with a live badge showing its media type and target address.
* Click once to immediately dispatch that exact stream to your desktop app with a pleasant visual confirmation pulse. Press `Esc` at any time to cancel.

### 📡 2. Multi-Media Radar & "Now Playing" Detection
* Web pages like Twitter/X, TikTok, Reddit, Instagram, or news articles frequently contain multiple media streams on a single page.
* Devizee automatically scans the page and organizes every detected video and audio stream into a clean list inside the popup.
* **"Now Playing" Indicator**: Actively monitors playback state and highlights whichever video you are currently watching with a pulsing green indicator.
* **Individual Downloads**: Download any detected stream independently with duration and resolution tags.
* **"Queue All" Batching**: Send all detected media items on the page to Devizee in one click.
* **Dynamic Toolbar Badge**: The extension icon displays a live badge counter (e.g. `3`) showing the number of available streams.

### ⚡ 3. Sleek Floating Video Grabber Pill
* Unobtrusively appears in the corner of media sites and pages with active videos.
* Built with modern glassmorphism styling and razor-sharp **vector SVG icons** (no cheesy raw emojis).
* One-click trigger for the interactive Sniffer or instant one-click download of the active video.
* Easy dismiss button (`×`) to hide the pill whenever you want a completely unobstructed view.

### 🏠 4. Direct-to-Dashboard Navigation
* Previous extensions left you lost on download history pages. Devizee automatically focuses the desktop app and brings you straight to the **Dashboard Tab**.
* The URL is instantly populated, formats and resolutions are analyzed in real time, and the format selector is presented immediately.

### 🎨 5. 4 Aesthetic Themes
Fully synchronized with the desktop application's design system:
* **Signature Dark**: Iconic deep obsidian interface with glowing indigo/violet accents.
* **OLED Pure Black**: 100% `#000000` pitch black designed for infinite contrast on AMOLED displays.
* **Frost Slate**: Cool slate and arctic cyan aesthetic.
* **Daylight Clean**: Crisp, high-contrast light mode for bright workspaces.
* Includes an instant theme switcher in the popup header and options page with live color cards.

### 🔒 6. 100% Local Loopback Privacy
* **Zero Telemetry**: No tracking beacons, analytics, or third-party tracking scripts.
* **Zero Cloud Proxies**: Media URLs are never sent through a remote server. Everything communicates strictly over local host loopback (`127.0.0.1`).
* **Zero Cookie Exfiltration**: Follows strict security protocols (SEC-9)—session credentials are never stolen or transmitted.

---

## 🌐 Supported Sites & Platforms

Devizee works universally across **1,000+ video and audio platforms**, including:

| Platform | Video Quality | Audio Extraction | Playlists & Streams |
| :--- | :---: | :---: | :---: |
| **YouTube & Shorts** | Up to 8K / 4K 60fps HDR | MP3 320k, FLAC, WAV, Opus | Yes (Full Playlists) |
| **TikTok** | Original HD (No Watermark) | Original Audio / Sounds | Yes |
| **Instagram** | Reels, Stories, Posts | Audio Tracks | Yes |
| **Twitter / X** | Full HD Videos & Clips | Audio Tracks | Yes |
| **Facebook & Watch** | Up to 1080p / 4K | Original Audio | Yes |
| **Vimeo** | High-bitrate 1080p / 4K | Lossless Audio | Yes |
| **SoundCloud** | Highest Bitrate Streams | MP3 / Opus / FLAC | Yes (Sets & Tracks) |
| **Twitch** | VODs & Highlight Clips | Audio Only | Yes |
| **Reddit** | Combined Video + Audio | Audio Only | Yes |
| **Bilibili, Dailymotion, etc.** | Full Quality | High Quality | Yes |

---

## 🛠️ Architecture & Under the Hood

The extension employs a multi-tiered fallback architecture to guarantee reliable communication with your desktop application:

```
[ Web Browser ]
      │
      ├── 1. HTTP Local Loopback (Primary) ──► 127.0.0.1:42421 (Devizee Lite)
      │                                    └── 127.0.0.1:42422 (Devizee Pro)
      │
      ├── 2. Native Messaging Host ──────────► com.devizee.native_host
      │
      └── 3. Safe OS Protocol Handlers ──────► devizee://download?url=...
                                           └── streamgrab://download?url=...
```

* **Target Mode Options**:
  * **Auto-Detect (Default)**: Automatically discovers whether Devizee Lite or Devizee Pro is currently active.
  * **Devizee Lite**: Enforces communication exclusively on Port `42421`.
  * **Devizee Pro**: Enforces communication exclusively on Port `42422`.

---

## 📦 Installation Guide

### Supported Browsers
Compatible with all Chromium-based browsers:
* Google Chrome
* Microsoft Edge
* Brave Browser
* Opera & Opera GX
* Vivaldi
* Arc for Windows

### Setup Steps
1. Clone or download this repository:
   ```bash
   git clone https://github.com/Touseeef/devizee-browser-extension.git
   ```
2. Open your browser and navigate to the extensions management page:
   * Chrome / Brave / Arc: `chrome://extensions`
   * Edge: `edge://extensions`
3. Enable **Developer Mode** (toggle button in top-right or sidebar).
4. Click the **Load unpacked** button.
5. Select the folder where you cloned this repository (`devizee-browser-extension`).
6. Pin the **Devizee** icon to your browser toolbar for quick access!

---

## 📂 Repository Structure

```
devizee-browser-extension/
├── icons/
│   ├── icon16.png            # 16x16 Favicon badge
│   ├── icon32.png            # 32x32 Toolbar standard
│   ├── icon48.png            # 48x48 Extension list view
│   └── icon128.png           # 128x128 High-res store icon
├── background.js             # Service worker (loopback relay, protocol fallback, badges)
├── content.js                # Media scanner, crosshair sniffer, floating action pill
├── content.css               # Glassmorphic styles, targeting animations, themes
├── popup.html                # Modern popup UI with multi-media list & theme selector
├── popup.js                  # Multi-media rendering, status checks, theme persistence
├── options.html              # Dedicated settings page with visual theme cards
├── options.js                # Configuration manager and local preferences
├── com.devizee.native_host.json  # Native Messaging host manifest definition
├── manifest.json             # Manifest V3 specification
├── .gitignore                # Production git rules
└── README.md                 # Project documentation
```

---

## 🤝 Related Projects

* **[Devizee Lite Desktop App](https://github.com/Touseeef/devizee-lite-universal-video-downloader)**: The open-source, local-first multimedia download manager and playback hub for Windows.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - feel free to use, modify, and distribute.
