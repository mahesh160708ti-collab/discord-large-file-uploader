# 🚀 Discord Large File Uploader (DropDirect)

An open-source, high-performance Discord bot and companion web service that allows Discord users to upload and share large files up to **2 GB** without requiring Discord Nitro or routing multi-gigabyte files through the bot gateway.

---

## ✨ Features

- **2 GB File Sharing (Zero Nitro Needed)**: Upload and share large files directly in Discord.
- **⚡ 3x – 5x Faster Uploads**: High-speed browser multipart uploads with 4 concurrent parallel streams.
- **💾 Dual Storage Engines**:
  - **Local Disk Storage**: 100% self-hosted on your hard drive — zero external cloud storage accounts needed.
  - **S3 / Cloudflare R2**: Cloud-native object storage with $0 egress fees.
- **📦 Windows Executable (.exe) & Media Support**: Transparent `.exe` programs, installers, and game builds supported, with built-in protection against disguised binaries.
- **🔒 Ephemeral Links & Quotas**: Configurable file expiration (1 hour to 30 days), max download counters, and user quotas (e.g. 5 GB per user).
- **🛡️ Multi-Tier Security**:
  - Extension blacklist (`.scr`, `.bat`, `.cmd`, `.lnk`, etc.)
  - Right-to-Left Override (RLO `\u202E`) rejection
  - Deceptive double-extension blocking (e.g. `photo.png.exe`)
  - Server-side binary magic-byte inspection (PE `MZ`, ELF, Mach-O, LNK)
- **🤖 User App & Guild Bot**: Supports both Server Invites and Discord's new Personal User-Installable Apps (can be used across any server, DM, or group chat).

---

## 🛠️ Slash Commands

| Command | Description |
| :--- | :--- |
| `/upload` | Generate a secure, temporary direct upload link (up to 2 GB) |
| `/files` | View your active uploaded files, download counts, and quota |
| `/info` | Check remaining downloads and expiration of a shared file |
| `/delete` | Instantly delete an uploaded file and free up quota |
| `/extend` | Extend file expiration (if your quota allows) |
| `/file-ban` | Moderator action: immediately delete and ban an abusive file |

---

## 🚀 Quick Start

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<your-username>/discord-large-file-uploader.git
cd discord-large-file-uploader
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials:
```env
# Discord Bot Credentials
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# PostgreSQL Database (e.g. free serverless DB from Neon.tech)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# Storage Engine: 'local' (built-in disk storage) or 's3' (Cloudflare R2 / AWS S3)
STORAGE_TYPE=local

# Web Service Configuration
PORT=3000
BASE_URL=http://localhost:3000
```

### 3. Run Database Migrations
```bash
npm run migrate
```

### 4. Deploy Discord Slash Commands
```bash
npm run deploy-commands
```

### 5. Start the Application
```bash
npm run dev
```

---

## 🐳 Docker Deployment

You can run the entire service in an unprivileged, multi-stage Docker container:

```bash
docker compose up -d --build
```

---

## 🧪 Testing

Run the Vitest automated test suite:

```bash
npm test
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
