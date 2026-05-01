const {
  REST,
  Routes,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} = require("discord.js");
const config = require("./config");
const fs = require("fs");
const path = require("path");

const commands = [];

const loadCommands = (dir) => {
  const files = fs.readdirSync(path.join(__dirname, dir));
  for (const file of files) {
    const stat = fs.lstatSync(path.join(__dirname, dir, file));
    if (stat.isDirectory()) {
      loadCommands(path.join(dir, file));
    } else if (file.endsWith(".js")) {
      const command = require(path.join(__dirname, dir, file));
      if (command.slashData) {
        commands.push(command.slashData.toJSON());
      }
    }
  }
};

loadCommands("commands");

const contextMenus = [
  new ContextMenuCommandBuilder()
    .setName("Inspect Media")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Translate Text")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Extract Text (OCR)")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Vote Delete")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Report to Admin")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Format as Code")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Mock Message")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Trace Anime")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Trace Movie")
    .setType(ApplicationCommandType.Message),
];

commands.push(...contextMenus.map((cmd) => cmd.toJSON()));

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
