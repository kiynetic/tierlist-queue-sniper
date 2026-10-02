# qPilot - Minecraft PvP Tierlist Queue Sniper (Supports MCTiers, PvPTiers and more)

A very customizable fast desktop application built with Electron to monitor Discord servers and instantly snipe waitlists for MCTiers, PvPTiers, and custom tierlist servers.

qPilot connects directly to Discord Gateway WebSockets to detect message updates and interaction buttons the millisecond they appear, joining queues faster than manual clicking.

---

## Features

- **Instant Gateway Sniping**: Listens to raw Discord Gateway WebSocket events. When a queue opens, it fires interaction requests immediately without polling lag.
- **Dynamic Channel Detection**: Automatically scans your joined servers for waitlist channels across regions (AS/AU/NA/EU/AF/SA and more)
- **Custom Server & Button Support**: Add any server and waitlist channel manually. You can also define custom join button labels (like "Enter Queue" or "Join Waitlist") for lesser-known tierlists (or cracked tierlists)
- **Multi-Account Sniping**: Connect multiple Discord accounts and arm them simultaneously.
- **Queue Cooldown & Anti-Clash**: Displays a prompt when you successfully join a queue and can pause other tierlists for a configurable duration (default 1 hour) so you do not accidentally get into two queues at the same time.
- **Idle Detection**: Automatically pauses queue joining when your computer is left completely idle with no mouse or keyboard input for a set amount of time. This can be changed in settings.
- **System Tray Integration**: Minimize to tray with quick pause and resume controls from the taskbar context menu.
- **Local & Secure**: Your Discord tokens are stored locally on your machine and never sent anywhere else.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/2x360/tierlist-queue-sniper.git
   cd tierlist-queue-sniper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the app:
   ```bash
   npm start
   ```

---

## How to Get Your Discord Token

1. Open Discord in your desktop browser or the desktop client.
2. Press `Ctrl + Shift + I` to open Developer Tools.
3. Switch to the **Console** tab.
4. Paste the following snippet and press `Enter`:
   ```javascript
   window.webpackChunkdiscord_app.push([[""],{},e=>{for(let c in e.c)m.push(e.c[c])},m.find(m=>m?.exports?.default?.getToken!==void 0).exports.default.getToken()}])
   ```
5. Copy the returned string and paste it into qPilot.

---

## Building / Packaging

To build a standalone Windows executable:

```bash
npm run package
```

The packaged application will be generated in `dist/qPilot-win32-x64/qPilot.exe`.

---

## Disclaimer

Automating user accounts (self-botting) is against Discord's Terms of Service. Use this application responsibly and at your own risk.
