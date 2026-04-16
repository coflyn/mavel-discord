const { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } = require("discord.js");
const config = require("./config");

const commands = [
  new SlashCommandBuilder()
    .setName("dl")
    .setDescription("Universal media downloader")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Paste any link here (TikTok, IG, YT, etc.)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Choose download type (default: mp4)")
        .addChoices(
          { name: "Video (MP4)", value: "mp4" },
          { name: "Audio (MP3)", value: "mp3" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("resolution")
        .setDescription("Choose video resolution (default: 720p)")
        .addChoices(
          { name: "720p", value: "720" },
          { name: "1080p", value: "1080" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for music and videos")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Search platform")
        .addChoices(
          { name: "YouTube Music", value: "ytm" },
          { name: "YouTube", value: "yt" },
          { name: "Spotify", value: "spot" },
          { name: "Bandcamp", value: "bc" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("What are you looking for?")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("View MaveL help guide"),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot speed and connection"),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play music from YouTube/Bandcamp")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Song title or link")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("source")
        .setDescription("Choose music source (default: YouTube)")
        .addChoices(
          { name: "YouTube", value: "yt" },
          { name: "Bandcamp", value: "bc" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current song"),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music and disconnect from VC"),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear the music queue"),
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a song from the queue")
    .addIntegerOption((opt) =>
      opt
        .setName("number")
        .setDescription("Song position in queue")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("skipto")
    .setDescription("Skip to a specific song in queue")
    .addIntegerOption((opt) =>
      opt
        .setName("number")
        .setDescription("Song position in queue")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the currently playing song"),
  new SlashCommandBuilder().setName("pause").setDescription("Pause the music"),
  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume the music"),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the song queue"),
  new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Toggle shuffle mode")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("Shuffle mode")
        .setRequired(true)
        .addChoices({ name: "On", value: "on" }, { name: "Off", value: "off" }),
    ),
  new SlashCommandBuilder()
    .setName("repeat")
    .setDescription("Set repeat mode")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("Repeat mode")
        .setRequired(true)
        .addChoices(
          { name: "Off", value: "off" },
          { name: "One", value: "one" },
          { name: "All", value: "all" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Manage your personal playlists")
    .addSubcommand((sub) =>
      sub
        .setName("save")
        .setDescription("Save current queue as a playlist")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Playlist name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Play one of your playlists")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Playlist name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List your saved playlists"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View tracks in a playlist")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Playlist name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a playlist")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Playlist name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("harvest")
    .setDescription("Analyze and get info from social profiles")
    .addStringOption((opt) =>
      opt
        .setName("target")
        .setDescription("Choose platform to harvest")
        .setRequired(false)
        .addChoices(
          { name: "TikTok", value: "tiktok" },
          { name: "Instagram", value: "instagram" },
          { name: "YouTube", value: "youtube" },
          { name: "GitHub", value: "github" },
          { name: "Reddit", value: "reddit" },
          { name: "Social Finder", value: "find" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Username, URL, or Topic")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Find lyrics for the currently playing song")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Song name (optional)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Check server info"),
  new SlashCommandBuilder()
    .setName("icon")
    .setDescription("Get high-res icon")
    .addUserOption((opt) =>
      opt
        .setName("target")
        .setDescription("Choose a user (Leave empty for Server)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Get high-res banner")
    .addUserOption((opt) =>
      opt
        .setName("target")
        .setDescription("Choose a user (Leave empty for Server)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Check user info and profile")
    .addUserOption((opt) =>
      opt
        .setName("target")
        .setDescription("The user to check info for")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("emoji")
    .setDescription("Manage server emojis")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add an emoji from ID, Link, or existing Emoji")
        .addStringOption((opt) =>
          opt
            .setName("input")
            .setDescription("Emoji ID, Link, or Emoji")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Name for the emoji")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete an emoji from the server")
        .addStringOption((opt) =>
          opt
            .setName("query")
            .setDescription("Emoji name or ID")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("rename")
        .setDescription("Rename an emoji")
        .addStringOption((opt) =>
          opt
            .setName("current")
            .setDescription("Current emoji name or ID")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("new")
            .setDescription("New name for the emoji")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Get detailed info about an emoji")
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("The emoji to check")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all custom emojis in the server"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("needs")
        .setDescription("Check and add missing system emojis"),
    ),
  new SlashCommandBuilder()
    .setName("move")
    .setDescription("Add the bot to a different server"),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure server channels for the bot"),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Fix connection or system issues")
    .addSubcommand((sub) =>
      sub.setName("tunnel").setDescription("Fix connection issues"),
    ),
  new SlashCommandBuilder()
    .setName("convert")
    .setDescription("Media Converter (Video/Audio/Image)")
    .addStringOption((option) =>
      option
        .setName("to")
        .setDescription("Target format")
        .setRequired(true)
        .addChoices(
          { name: "Video: MP4 (HQ Compressed)", value: "mp4" },
          { name: "Video: MP4 (8MB Limit - No Nitro)", value: "mp4_small" },
          { name: "Video: GIF (High Quality)", value: "gif" },
          { name: "Video: GIF (Small/Fast)", value: "gif_small" },
          { name: "Audio: MP3 (320kbps)", value: "mp3" },
          { name: "Audio: OGG (Soundboard Ready)", value: "ogg" },
          { name: "Audio: WAV (Lossless)", value: "wav" },
          { name: "Image: PNG", value: "png" },
          { name: "Image: JPG", value: "jpg" },
          { name: "Image: WebP", value: "webp" },
          { name: "Document: Image to PDF", value: "pdf" },
          { name: "Document: Word (.docx) to PDF", value: "word_to_pdf" },
        ),
    )
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("The file you want to convert")
        .setRequired(true),
    ),
  new ContextMenuCommandBuilder()
    .setName("Convert Media")
    .setType(ApplicationCommandType.Message),
  new SlashCommandBuilder()
    .setName("ss")
    .setDescription("Capture a high-quality screenshot of any website")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("The website URL").setRequired(true),
    )
    .addBooleanOption((opt) =>
      opt
        .setName("full")
        .setDescription("Capture the entire scrollable page? (Default: False)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("inspect")
    .setDescription("Expose detailed info and EXIF data of a file")
    .addAttachmentOption((opt) =>
      opt.setName("file").setDescription("The file to inspect").setRequired(true),
    ),
  new ContextMenuCommandBuilder()
    .setName("Inspect Media")
    .setType(ApplicationCommandType.Message),
  new SlashCommandBuilder()
    .setName("diagnostics")
    .setDescription("Check bot system status"),
  new SlashCommandBuilder()
    .setName("hibernate")
    .setDescription("Put the bot into sleep mode (Admin Only)"),
  new SlashCommandBuilder()
    .setName("wakeup")
    .setDescription("Wake up the bot from sleep mode"),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Clean up or reset server data (Admin Only)")
    .addStringOption((opt) =>
      opt
        .setName("target")
        .setDescription("What do you want to clean up?")
        .setRequired(true)
        .addChoices(
          { name: "Temporary Files", value: "temp" },
          { name: "System Logs", value: "logs" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Backup the current bot settings"),
  new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Check network safety and blocked sites"),
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("View the last 15 system logs"),
  new SlashCommandBuilder()
    .setName("cookies")
    .setDescription("Update or refresh cookie settings"),
  new SlashCommandBuilder()
    .setName("delete")
    .setDescription(
      "Purge bot messages in DMs or Clean chat messages in Servers",
    )
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("Number of messages (max 100)")
        .setRequired(true),
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(config.botToken);

(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands globally.`,
    );

    const data = await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands,
    });

    console.log(
      `Successfully reloaded ${data.length} global application (/) commands.`,
    );
  } catch (error) {
    console.error(error);
  }
})();
