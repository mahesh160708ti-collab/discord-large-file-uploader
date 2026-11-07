<div align="center">

# ⚡ DropDirect — Discord Large File Uploader

**Share files up to 2 GB directly in Discord — completely free, zero Discord Nitro required.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Discord.js v14](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![Fastify](https://img.shields.io/badge/Fastify-v4-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests Passing](https://img.shields.io/badge/Tests-58%2F58%20Passing-10b981?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![Nitro Alternative](https://img.shields.io/badge/Discord%20Nitro-Not%20Required-success?style=for-the-badge&logo=discord)](https://github.com/mahesh160708ti-collab/discord-large-file-uploader)

<br/>

[**Explore Features**](#-key-features) • [**Why DropDirect?**](#-why-dropdirect-vs-discord-nitro) • [**Quick Start**](#-quick-start) • [**Slash Commands**](#-slash-command-reference) • [**Security Architecture**](#-multi-tier-anti-malware-defense) • [**Deploy 24/7**](#-1-click-cloud-deployment)

</div>

---

## 💡 Why DropDirect vs. Discord Nitro?

| Feature | Standard Discord | Discord Nitro ($9.99/mo) | ⚡ **DropDirect (Free)** |
| :--- | :---: | :---: | :---: |
| **Max File Upload** | 25 MB | 500 MB | 🚀 **2,048 MB (2.0 GB)** |
| **Cost** | Free | \$9.99 / month | **$0.00 Forever** |
| **Transfer Speed** | Standard | Standard | ⚡ **3x – 5x Parallel Chunk Streaming** |
| **Custom Expiry** | ❌ Permanent | ❌ Permanent | ✅ **1 Hour to 30 Days (Self-destruct)** |
| **Download Limits** | ❌ Unlimited | ❌ Unlimited | ✅ **Cap downloads (1 to 500 max)** |
| **Storage Engine** | Proprietary | Proprietary | ✅ **Local Disk OR Cloudflare R2 / S3** |
| **Executables (.exe)** | Blocked or Flagged | Blocked or Flagged | ✅ **Supported with anti-spoof protection** |
| **App Scope** | Server only | Server only | ✅ **Works in Servers, DMs & Group Chats** |

---

## ✨ Key Features

### 🚀 Direct-to-Storage Architecture
Uploads never travel through Discord's gateway or bottleneck the bot container. Your browser uploads multi-gigabyte chunks directly to storage via presigned multipart requests.

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 Discord User
    participant Bot as 🤖 DropDirect Bot
    participant Web as 🌐 Web Companion
    participant Store as 💾 Storage (Local Disk / S3 / R2)

    User->>Bot: Runs /upload
    Bot-->>User: Ephemeral one-time secure link
    User->>Web: Opens upload page & drops file (up to 2 GB)
    Web->>Web: Inspects magic bytes & validates filename
    par 4-Stream Parallel Transfer
        Web->>Store: Uploads Chunk 1 (16 MB)
        Web->>Store: Uploads Chunk 2 (16 MB)
        Web->>Store: Uploads Chunk 3 (16 MB)
        Web->>Store: Uploads Chunk 4 (16 MB)
    end
    Web->>Bot: Complete multipart upload
    Bot-->>User: Instant download embed in Discord channel or DM!
```

- **⚡ 4-Stream Concurrent Engine**: Uploads 4 parts simultaneously with automatic retry on network drops, slashing upload times by up to **75%**.
- **💾 Flexible Dual Storage**:
  - **Local Hard Drive Engine**: Store files directly on your server or PC disk with zero third-party accounts or cloud dependencies.
  - **Cloudflare R2 / AWS S3**: Plug in any S3-compatible cloud bucket with **$0 egress/bandwidth fees**.
- **📦 Windows Executable (.exe) Sharing**: Share game mods, installers, tools, and developer builds with safety banners and anti-disguise checks.
- **🤖 Dual Installation (User App + Guild Bot)**: Works as a regular server bot or installed directly to your Discord account (**User Install**) so you can run `/upload` anywhere across Discord without anti-nuke bots blocking you.

---

## 🛡️ Multi-Tier Anti-Malware Defense

DropDirect protects Discord communities with industrial-grade safety validations:

1. **Magic-Byte Sniffing**: Inspects the object's raw binary header bytes (`0x4D 0x5A` for PE, ELF, Mach-O, and `.lnk` shortcuts). Disguised binaries (e.g. an `.exe` disguised as a `.png` or `.pdf`) are instantly blocked and quarantined.
2. **Right-to-Left Override (RLO) Defense**: Rejects Unicode spoofing characters (`\u202E`) that hackers use to reverse filenames.
3. **Double Extension Blocker**: Prevents deceptive spoofing like `photo.png.exe` or `document.pdf.scr`.
4. **Phishing & Token Grabber Heuristics**: Rejects files with keywords associated with Discord token grabbers, Nitro scams, or credential stealers.
5. **Safety Advisory Banners**: Clear download page badges alerting recipients when opening executable programs.

---

## 🎮 Slash Command Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| `/upload` | `/upload [expires] [max_downloads] [private]` | Generates an upload link (options: 1h to 30d expiry, download cap, or private DM delivery) |
| `/files` | `/files` | View your currently active uploaded files, download counts, and remaining quota |
| `/info` | `/info public_id:<ID>` | View details, downloads remaining, and expiration timer for a file |
| `/delete` | `/delete public_id:<ID>` | Instantly eradicate an uploaded file from disk/cloud and reclaim quota |
| `/extend` | `/extend public_id:<ID> expires:<duration>` | Extend the expiration timer of an active upload |
| `/file-ban` | `/file-ban public_id:<ID> [ban_user:true]` | **Moderator command**: Delete an abusive file and suspend the uploader |

---

## 🚀 Quick Start (Local Setup)

### 1. Clone the Repository
```bash
git clone https://github.com/mahesh160708ti-collab/discord-large-file-uploader.git
cd discord-large-file-uploader
npm install
```

### 2. Configure Environment (`.env`)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Provide your Discord bot token and database:
```env
# Discord Developer Portal
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here

# PostgreSQL Database (Free from Neon.tech)
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Storage Mode: 'local' (hard drive) or 's3' (Cloudflare R2 / AWS S3)
STORAGE_TYPE=local

# Network Settings
PORT=3000
BASE_URL=http://localhost:3000
```

### 3. Run Migrations & Register Slash Commands
```bash
npm run migrate
npm run deploy-commands
```

### 4. Start the Application
```bash
npm run dev
```

---

## ☁️ 1-Click Cloud Deployment

### Deploy to Railway (24/7 in 1 Click)
1. Fork or push this repository to your GitHub account.
2. In [Railway.com](https://railway.com), click **New Project** → **Deploy from GitHub Repo**.
3. Under **Variables**, add:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DATABASE_URL` (free Postgres from [Neon.tech](https://neon.tech))
   - `STORAGE_TYPE=local`
   - `PORT=3000`
4. Under **Settings** → **Networking**, click **Generate Domain** and add:
   - `BASE_URL=https://<your-railway-domain>`

### Run with Docker Compose
```bash
docker compose up -d --build
```

---

## 🧪 Testing

DropDirect includes a comprehensive Vitest automated test suite covering unit tests, security validators, multipart chunk handlers, and live HTTP socket tests:

```bash
npm test
```

```text
✓ tests/views/htmlValidation.test.ts  (2 tests)
✓ tests/security/magicBytes.test.ts   (6 tests)
✓ tests/security/validator.test.ts    (6 tests)
✓ tests/services/uploadService.test.ts (4 tests)
✓ tests/storage/localStorage.test.ts  (1 test)
✓ tests/integration/liveServer.test.ts (9 tests)
✓ tests/integration/e2e.test.ts       (2 tests)

Test Files  15 passed (15)
     Tests  58 passed (58)
```

---

## 🌟 Support & Starring

If DropDirect helps you share large files with your friends or gaming community:

⭐ **Star this repository** — it helps more developers and Discord communities discover it!  
🔀 **Fork it** — customize quotas, themes, or add custom branding for your server.  
🐛 **Report Issues** — file a bug report or feature request in [GitHub Issues](https://github.com/mahesh160708ti-collab/discord-large-file-uploader/issues).

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.
