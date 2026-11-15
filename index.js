"use strict";
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, version } = require("discord.js");

const CONFIG = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || "?",
  adminRoleId: "1571455684753494096",
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
    usage: "", permissions: [], ownerOnly: false, roleOnly: false
  }, options));
}

function findCommand(name) {
  if (commands.has(name)) return commands.get(name);
  return [...commands.values()].find(command => command.aliases.includes(name)) || null;
}

function isOwner(id) {
  return CONFIG.owners.includes(id);
}

// This server role receives full access to One Cup commands and admin-only features.
function hasBotAdminRole(member) {
  return Boolean(member?.roles?.cache?.has(CONFIG.adminRoleId));
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

// Server emoji IDs supplied for One Cup.
const SERVER_EMOJIS = {
  mgmtblue: "<:mgmtblue:1571515767181148251>",
  logo: "<:logo:1571515890141495417>",
  staff: "<:staff:1571515988862697482>",
  meme1: "<:meme1:1571516074959183872>",
  lagspoink: "<:lagspoink:1571516211420856480>",
  celebrate: "<:celebrate:1571517991831609357>",
  noaccess: "<:noaccess:1571517993303805983>",
  lock: "<:lock:1571517995048509503>",
  arrow: "<:arrow:1571517997347115109>",
  x_: "<:x_:1571517999050133504>",
  unlock: "<:unlock:1571518004255137882>",
  star: "<:star:1571518006201155604>",
  mail: "<:mail:1571518007811772456>",
  wrench: "<:wrench:1571518009061937152>",
  bolt: "<:bolt:1571518010110251078>",
  search: "<:search:1571518013696385095>",
  shield: "<:shield:1571518015567175810>",
  roblox: "<:roblox:1571518017005944833>",
  world: "<:world:1571518018197004422>",
  bell: "<:bell:1571518019581247528>",
  learn: "<:learn:1571518021292531782>",
  planet: "<:planet:1571518022550560860>",
  code: "<:code:1571518023959846993>",
  affiliate: "<:affiliate:1571518029643259904>",
  up: "<:up:1571518031480230048>"
};

function shortReply(name, fallback) {
  return (SERVER_EMOJIS[name] || "") + (SERVER_EMOJIS[name] ? " " : "") + fallback;
}

// GENERAL COMMANDS
register("help", {
  aliases: ["commands", "cmds"],
  description: "List commands or show information about one.",
  usage: "[command]",
  async execute(message, args) {
    if (args[0]) {
      const command = findCommand(args[0].toLowerCase());
      if (!command) return message.reply(shortReply("noaccess", "Unknown command."));
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
    const sent = await message.reply(shortReply("bolt", "Pinging..."));
    return sent.edit(shortReply("bolt", "Pong! Message: ") + (sent.createdTimestamp - message.createdTimestamp) +
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

// Copy every application emoji into the current server.
// This command is restricted to the One Cup Administrator role.
register("emojiadd", {
  description: "Add all One Cup application emojis to this server.",
  category: "Administration",
  roleOnly: true,
  async execute(message) {
    const applicationEmojis = await loadApplicationEmojis();
    if (!applicationEmojis || applicationEmojis.size === 0) {
      return message.reply(shortReply("noaccess", "No application emojis found."));
    }

    const existing = new Set(message.guild.emojis.cache.map(emoji => emoji.name));
    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const emoji of applicationEmojis.values()) {
      if (existing.has(emoji.name)) {
        skipped++;
        continue;
      }
      try {
        await message.guild.emojis.create({
          attachment: emoji.imageURL(),
          name: emoji.name,
          reason: "One Cup application emoji import"
        });
        existing.add(emoji.name);
        added++;
      } catch (error) {
        failed++;
        console.warn("[One Cup] Could not add emoji " + emoji.name + ": " + error.message);
      }
    }

    return message.reply(shortReply("celebrate",
      "Added " + added + " • Skipped " + skipped + " • Failed " + failed + "."));
  }
});

// List the emojis currently available in this server.
register("emojilist", {
  aliases: ["serveremojis"],
  description: "List this server's emojis.",
  category: "Information",
  async execute(message) {
    const emojis = await message.guild.emojis.fetch().catch(() => null);
    if (!emojis || emojis.size === 0) {
      return message.reply(shortReply("noaccess", "No server emojis found."));
    }

    const lines = emojis.map(emoji => {
      const markup = emoji.animated
        ? "<a:" + emoji.name + ":" + emoji.id + ">"
        : "<:" + emoji.name + ":" + emoji.id + ">";
      return markup + "  " + emoji.name + " — " + emoji.id;
    });

    let output = "Server emojis (" + emojis.size + ")\n";
    for (const line of lines) {
      if ((output + line + "\n").length > 1800) {
        await message.channel.send(output);
        output = "";
      }
      output += line + "\n";
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
      return message.reply(shortReply("noaccess", "Usage: " + CONFIG.prefix + "clear <1-99>"));
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
    if (!target) return message.reply(shortReply("noaccess", "Usage: " + CONFIG.prefix + "kick @member [reason]"));
    if (!target.kickable) return message.reply(shortReply("noaccess", "Cannot kick that member."));
    const reason = args.slice(1).join(" ") || "No reason provided";
    await target.kick(reason + " | Moderator: " + message.author.tag);
    return message.reply(shortReply("staff", "Kicked " + target.user.tag + ". Reason: " + reason));
  }
});

register("ban", {
  description: "Ban a member.",
  usage: "<@member> [reason]",
  category: "Moderation",
  permissions: [PermissionsBitField.Flags.BanMembers],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply(shortReply("noaccess", "Usage: " + CONFIG.prefix + "ban @member [reason]"));
    if (!target.bannable) return message.reply(shortReply("noaccess", "Cannot ban that member."));
    const reason = args.slice(1).join(" ") || "No reason provided";
    await target.ban({ reason: reason + " | Moderator: " + message.author.tag });
    return message.reply(shortReply("shield", "Banned " + target.user.tag + ". Reason: " + reason));
  }
});

register("timeout", {
  aliases: ["mute", "to"],
  description: "Timeout a member for up to 28 days.",
  usage: "<@member> <minutes> [reason]",
  category: "Moderation",
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  async execute(message, args) {
    const target = message.mentions.members.first();
    const minutes = Number.parseInt(args[1], 10);
    if (!target || !Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
      return message.reply(shortReply("noaccess", "Usage: " + CONFIG.prefix + "timeout @member <minutes> [reason]"));
    }
    if (!target.moderatable) return message.reply(shortReply("noaccess", "Cannot timeout that member."));
    const reason = args.slice(2).join(" ") || "No reason provided";
    await target.timeout(minutes * 60000, reason + " | Moderator: " + message.author.tag);
    return message.reply(shortReply("lock", "Timed out " + target.user.tag + " for " + minutes + " minute(s)."));
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

    const isBotAdmin = hasBotAdminRole(message.member);
    if (command.roleOnly && !isBotAdmin) {
      return message.reply(shortReply("noaccess", "No permission."));
    }
    if (command.ownerOnly && !isOwner(message.author.id) && !isBotAdmin) {
      return message.reply(shortReply("noaccess", "No permission."));
    }
    const missing = command.permissions.filter(permission => !message.member.permissions.has(permission));
    if (missing.length && !isBotAdmin) return message.reply(shortReply("noaccess", "No permission."));
    await command.execute(message, args);
  } catch (error) {
    console.error("[One Cup] Command error:", error);
    await message.reply(shortReply("noaccess", "Something went wrong.")).catch(() => {});
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

client.on("guildMemberAdd", async member => {
  // Automatically assign the new-member role.
  try {
    await member.roles.add("1571505697173282907", "One Cup automatic member role");
  } catch (error) {
    console.warn("[One Cup] Could not assign the new-member role: " + error.message);
  }

  // Send the welcome message in the configured channel.
  try {
    const welcomeChannel = await member.guild.channels.fetch("1571452721796485173").catch(() => null);
    if (!welcomeChannel || !welcomeChannel.isTextBased() || !welcomeChannel.send) return;

    const bell = SERVER_EMOJIS.bell || "";
    const welcome = (bell ? bell + " " : "") +
      "Hello! Welcome to OneCup " + member.toString() +
      ". We are glad to have you, and we are now at **" +
      member.guild.memberCount + "** members!";

    await welcomeChannel.send({
      content: welcome,
      allowedMentions: { users: [member.id] }
    });
  } catch (error) {
    console.warn("[One Cup] Could not send welcome message: " + error.message);
  }
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
