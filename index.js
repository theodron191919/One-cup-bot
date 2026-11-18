"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, version } = require("discord.js");
const tickets = require("./tickets");

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

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) return;
  try { await tickets.handle(interaction); }
  catch (error) {
    console.error("[TroupeBot] Ticket component error:", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Something went wrong with that ticket action.", ephemeral: true }).catch(() => {});
    }
  }
});

const commands = new Map();
const appEmojis = new Map();
const startedAt = Date.now();
const GUILD_CONFIG_PATH = path.join(__dirname, "guild-config.json");
let guildConfigs = {};

async function loadGuildConfigs() {
  try {
    const raw = await fs.readFile(GUILD_CONFIG_PATH, "utf8");
    guildConfigs = JSON.parse(raw);
    if (!guildConfigs || typeof guildConfigs !== "object" || Array.isArray(guildConfigs)) guildConfigs = {};
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("[TroupeBot] Could not load role config:", error);
    guildConfigs = {};
  }
}

async function saveGuildConfigs() {
  await fs.writeFile(GUILD_CONFIG_PATH, JSON.stringify(guildConfigs, null, 2), "utf8");
}

function getGuildConfig(guildId) {
  return guildConfigs[guildId] || {};
}
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

// The +++ role is the only role used for bot command access.
function hasPlusPlusRole(member, guild) {
  const cached = member?.roles?.cache;
  if (cached?.some(role => role.name === "+++")) return true;
  const ids = Array.isArray(member?.roles) ? member.roles : [];
  const role = guild?.roles?.cache?.find(item => item.name === "+++");
  return Boolean(role && ids.includes(role.id));
}

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

async function importApplicationEmojis(guild) {
  const applicationEmojis = await loadApplicationEmojis();
  if (!applicationEmojis?.size) return { ok: false, message: "No application emojis found on the bot application." };
  const serverEmojis = await guild.emojis.fetch().catch(() => null);
  if (!serverEmojis) return { ok: false, message: "Couldn't read server emojis. Check the bot's permissions." };
  const existing = new Set(serverEmojis.map(emoji => emoji.name));
  let added = 0, skipped = 0, failed = 0;
  for (const emoji of applicationEmojis.values()) {
    if (existing.has(emoji.name)) { skipped++; continue; }
    try {
      await guild.emojis.create({ attachment: emoji.imageURL(), name: emoji.name, reason: "TroupeBot application emoji import" });
      existing.add(emoji.name); added++;
    } catch (error) {
      failed++;
      console.warn("[TroupeBot] Could not add emoji " + emoji.name + ": " + error.message);
    }
  }
  return {
    ok: added > 0 || skipped > 0,
    message: "Added " + added + " • Skipped " + skipped + " • Failed " + failed +
      (failed ? ". Check Manage Expressions permission and available server emoji slots." : ".")
  };
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
register("emojiadd", {
  description: "Add all TroupeBot application emojis to this server.",
  category: "Administration",
  async execute(message) {
    const result = await importApplicationEmojis(message.guild);
    return message.reply(shortReply(result.ok ? "celebrate" : "noaccess", result.message));
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

// RANDOM DISCUSSION TOPIC COMMAND
const CUP_TOPICS = [
  "If animals could talk, which species would be the rudest?",
  "Would you rather explore the deepest ocean or outer space?",
  "What is a completely useless superpower you would still want?",
  "If you could instantly master one skill, what would it be?",
  "What food combination sounds awful but you secretly think might work?",
  "If you had to live inside one video game for a month, which one?",
  "What everyday object would be terrifying if it suddenly became sentient?",
  "Would you rather know every language or be able to play every instrument?",
  "What is a conspiracy theory you made up on the spot?",
  "If aliens visited Earth, what is the first thing you would show them?",
  "Which fictional universe would be the worst place to accidentally end up?",
  "What is something everyone seems to love that you just do not understand?",
  "If you could rename the moon, what would you call it?",
  "What job would be funniest if it had a dramatic movie trailer?",
  "Would you rather fight one horse-sized duck or fifty duck-sized horses?",
  "What is the most suspicious thing a person can do while holding a banana?",
  "If you could bring back one extinct animal, which would cause the most chaos?",
  "What invention would make life 10 times better if it existed?",
  "If your life had a loading screen tip, what would it say?",
  "What is the weirdest thing you believed as a little kid?",
  "Which planet would have the best vacation resort?",
  "If you had to replace your hands with two objects, what would you pick?",
  "What is the most overrated thing people spend money on?",
  "Would you rather have a rewind button or a pause button for real life?",
  "What would your warning label say?",
  "If every person had a theme song that played when they entered a room, what would yours be?",
  "What is a harmless hill you are willing to die on?",
  "If you could make one completely new holiday, what would it celebrate?",
  "What animal would be the best at running a business?",
  "What would be the funniest thing to see on the news tomorrow?",
  "If you could swap lives with a fictional character for a week, who would it be?",
  "What is a normal thing that feels illegal even though it is not?",
  "Would you rather have unlimited free snacks or unlimited free games?",
  "What is the worst name for a luxury car?",
  "If you could add one rule to the entire world, what would it be?",
  "What would happen if gravity stopped working for five seconds?",
  "Which historical person would be the funniest to play video games with?",
  "What is the strangest thing you would put in a museum?",
  "If you opened a restaurant, what would its most questionable menu item be?",
  "Would you rather be famous for something impressive or something ridiculous?",
  "What is the most useless fact you know?",
  "If clouds were made of something other than water, what should they be made of?",
  "What fictional villain would be surprisingly good at customer service?",
  "If you could give one object a voice, what would you choose?",
  "What would be the worst possible superpower for a secret agent?",
  "What is a trend you hope never comes back?",
  "If you could create a new color, what would you name it?",
  "Would you rather explore a haunted mansion or an abandoned space station?",
  "What is the funniest possible name for a pet turtle?",
  "If your pet could expose one secret about you, what would it say?",
  "What is something that should definitely have a user manual but does not?",
  "If you could make one sound effect play every time you did something, what would it be?",
  "What would be the least intimidating name for a final boss?",
  "Would you rather have a personal robot assistant or a personal spaceship?",
  "What is the most chaotic thing you could do with one million dollars?",
  "If the internet disappeared for a week, what would you do first?",
  "What fictional weapon would be the most impractical in real life?",
  "What is the funniest thing to put in a time capsule?",
  "If you had to survive in a mall overnight, which store would you choose as your base?",
  "What would you call a dinosaur that was discovered today?",
  "Which two completely unrelated things would make the funniest crossover?",
  "What is the strangest thing you would try if nobody could judge you?",
  "If you could add a new feature to school, what would it be?",
  "What is the worst possible thing to hear from your pilot?",
  "Would you rather have a tiny dragon or a giant hamster?",
  "What would be the funniest thing to accidentally become world-famous for?",
  "If you could make one fictional gadget real, which one?",
  "What is a completely normal activity that would be terrifying in the dark?",
  "If you had to design a new sport, what would players have to do?",
  "Which food would be the worst flavor for toothpaste?",
  "What would you do if you woke up and everyone had swapped voices?",
  "What is the most ridiculous thing you would put on a billboard?",
  "If you could live in any decade for one month, which would you pick?",
  "What is a terrible idea that could somehow become a successful business?",
  "Would you rather have a house in the clouds or an underwater base?",
  "What is the most dramatic way to announce that you are making a sandwich?",
  "If you could make one fictional creature your roommate, which one?",
  "What would be the worst animal to suddenly make 100 times bigger?",
  "What is something that should be a competitive sport but is not?",
  "If you were a ghost, what harmless prank would you do constantly?",
  "What is the funniest name for a spaceship?",
  "Would you rather be able to teleport but only to places you have visited, or fly but only at walking speed?",
  "What is one thing you would delete from existence just to see what happens?",
  "If you could give Earth a patch update, what would the patch notes say?",
  "What is the weirdest law you think should exist?",
  "Which fictional character would be the worst group project partner?",
  "If you had to make an entire movie using only objects in this room, what would it be about?",
  "What is the most suspicious flavor of ice cream?",
  "Would you rather have a talking car or a talking house?",
  "What would be the worst thing to discover in your attic?",
  "If you could instantly travel to one random place on Earth, where would you hope to land?",
  "What is something that sounds made up but is actually real?",
  "If you were in charge of naming every street, what naming system would you use?",
  "What would be the funniest thing for a robot to misunderstand about humans?",
  "What is a completely harmless opinion that starts arguments every time?",
  "If you could add one new button to your phone, what would it do?",
  "Which everyday object would win in a fight against all the others?",
  "What would you do if you found a door in your house that was not there yesterday?",
  "Would you rather have an unlimited supply of books or unlimited supply of LEGO?",
  "What is the most random thing you would ask a time traveler?",
  "If you had to make a mascot for the internet, what would it look like?",
  "What is the funniest possible name for a secret organization?",
  "If you could make one boring task disappear forever, which one?",
  "What would be the worst possible animal to have as a teacher?",
  "If everyone had to wear a hat that represented their personality, what hat would you wear?"
];

function makeCupTopicMessage() {
  const topic = CUP_TOPICS[Math.floor(Math.random() * CUP_TOPICS.length)];
  return (SERVER_EMOJIS.bell || "") + (SERVER_EMOJIS.bell ? " " : "") +
    "**Random discussion topic:**\n" + topic;
}

// STAFF FEEDBACK
const STAFF_FEEDBACK_CHANNEL_ID = "1571794688095289414";

async function sendStaffFeedback(guild, submitter, target, feedback) {
  if (!target) {
    return { ok: false, message: "Please select a member to give feedback about." };
  }
  const cleanFeedback = String(feedback || "").trim();
  if (!cleanFeedback) {
    return { ok: false, message: "Please include your feedback." };
  }
  if (cleanFeedback.length > 1500) {
    return { ok: false, message: "Feedback must be 1,500 characters or fewer." };
  }

  const channel = await guild.channels.fetch(STAFF_FEEDBACK_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) {
    return { ok: false, message: "The feedback channel could not be found. Please contact an administrator." };
  }

  await channel.send({
    content: "**New staff feedback**\n**Staff member:** " + target.toString() +
      "\n**Submitted by:** " + submitter.toString() +
      "\n**Feedback:**\n" + cleanFeedback,
    allowedMentions: { users: [] }
  });
  return { ok: true };
}

register("stafffeedback", {
  aliases: ["feedback", "stafffb"],
  description: "Send feedback about a staff member.",
  usage: "<@staff member> <feedback>",
  category: "Community",
  async execute(message, args) {
    const target = message.mentions.members.first();
    const feedback = args.slice(1).join(" ");
    const result = await sendStaffFeedback(message.guild, message.author, target, feedback);
    return message.reply(result.ok
      ? shortReply("celebrate", "Your feedback has been sent to staff management.")
      : shortReply("noaccess", result.message));
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

    const hasCommandAccess = hasPlusPlusRole(message.member, message.guild);
    if (!hasCommandAccess) {
      return message.reply(shortReply("noaccess", "You need the +++ role to use commands."));
    }

    // Having +++ grants access to every command.
    await command.execute(message, args);
  } catch (error) {
    console.error("[One Cup] Command error:", error);
    await message.reply(shortReply("noaccess", "Something went wrong.")).catch(() => {});
  }
});

// Slash-command handler for /cup.
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (["claim", "close", "delete", "transfer", "add", "remove", "rename", "close-request"].includes(interaction.commandName)) {
      return await tickets.handle(interaction);
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasCommandAccess = hasPlusPlusRole(member, interaction.guild);
    if (!hasCommandAccess) {
      return await interaction.reply({
        content: shortReply("noaccess", "You need the +++ role to use commands."),
        ephemeral: true
      });
    }

    if (interaction.commandName === "cup") {
      return await interaction.reply({ content: makeCupTopicMessage() });
    }

    if (interaction.commandName === "emojiadd") {
      const result = await importApplicationEmojis(interaction.guild);
      return await interaction.reply({ content: shortReply(result.ok ? "celebrate" : "noaccess", result.message), ephemeral: true });
    }

    if (interaction.commandName === "config") {
      const current = getGuildConfig(interaction.guildId);
      const roleLine = (label, id) => label + ": " + (id ? "<@&" + id + ">" : "Not set");
      const staffRole = interaction.options.getRole("staff_role");
      const adminRole = interaction.options.getRole("admin_role");
      const ownershipRole = interaction.options.getRole("ownership_role");

      if (!staffRole && !adminRole && !ownershipRole) {
        return await interaction.reply({
          content: [
            "**TroupeBot server configuration**",
            roleLine("Staff role", current.staffRoleId),
            roleLine("Admin role", current.adminRoleId),
            roleLine("Ownership role", current.ownershipRoleId),
            "",
            "Run /config and select any roles you want to set or update."
          ].join("\n"),
          ephemeral: true
        });
      }

      const updated = { ...current };
      if (staffRole) updated.staffRoleId = staffRole.id;
      if (adminRole) updated.adminRoleId = adminRole.id;
      if (ownershipRole) updated.ownershipRoleId = ownershipRole.id;
      guildConfigs[interaction.guildId] = updated;

      try {
        await saveGuildConfigs();
      } catch (error) {
        console.error("[TroupeBot] Could not save role configuration:", error);
        return await interaction.reply({
          content: "The roles were selected, but I couldn't save the configuration. Check that the host allows writing files to the app directory.",
          ephemeral: true
        });
      }

      return await interaction.reply({
        content: [
          "Configuration updated:",
          roleLine("Staff role", updated.staffRoleId),
          roleLine("Admin role", updated.adminRoleId),
          roleLine("Ownership role", updated.ownershipRoleId)
        ].join("\n"),
        ephemeral: true,
        allowedMentions: { roles: [] }
      });
    }

    if (interaction.commandName === "stafffeedback") {
      const targetUser = interaction.options.getUser("staff_member", true);
      const feedback = interaction.options.getString("feedback", true);
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const result = await sendStaffFeedback(interaction.guild, interaction.user, target, feedback);
      return await interaction.reply({
        content: result.ok
          ? shortReply("celebrate", "Your feedback has been sent to staff management.")
          : shortReply("noaccess", result.message),
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("[One Cup] Slash command error:", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
    }
  }
});

// EVENTS AND STARTUP
client.once("ready", async () => {
  await loadGuildConfigs();
  console.log("[One Cup] Logged in as " + client.user.tag);
  console.log("[One Cup] discord.js " + version + " | Prefix: " + CONFIG.prefix);
  await loadApplicationEmojis();
  await tickets.sendPanel(client).catch(error => console.warn("[TroupeBot] Ticket panel error:", error));
  await tickets.initialize(client).catch(error => console.warn("[TroupeBot] Ticket timer recovery error:", error));

  // Register One Cup's global Discord slash commands.
  try {
    const existingCommands = await client.application.commands.fetch();
    const slashCommands = [
      ...tickets.registerCommands(),
      {
        name: "config",
        description: "Set or view this server's TroupeBot roles.",
        options: [
          { type: 8, name: "staff_role", description: "The server's staff role.", required: false },
          { type: 8, name: "admin_role", description: "The server's admin role.", required: false },
          { type: 8, name: "ownership_role", description: "The server's ownership role.", required: false }
        ]
      },
      {
        name: "cup",
        description: "Get a completely random discussion topic.",
        options: []
      },
      {
        name: "emojiadd",
        description: "Add all TroupeBot application emojis to this server.",
        options: []
      },
      {
        name: "stafffeedback",
        description: "Send feedback about a staff member.",
        options: [
          {
            type: 6,
            name: "staff_member",
            description: "The staff member you want to give feedback about.",
            required: true
          },
          {
            type: 3,
            name: "feedback",
            description: "Your feedback (up to 1,500 characters).",
            required: true,
            max_length: 1500
          }
        ]
      }
    ];

    for (const data of slashCommands) {
      const existing = existingCommands.find(command => command.name === data.name);
      if (existing) await existing.edit(data);
      else await client.application.commands.create(data);
      console.log("[One Cup] Registered /" + data.name + ".");
    }
  } catch (error) {
    console.warn("[One Cup] Could not register slash commands: " + error.message);
  }

  client.user.setPresence({
    activities: [{ name: "The Phantom Troupe", type: 3 }],
    status: "online"
  });
});

client.on("guildMemberAdd", async member => {
  // Send the welcome message in the configured channel.
  try {
    const welcomeChannel = await member.guild.channels.fetch("1571452721796485173").catch(() => null);
    if (!welcomeChannel || !welcomeChannel.isTextBased() || !welcomeChannel.send) return;

    const bell = SERVER_EMOJIS.bell || "";
    const welcome = (bell ? bell + " " : "") +
      "Hello! Welcome to OneCup " + member.toString() +
      ". We are glad to have you, and we are now at **" +
      member.guild.memberCount + "** members!\n\n" +
      "To give access to commands, create a role named ```+++```. Anyone with it will have access to commands.";

    await welcomeChannel.send({
      content: welcome,
      allowedMentions: { users: [member.id] }
    });
  } catch (error) {
    console.warn("[One Cup] Could not send welcome message: " + error.message);
  }
});

client.on("guildCreate", async guild => {
  console.log("[One Cup] Joined " + guild.name);
  try {
    const channel = await guild.channels.fetch("1571452721796485173").catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.send) return;
    await channel.send({
      content: "To give access to commands, create a role named ```+++ ```. Anyone with it will have access to commands."
    });
  } catch (error) {
    console.warn("[One Cup] Could not send bot-join setup message: " + error.message);
  }
});
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
