<p align="center">
  <img src="logo.svg" width="200" alt="MaveL Logo">
</p>

# MaveL Discord Bot

MaveL is a sophisticated, multi-purpose Discord bot built for high-performance media processing and high-fidelity music streaming. It focuses on speed, privacy, and a premium user experience through its unique room management system and advanced automation tools.

## Key Features

### Automated Gateway and Welcome System

MaveL streamlines member onboarding with a dynamic gateway system. It can automatically generate custom welcome cards for new members, providing a professional first impression for your community while keeping track of total member growth.

### Smart Role Management

To reduce administrative overhead, MaveL includes an automated role assignment feature. New members can be assigned specific roles instantly upon joining, ensuring they have immediate access to the appropriate server channels and permissions.

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

- Data Isolation: User data and playlist settings are stored securely and are not shared across different servers.
- Manual Cleanup: Administrators can use the /purge command to wipe temporary files and logs instantly.
- Access Control: The room system uses Discord's native permission overwrites to ensure that private rooms remain truly private.

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

MaveL integrates directly into the Discord "Apps" menu, which is accessible by right-clicking any message or media file. This allows for rapid interaction without the need to type manual slash commands.

### Quick Media Processing

By right-clicking a video or image and selecting **Convert Media**, you can instantly trigger the conversion engine. This is particularly useful for quickly changing file formats or optimizing file sizes for sharing. Similarly, the **Inspect Media** tool allows you to view hidden metadata and technical details of any shared file.

### Text and Utility Tools

MaveL provides several text-based utilities within the Apps menu:

- **Translate Text**: Instantly translate any message to a different language.
- **Format as Code**: Automatically wrap text in a clean code block for better readability.
- **Extract Text (OCR)**: Use optical character recognition to read and copy text from images.

### Community and Moderation

The Apps menu also includes tools for server integrity and fun:

- **Vote Delete**: Start a democratic vote to remove a specific message.
- **Report to Admin**: Discreetly flag suspicious or rule-breaking content for administrator review.
- **Mock Message**: Generate a humorous or "mocking" variation of the selected text message.

## Practical Usage Scenarios

### Efficient Media Sharing

If you find a TikTok video or an Instagram Reel that you want to share without the external links, simply use `/dl`. MaveL will strip the trackers and provide a direct file that plays natively within Discord. For high-resolution requirements, you can specify `1080p` during the command execution.

### Converting Content for Mobile

Discord often has file size limits for non-Nitro users. If you have a large video file, use the `/convert` command and select the `mp4_small` option. MaveL will re-encode the video to fit under the 8MB limit while maintaining the best possible quality.

### Recovering Corrupted Links

Sometimes social media platforms update their security, causing links to fail. If a link that previously worked now returns an error, use the `/reset tunnel` command to refresh the bot's connection pool and bypass regional blocks.

## Configuration and Environment

For those interested in self-hosting or contributing to the project, the following environment variables are required in your `.env` file:

- `TOKEN`: Your Discord Bot Token.
- `CLIENT_ID`: The application ID from the Discord Developer Portal.
- `LOGS_CHANNEL_ID`: A dedicated channel for the MaveL Security System to report activities.
- `ADMIN_ID`: Your Discord User ID to grant access to system-level commands.

## Troubleshooting and Maintenance

### Connectivity Issues

If the bot responds slowly or fails to fetch metadata, use the `/scan` command. This will perform a real-time latency check against major media platforms. If a specific platform shows "Timed Out," it indicates a regional block or provider downtime.

### Cache Management

MaveL uses an intelligent caching system to provide instant music playback. If the VPS disk space becomes low, administrators should use `/purge target:temp` to safely remove old media fragments without affecting active sessions.

### Command Refresh

When new commands are added or descriptions are updated, run the `deploy-commands.js` script manually to sync the changes with Discord's global command list.

## Technology Stack

MaveL is built on a modern and efficient stack to ensure stability under heavy load:

- Core: Node.js with Discord.js v14.
- Media Extraction: Custom wrappers for yt-dlp and various specialized scraping engines.
- Audio Engine: FFmpeg and @discordjs/voice for optimized stream processing.
- Data Management: Lightweight JSON-based local database for rapid response times.

## Command Reference

## Media Downloader

The downloader supports various platforms including TikTok, Instagram, YouTube, Twitter (X), Facebook, and more.

- /dl: Download media from a provided URL. You can specify the format (MP4, MP3, or Gallery) and resolution.
- /convert: Convert attached files to different formats (Video, Audio, Image, or Document).
- /ss: Capture a high-quality screenshot of any website.
- /inspect: View detailed information and metadata (EXIF) of a file.

## Music System

High-quality audio streaming from YouTube and Bandcamp.

- /play: Play music using a song title or direct link.
- /nowplaying: Show the track currently being played.
- /queue: View the list of upcoming songs.
- /skip: Move to the next song in the queue.
- /skipto: Jump to a specific song number in the queue.
- /stop: Stop playback and disconnect the bot from the voice channel.
- /pause: Pause the current music.
- /resume: Continue playing paused music.
- /shuffle: Randomize the order of the current queue.
- /repeat: Set the queue or track to repeat.
- /clear: Remove all tracks from the queue.
- /remove: Delete a specific song from the queue.
- /playlist: Manage personal playlists (Save, Play, List, View, or Delete).
- /lyrics: Find the lyrics for the current or specified song.

## Room Management

A private channel system to organize and manage download activities.

- /room create: Generate a private download room for yourself.
- /room list: View all active rooms and request access to join.

## Tools and Information

General utility commands for users and server information.

- /search: Find music or videos across platforms. _(Supports: YouTube, YouTube Music, Spotify, Bandcamp)_
- /harvest: Utilize the OSINT engine to scan and extract public profile footprints. _(Supports: TikTok, Instagram, YouTube, Reddit, GitHub, and Global Social Scans)_
- /ping: Check the bot's connection speed and response time.
- /help: View the full command guide and bot information.
- /server: Display detailed information about the current server.
- /user: Check profile details for a specific user.
- /icon: Download high-resolution server or user icons.
- /banner: Download high-resolution server or user banners.

## Administrative and System

Commands restricted to administrators for bot and server maintenance.

- /setup: Configure the bot's primary channels.
- /delete: Purge a specified number of messages in the channel (Up to 1000 messages, including old messages).
- /emoji: Advanced emoji management (Add, Delete, Rename, or List).
- /diagnostics: View detailed system health and resource usage.
- /logs: Access the most recent system activity logs.
- /backup: Create a backup of the bot settings and database.
- /purge: Clean up temporary files or system logs.
- /hibernate: Put the bot into sleep mode to restrict usage.
- /wakeup: Deactivate sleep mode.
- /scan: Check network connectivity and platform status.
- /reset: Restore system connections or tunnels.
- /cookies: Update or refresh authentication cookies for restricted downloads.
- /move: Invitation system to add the bot to other servers.

## Context Menu Commands

Accessible by right-clicking a message or file in Discord.

- Convert Media: Quickly convert an attached file.
- Inspect Media: Expose metadata of a shared file.
- Translate Text: Translate a message to a different language.
- Extract Text (OCR): Read and extract text from an image.
- Vote Delete: Start a community vote to remove a message.
- Report to Admin: Flag a message for administrator review.
- Format as Code: Wrap message content in a code block.
- Mock Message: Generate a humorous variation of a text message.

---

Built with Love by Coflyn
