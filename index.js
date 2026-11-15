"use strict";
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, version } = require("discord.js");

const CONFIG = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || "?",
  owners: (process.env.BOT_OWNER_IDS || "").split(",").map(x => x.trim()).filter(Boolean)
};

if (!CONFIG.token || !CONFIG.clientId) {
  console.error("[One Cup] DISCORD_TOKEN and CLIENT_ID are required.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
  allowedMentions: { parse: [], repliedUser: false }
});

const commands = new Map();
const appEmojis = new Map();
const startedAt = Date.now();

function makeEmbed(title, description) {
  return new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description).setTimestamp();
}

function register(name, options) {
  commands.set(name, Object.assign({
    name, aliases: [], description: "No description.", category: "General",
    usage: "", permissions: [], ownerOnly: false
  }, options));
}

function findCommand(name) {
  if (commands.has(name)) return commands.get(name);
  return [...commands.values()].find(command => command.aliases.includes(name)) || null;
}

function isOwner(id) {
  return CONFIG.owners.includes(id);
}

async function loadApplicationEmojis() {
  try {
    if (!client.application) await client.application.fetch();
    const fetched = await client.application.emojis.fetch();
    appEmojis.clear();
    for (const emoji of fetched.values()) appEmojis.set(emoji.name, emoji);
    console.log("[One Cup] Loaded " + appEmojis.size + " application emoji(s).");
    return fetched;
  } catch (error) {
    console.warn("[One Cup] Could not fetch application emojis: " + error.message);
    return null;
  }
}

// Future feature code can call getAppEmoji("emoji_name").
function getAppEmoji(name) {
  const emoji = appEmojis.get(name);
  return emoji ? emoji.toString() : "";
}

// GENERAL COMMANDS
register("help", {
  aliases: ["commands", "cmds"],
  description: "List commands or show information about one.",
  usage: "[command]",
  async execute(message, args) {
    if (args[0]) {
      const command = findCommand(args[0].toLowerCase());
      if (!command) return message.reply("That command does not exist.");
      return message.reply({
        embeds: [makeEmbed(command.name, [
          "Description: " + command.description,
          "Usage: " + CONFIG.prefix + command.name + " " + command.usage,
          "Aliases: " + (command.aliases.join(", ") || "None"),
          "Category: " + command.category
        ].join("\n"))]
      });
    }
    const categories = {};
    for (const command of commands.values()) {
      if (command.ownerOnly && !isOwner(message.author.id)) continue;
      (categories[command.category] ||= []).push(command.name);
    }
    const body = Object.entries(categories)
      .map(([category, names]) => "**" + category + "**\n" + names.join(" • "))
      .join("\n\n");
    return message.reply({
      embeds: [makeEmbed("One Cup | Commands", body)
        .setFooter({ text: "Prefix: " + CONFIG.prefix + " | " + commands.size + " commands" })]
    });
  }
});

register("ping", {
  aliases: ["latency"],
  description: "Check bot latency.",
  async execute(message) {
    const sent = await message.reply("Pinging...");
    return sent.edit("Pong! Message: " + (sent.createdTimestamp - message.createdTimestamp) +
      "ms | API: " + Math.round(client.ws.ping) + "ms");
  }
});

register("about", {
  aliases: ["botinfo"],
  description: "Show information about One Cup.",
  async execute(message) {
    return message.reply({
      embeds: [makeEmbed("One Cup", "A community bot built for moderation, utility, and fun.")
        .addFields(
          { name: "discord.js", value: version, inline: true },
          { name: "Servers", value: String(client.guilds.cache.size), inline: true },
          { name: "Uptime", value: Math.floor((Date.now() - startedAt) / 1000) + " seconds", inline: true }
        )]
    });
  }
});

register("serverinfo", {
  aliases: ["server", "si"],
  description: "Show information about this server.",
  category: "Information",
  async execute(message) {
    const guild = message.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    return message.reply({
      embeds: [makeEmbed(guild.name, "Server information")
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: "Owner", value: owner ? owner.user.tag : "Unknown", inline: true },
          { name: "Members", value: String(guild.memberCount), inline: true },
          { name: "Channels", value: String(guild.channels.cache.size), inline: true },
          { name: "Roles", value: String(guild.roles.cache.size), inline: true },
          { name: "Server ID", value: guild.id, inline: true }
        )]
    });
  }
});

register("userinfo", {
  aliases: ["user", "ui"],
  description: "Show information about a member.",
  usage: "[@member or ID]",
  category: "Information",
  async execute(message, args) {
    const member = message.mentions.members.first() ||
      (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null) ||
      message.member;
    const user = member.user;
    return message.reply({
      embeds: [makeEmbed(user.tag, "Member information")
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "User ID", value: user.id, inline: true },
          { name: "Created", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":R>", inline: true },
          { name: "Joined", value: member.joinedTimestamp ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":R>" : "Unknown", inline: true }
        )]
    });
  }
});

register("avatar", {
  aliases: ["pfp"],
  description: "Show a user's avatar.",
  async execute(message) {
    const user = message.mentions.users.first() || message.author;
    return message.reply(user.displayAvatarURL({ size: 1024, extension: "png" }));
  }
});

// APPLICATION EMOJIS
register("emojis", {
  aliases: ["appemojis"],
  description: "List emojis uploaded to this Discord application.",
  category: "Information",
  async execute(message) {
    const emojis = await loadApplicationEmojis();
    if (!emojis || emojis.size === 0) {
      return message.reply("No application emojis found. Check your application ID, bot token, and uploaded emojis.");
    }
    let output = "One Cup application emojis\n";
    for (const emoji of emojis.values()) {
      const markup = emoji.animated
        ? "<a:" + emoji.name + ":" + emoji.id + ">"
        : "<:" + emoji.name + ":" + emoji.id + ">";
      const line = markup + "  " + emoji.name + " — " + emoji.id + "\n";
      if ((output + line).length > 1800) {
        await message.channel.send(output);
        output = "";
      }
      output += line;
    }
    if (output) await message.channel.send(output);
  }
});

// MODERATION STARTER COMMANDS
register("clear", {
  aliases: ["purge"],
  description: "Delete 1 to 99 recent messages.",
  usage: "<1-99>",
  category: "Moderation",
  permissions: [PermissionsBitField.Flags.ManageMessages],
  async execute(message, args) {
    const amount = Number.parseInt(args[0], 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 99) {
      return message.reply("Usage: " + CONFIG.prefix + "clear <1-100>");
    }
    const deleted = await message.channel.bulkDelete(amount + 1, true);
    const notice = await message.channel.send("Deleted " + Math.max(0, deleted.size - 1) + " message(s).");
    setTimeout(() => notice.delete().catch(() => {}), 5000);
  }
});

register("kick", {
  description: "Kick a member.",
  usage: "<@member> [reason]",
  category: "Moderation",
  permissions: [PermissionsBitField.Flags.KickMembers],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply("Usage: " + CONFIG.prefix + "kick @member [reason]");
    if (!target.kickable) return message.reply("I cannot kick that member. Check my role position.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    await target.kick(reason + " | Moderator: " + message.author.tag);
    return message.reply("Kicked " + target.user.tag + ". Reason: " + reason);
  }
});

register("ban", {
  description: "Ban a member.",
  usage: "<@member> [reason]",
  category: "Moderation",
  permissions: [PermissionsBitField.Flags.BanMembers],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply("Usage: " + CONFIG.prefix + "ban @member [reason]");
    if (!target.bannable) return message.reply("I cannot ban that member. Check my role position.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    await target.ban({ reason: reason + " | Moderator: " + message.author.tag });
    return message.reply("Banned " + target.user.tag + ". Reason: " + reason);
  }
});

register("timeout", {
  aliases: ["mute"],
  description: "Timeout a member for up to 28 days.",
  usage: "<@member> <minutes> [reason]",
  category: "Moderation",
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  async execute(message, args) {
    const target = message.mentions.members.first();
    const minutes = Number.parseInt(args[1], 10);
    if (!target || !Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
      return message.reply("Usage: " + CONFIG.prefix + "timeout @member <minutes> [reason]");
    }
    if (!target.moderatable) return message.reply("I cannot timeout that member. Check my role position.");
    const reason = args.slice(2).join(" ") || "No reason provided";
    await target.timeout(minutes * 60000, reason + " | Moderator: " + message.author.tag);
    return message.reply("Timed out " + target.user.tag + " for " + minutes + " minute(s).");
  }
});

// PREFIX MESSAGE HANDLER
client.on("messageCreate", async message => {
  try {
    if (message.author.bot || !message.guild || !message.content.startsWith(CONFIG.prefix)) return;
    const input = message.content.slice(CONFIG.prefix.length).trim();
    if (!input) return;
    const parts = input.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const name = (parts.shift() || "").toLowerCase();
    const args = parts.map(part => part.replace(/^["']|["']$/g, ""));
    const command = findCommand(name);
    if (!command) return;

    if (command.ownerOnly && !isOwner(message.author.id)) {
      return message.reply("Only the bot owner can use that command.");
    }
    const missing = command.permissions.filter(permission => !message.member.permissions.has(permission));
    if (missing.length) return message.reply("You do not have permission to use that command.");
    await command.execute(message, args);
  } catch (error) {
    console.error("[One Cup] Command error:", error);
    await message.reply("Something went wrong while running that command.").catch(() => {});
  }
});

// EVENTS AND STARTUP
client.once("ready", async () => {
  console.log("[One Cup] Logged in as " + client.user.tag);
  console.log("[One Cup] discord.js " + version + " | Prefix: " + CONFIG.prefix);
  await loadApplicationEmojis();
  client.user.setPresence({
    activities: [{ name: CONFIG.prefix + "help | One Cup", type: 0 }],
    status: "online"
  });
});

client.on("guildCreate", guild => console.log("[One Cup] Joined " + guild.name));
client.on("guildDelete", guild => console.log("[One Cup] Left " + guild.name));
client.on("error", error => console.error("[One Cup] Discord error:", error));
process.on("unhandledRejection", error => console.error("[One Cup] Unhandled rejection:", error));
process.on("uncaughtException", error => {
  console.error("[One Cup] Uncaught exception:", error);
  process.exit(1);
});

function shutdown(signal) {
  console.log("[One Cup] Shutting down after " + signal);
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.login(CONFIG.token).catch(error => {
  console.error("[One Cup] Login failed. Check DISCORD_TOKEN:", error);
  process.exit(1);
});
