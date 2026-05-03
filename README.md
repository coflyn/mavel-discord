<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/mavel-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/mavel-logo-light.svg">
    <img alt="MaveL Logo" src="assets/mavel-logo-light.svg" width="200">
  </picture>
</p>

# MaveL Discord Bot

MaveL is a sophisticated, multi-purpose Discord bot built for high-performance media processing and high-fidelity music streaming. It focuses on speed, privacy, and a premium user experience through its unique room management system and advanced automation tools.

## Key Features

### Advanced Server Auditing

Beyond utility and music, MaveL acts as a robust security monitor for your server. It tracks and logs critical events such as message deletions and edits. By interfacing with Discord's audit logs, the bot can often identify the specific user responsible for an action, providing administrators with a clear and transparent activity trail.

### Universal Media Downloader

Unlike standard bots, MaveL uses a multi-engine approach to extract media from a massive variety of platforms. Whether it is a single video, a carousel of photos, or a full document gallery, MaveL identifies the best source.

**Supported Platforms (Categorized):**

- **Social Media:** TikTok, Instagram (Reels/Posts/Stories), Twitter/X, Threads, Facebook, Pinterest, CapCut.
- **Audio and Music:** YouTube, YouTube Music, Spotify, SoundCloud, Bandcamp.
- **Documents and Books:** Scribd, SlideShare, Academia.edu, Calameo, DocPlayer, Komiku.
- **Cloud Storage:** Google Drive, MediaFire, MEGA.
- **Restricted/Specialized:** Pixiv, and various other age-restricted media archives (nhentai, Doujindesu, XVideos, PornHub, etc).

### Private Room System

Privacy is a core pillar of MaveL. The bot allows users to create private download rooms. These rooms ensure that your download history and media interactions remain visible only to you and those you explicitly grant access to, keeping the main server channels clean and organized.

### High-Fidelity Audio

The music system is optimized for low-latency playback. By leveraging advanced caching and high-quality audio encoders, MaveL provides a seamless listening experience from sources like YouTube and Bandcamp without the typical stuttering found in generic music bots.

### Advanced Administrative Suite

For server owners, MaveL provides a complete toolkit for monitoring bot health, managing custom emojis, and maintaining system logs. The diagnostics system allows for real-time tracking of resource usage and connectivity status.

### OSINT Harvest Engine

MaveL includes an Open-Source Intelligence (OSINT) tool capable of scanning social platforms. The harvest command allows users to look up and extract public profile information and activity footprints across supported networks.

### Built-in DNS Evasion (Anti-Censorship)

To ensure uninterrupted media scraping, MaveL is equipped with a custom DNS over HTTPS (DoH) resolver. This allows the bot to bypass regional ISP blocks and censorship firewalls (such as Internet Positif) automatically, guaranteeing access to restricted platforms without relying on external VPNs.

## Getting Started

### Installation and Setup

To begin using MaveL in your server, ensure the bot has the necessary permissions to manage channels and messages. Run the /setup command to initialize the primary interaction channels.

### Creating Your First Room

Use the /room create command to generate your personal workspace. Once created, all your downloader interactions will be handled within that specific channel, ensuring a clutter-free environment for other server members.

## Security and Privacy

MaveL is designed with a security-first mindset.

- **Data Isolation:** User data and playlist settings are stored securely and are not shared across different servers.
- **Dynamic Command Menus:** System maintenance and administrative slash commands are strictly hidden from regular users natively via Discord's `setDefaultMemberPermissions`. The `/help` menu also dynamically filters content based on user roles.
- **Manual Cleanup:** Administrators can use the `/purge` command to wipe temporary files and logs instantly.
- **Access Control:** The room system uses Discord's native permission overwrites to ensure that private rooms remain truly private.

## Restricted and Specialized Content

MaveL is equipped with specialized handlers for platforms that require specific authentication or have age-restricted content, such as Pixiv and other art-sharing communities.

### Automated Safety Protocols

To maintain server safety and compliance with Discord's Terms of Service, MaveL's restricted content handlers are designed to function primarily within channels marked as NSFW (Age-Restricted). If a user attempts to download restricted media in a standard channel, the bot will provide a notification to move the activity to a secure location.

### Specialized Art Extraction

For platforms like Pixiv, MaveL does more than just download a file. It can extract full-resolution illustrations, manage multi-page galleries (Ugoira), and preserve the original artist's metadata. This ensures that the quality and attribution of the artwork remain intact during the sharing process.

## Branding and Visual Aesthetics

MaveL is designed with a premium, high-tech aesthetic that sets it apart from standard utility bots.

### Custom Visual Identity

The bot utilizes a curated set of custom server emojis and a consistent color palette (primarily "Purple Fire" and "Deep Slate") to create a cohesive brand experience. Every interaction, from progress bars to system logs, is presented in a glassmorphism-inspired layout that feels modern and alive.

### Dynamic Micro-Animations

Where possible, MaveL uses interactive components and real-time status updates to provide visual feedback. This reduces the perceived waiting time during complex media processing tasks, making the bot feel responsive and intelligent.

## System Requirements

For optimal performance when self-hosting, MaveL requires a Linux-based environment (Ubuntu 20.04+ or Debian 11+ recommended) with the following specifications:

### Hardware

- CPU: 1 Core (Shared) minimum, 2 Cores recommended for heavy audio transcoding.
- RAM: 1GB minimum, 2GB recommended if running multiple concurrent download rooms.
- Storage: At least 10GB of free space for temporary media caching and logs.

### Software Dependencies

- Runtime: Node.js 18.x or higher.
- Media Core: FFmpeg (with libopus support).
- Scraping Engine: yt-dlp (must be regularly updated to bypass platform security).
- Process Manager: PM2 is highly recommended for automatic restarts and monitoring.

## Context Menu Tools

MaveL integrates directly into the Discord "Apps" menu, accessible by right-clicking any message or media file. This allows for rapid interaction without the need to type manual slash commands. Common tools include **Media Conversion**, **OCR Extraction**, and **Translation**.

## Practical Usage Scenarios

### Efficient Media Sharing

If you find a TikTok video or an Instagram Reel that you want to share without the external links, simply use `/dl`. MaveL will strip the trackers and provide a direct file that plays natively within Discord. For high-resolution requirements, you can specify `1080p` during the command execution.

### Media Bookmarking (Reaction System)

Never lose track of a great video or artwork again! When MaveL delivers media to a channel, you can simply react to the bot's message with a checkmark emoji (✅ or ☑️). MaveL will immediately send you a private Direct Message containing a clean, formatted bookmark of the media title and original source link for your personal archive.

### Converting Content for Mobile

Discord often has file size limits for non-Nitro users. If you have a large video file, use the `/convert` command and select the `mp4_small` option. MaveL will re-encode the video to fit under the 8MB limit while maintaining the best possible quality.

### Recovering Corrupted Links

Sometimes social media platforms update their security, causing links to fail. If a link that previously worked now returns an error, use the `/reset tunnel` command to refresh the bot's connection pool and bypass regional blocks.

## Configuration and Environment

For those interested in self-hosting or contributing to the project, the following environment variables are required in your `.env` file:

- `DISCORD_TOKEN`: Your Discord Bot Token.
- `CLIENT_ID`: The application ID from the Discord Developer Portal.
- `GUILD_ID`: Your primary server ID.
- `YT_PO_TOKEN`: (Optional) YouTube Proof of Origin token for bypass.
- `TUNNEL_PORT`: (Default: 3033) Port for the media tunnel server.

## Troubleshooting and Maintenance

### Connectivity Issues

If the bot responds slowly or fails to fetch metadata, it indicates a regional block or provider downtime. You can check the system logs for more details.

### Cache Management

MaveL uses an intelligent caching system to provide instant music playback. If the VPS disk space becomes low, administrators should use `/purge target:temp` to safely remove old media fragments without affecting active sessions.

### Command Refresh

MaveL utilizes a dynamic, directory-based command loader architecture. When new commands are added to the `/commands` directory or descriptions are updated, run the `deploy-commands.js` script manually (`node deploy-commands.js`). The script will automatically scan all subdirectories, collect the updated `slashData`, and seamlessly sync the changes with Discord's global command list.

## Technology Stack & Architecture

MaveL is built on a modern and efficient stack to ensure stability under heavy load:

- **Core:** Node.js with Discord.js v14.
- **Media Extraction:** Custom wrappers for yt-dlp and various specialized scraping engines.
- **Audio Engine:** FFmpeg and `@discordjs/voice` for optimized stream processing.
- **Data Management:** Lightweight JSON-based local database for rapid response times.

### Performance & Memory Optimization

To operate efficiently on standard VPS environments, MaveL implements several advanced architectural patterns:

- **DRY Orchestration:** Platform routing and message formatting are centralized into core helper modules (e.g., `ctx.finalize`), eliminating hundreds of lines of redundant code and ensuring consistent embed styling across 20+ platforms.
- **Playwright Singleton Manager:** Instead of launching a new headless browser for every scraping task, MaveL uses a global Singleton Browser (`utils/browser.js`). Individual requests run in isolated contexts, drastically reducing RAM overhead and preventing memory leaks.
- **Self-Healing I/O:** Temporary files, database writes, and activity logs are managed asynchronously with safe file-locking patterns, preventing `EIO` crashes during intensive I/O operations.

## Command Reference

### Media Downloader

The downloader supports various platforms including TikTok, Instagram, YouTube, Twitter (X), Facebook, and more.

| Command    | Description                                       |
| :--------- | :------------------------------------------------ |
| `/dl`      | Universal media downloader (TikTok, IG, YT, etc.) |
| `/convert` | Media Converter (Video/Audio/Image/Document)      |
| `/ss`      | Capture a high-quality screenshot of any website  |
| `/inspect` | Expose detailed info and EXIF data of a file      |

### Music System

High-quality audio streaming from YouTube and Bandcamp.

| Command       | Description                                |
| :------------ | :----------------------------------------- |
| `/play`       | Play music from YouTube/Bandcamp           |
| `/nowplaying` | Show the currently playing song            |
| `/queue`      | Show the song queue                        |
| `/skip`       | Skip the current song                      |
| `/skipto`     | Skip to a specific song in queue           |
| `/stop`       | Stop music and disconnect from VC          |
| `/pause`      | Pause the music                            |
| `/resume`     | Resume the music                           |
| `/shuffle`    | Toggle shuffle mode                        |
| `/repeat`     | Set repeat mode (Off, One, All)            |
| `/clear`      | Clear the music queue                      |
| `/remove`     | Remove a song from the queue               |
| `/playlist`   | Manage your personal playlists             |
| `/lyrics`     | Find lyrics for the currently playing song |

### Room Management

A private channel system to organize and manage download activities.

| Command | Description                                 |
| :------ | :------------------------------------------ |
| `/room` | Manage private download rooms (Create/List) |

### Tools and Search

General utility commands for users and server information.

| Command    | Description                                                |
| :--------- | :--------------------------------------------------------- |
| `/search`  | Search for music and videos across platforms               |
| `/trace`   | Identify an anime or movie from an image frame             |
| `/harvest` | OSINT engine to scan and extract public profile footprints |
| `/ping`    | Check bot speed and connection                             |
| `/help`    | View MaveL help guide                                      |

### Administrative and System

Commands restricted to administrators for bot and server maintenance.

| Command        | Description                                  |
| :------------- | :------------------------------------------- |
| `/setup`       | Configure server channels for the bot        |
| `/delete`      | Purge messages (DMs or Server channels)      |
| `/emoji needs` | Check and add missing system emojis          |
| `/diagnostics` | Check bot system health and resource usage   |
| `/logs`        | View the last 15 system logs                 |
| `/backup`      | Backup the current bot settings and database |
| `/purge`       | Clean up temporary files or system logs      |
| `/hibernate`   | Put the bot into sleep mode (Admin Only)     |
| `/wakeup`      | Wake up the bot from sleep mode              |
| `/reset`       | Fix connection or system issues              |
| `/cookies`     | Update or refresh authentication cookies     |
| `/move`        | Add the bot to a different server            |

### Context Menu Commands

Accessible by right-clicking a message or file in Discord.

| Command              | Action                                          |
| :------------------- | :---------------------------------------------- |
| `Convert Media`      | Quickly convert an attached file                |
| `Inspect Media`      | Expose metadata of a shared file                |
| `Translate Text`     | Translate a message to a different language     |
| `Extract Text (OCR)` | Read and extract text from an image             |
| `Format as Code`     | Wrap message content in a code block            |
| `Mock Message`       | Generate a humorous variation of a text message |
| `Trace Anime`        | Search anime source from a frame                |
| `Trace Movie`        | Search movie source from a frame                |

---

Built with Love by Coflyn
