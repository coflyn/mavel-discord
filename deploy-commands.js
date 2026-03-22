const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config');

const commands = [
    new SlashCommandBuilder()
        .setName('dl')
        .setDescription('Universal media downloader')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Paste any link here (TikTok, IG, YT, etc.)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Choose download type (default: mp4)')
                .addChoices(
                    { name: 'Video (MP4)', value: 'mp4' },
                    { name: 'Audio (MP3)', value: 'mp3' }
                ))
        .addStringOption(option =>
            option.setName('resolution')
                .setDescription('Choose video resolution (default: 720p)')
                .addChoices(
                    { name: '720p', value: '720' },
                    { name: '1080p', value: '1080' }
                )),
    new SlashCommandBuilder()
        .setName('search')
        .setDescription('Integrated search engine')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Search platform')
                .addChoices(
                    { name: 'YouTube', value: 'yt' },
                    { name: 'YouTube Music', value: 'ytm' },
                    { name: 'Spotify', value: 'spot' },
                    { name: 'SoundCloud', value: 'sc' }
                ))
        .addStringOption(option =>
            option.setName('query')
                .setDescription('What are you looking for?')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('View MaveL Hub operation guide'),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check connection status and latency'),
    new SlashCommandBuilder().setName("play").setDescription("Play music from YouTube/Spotify").addStringOption(opt => opt.setName("query").setDescription("Song title or link").setRequired(true)),
  new SlashCommandBuilder().setName("skip").setDescription("Skip the current song"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop music and disconnect from VC"),
  new SlashCommandBuilder().setName("clear").setDescription("Clear the music queue"),
  new SlashCommandBuilder().setName("remove").setDescription("Remove a song from the queue").addIntegerOption(opt => opt.setName("number").setDescription("Song position in queue").setRequired(true)),
  new SlashCommandBuilder().setName("skipto").setDescription("Skip to a specific song in queue").addIntegerOption(opt => opt.setName("number").setDescription("Song position in queue").setRequired(true)),
  new SlashCommandBuilder().setName("nowplaying").setDescription("Show the currently playing song"),
  new SlashCommandBuilder().setName("pause").setDescription("Pause the music"),
  new SlashCommandBuilder().setName("resume").setDescription("Resume the music"),
  new SlashCommandBuilder().setName("queue").setDescription("Show the song queue"),
  new SlashCommandBuilder().setName("shuffle").setDescription("Toggle shuffle mode").addStringOption(opt => opt.setName("mode").setDescription("Shuffle mode").setRequired(true).addChoices({ name: "On", value: "on" }, { name: "Off", value: "off" })),
  new SlashCommandBuilder().setName("repeat").setDescription("Set repeat mode").addStringOption(opt => opt.setName("mode").setDescription("Repeat mode").setRequired(true).addChoices({ name: "Off", value: "off" }, { name: "One", value: "one" }, { name: "All", value: "all" })),
  new SlashCommandBuilder().setName("playlist").setDescription("Manage your personal playlists")
    .addSubcommand(sub => sub.setName("save").setDescription("Save current queue as a playlist").addStringOption(opt => opt.setName("name").setDescription("Playlist name").setRequired(true)))
    .addSubcommand(sub => sub.setName("play").setDescription("Play one of your playlists").addStringOption(opt => opt.setName("name").setDescription("Playlist name").setRequired(true)))
    .addSubcommand(sub => sub.setName("list").setDescription("List your saved playlists"))
    .addSubcommand(sub => sub.setName("delete").setDescription("Delete a playlist").addStringOption(opt => opt.setName("name").setDescription("Playlist name").setRequired(true))),
  new SlashCommandBuilder().setName("lyrics").setDescription("Find lyrics for the currently playing song or search for one").addStringOption(opt => opt.setName("query").setDescription("Song name (optional)").setRequired(false)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.botToken);

(async () => {
    try {
        console.log(`📡 Started refreshing ${commands.length} application (/) commands for guild ${config.guildId}.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
