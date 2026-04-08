const { REST, Routes, SlashCommandBuilder } = require("discord.js");
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
    .setDescription("Integrated search engine")
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
    .setDescription("View MaveL Hub operation guide"),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check connection status and latency"),
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
    .setName("lyrics")
    .setDescription(
      "Find lyrics for the currently playing song or search for one",
    )
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Song name (optional)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Check operational base information"),
  new SlashCommandBuilder()
    .setName("icon")
    .setDescription("Grab high-res icon asset")
    .addUserOption((opt) =>
      opt
        .setName("target")
        .setDescription("Identify target user (Leave empty for Server)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Grab high-res banner asset")
    .addUserOption((opt) =>
      opt
        .setName("target")
        .setDescription("Identify target user (Leave empty for Server)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Check user information and profile details")
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
        .setDescription("List all custom emojis in high-res format with IDs"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("needs")
        .setDescription("Check and synchronize missing system emojis"),
    ),
  new SlashCommandBuilder()
    .setName("move")
    .setDescription("Synchronize MaveL Hub to a different server endpoint"),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure system channel endpoints"),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Force reset system components")
    .addSubcommand((sub) =>
      sub.setName("tunnel").setDescription("Force regenerate Cloudflare tunnel"),
    ),
  new SlashCommandBuilder()
    .setName("diagnostics")
    .setDescription("Performance & Pulse Analysis Report"),
  new SlashCommandBuilder()
    .setName("hibernate")
    .setDescription("Operational Standby Protocol (Admin Only)"),
  new SlashCommandBuilder()
    .setName("wakeup")
    .setDescription("Restore Operational Matrix from Hibernation"),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Decommission and delete system data")
    .addStringOption((opt) =>
      opt
        .setName("target")
        .setDescription("What do you want to purge?")
        .setRequired(true)
        .addChoices(
          { name: "Temporary Assets", value: "temp" },
          { name: "System Logs", value: "logs" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Synchronize and backup the system registry"),
  new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Analyze network integrity and blocklist signatures"),
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Extract and view the last 15 operational logs"),
  new SlashCommandBuilder()
    .setName("cookies")
    .setDescription("Synchronize and update session authentication datasets"),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(config.botToken);

(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands globally.`,
    );

    const data = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands },
    );

    console.log(
      `Successfully reloaded ${data.length} global application (/) commands.`,
    );
  } catch (error) {
    console.error(error);
  }
})();
