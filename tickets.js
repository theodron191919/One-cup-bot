"use strict";
const { ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

const PANEL_CHANNEL = "1571661414425170030";
const CATEGORIES = {
  general: { id: "1572433750002897006", label: "General Support", roles: ["1571605247443341473", "1571605251608285274"] },
  internal: { id: "1572433811495452672", label: "Internal Affairs", roles: ["1572286534047244348", "1571605247443341473"] },
  leadership: { id: "1572704865694781451", label: "Leadership support", roles: ["1571605246411546704"] }
};
const IDS = {
  panel: "p_370301032976093193",
  faq: "p_370300563608309765",
  closeTop: "p_363110823880560642",
  claim: "p_363111217226584066",
  close: "p_363111287640559619",
  delete: "p_363111342510444548",
  reopen: "troupe_ticket_reopen",
  keepOpen: "troupe_close_request_keep_open",
  closeNow: "troupe_close_request_close"
};
const FENCE = String.fromCharCode(96).repeat(3);
const timers = new Map();

function ticketData(ch) {
  const p = String(ch?.topic || "").split("|");
  return { opener: p[1] || null, claimed: p[2] || null, closeAt: Number(p[3]) || 0, closedAt: Number(p[4]) || 0 };
}
function topicFor(d) {
  return ["TROUPE_TICKET", d.opener || "", d.claimed || "", d.closeAt || "", d.closedAt || ""].join("|");
}
function isTicket(ch) {
  return !!ch?.parentId && Object.values(CATEGORIES).some(c => c.id === ch.parentId) &&
    String(ch.topic || "").startsWith("TROUPE_TICKET|");
}
async function ticketOnly(i) {
  if (i.guild && isTicket(i.channel)) return true;
  await i.reply({ content: "This command can only be used inside a ticket.", ephemeral: true });
  return false;
}
function clearTimer(id) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}
function scheduleDelete(channel, closedAt) {
  clearTimer(channel.id);
  const delay = Math.max(0, closedAt + 4 * 60 * 60 * 1000 - Date.now());
  const timer = setTimeout(async () => {
    const current = await channel.guild.channels.fetch(channel.id).catch(() => null);
    if (!current || !isTicket(current)) return clearTimer(channel.id);
    const d = ticketData(current);
    if (!d.closedAt || d.closedAt !== closedAt) return clearTimer(channel.id);
    await current.delete("Closed ticket automatically deleted after four hours").catch(() => {});
    clearTimer(channel.id);
  }, delay);
  timers.set(channel.id, timer);
}
function scheduleClose(channel, closeAt) {
  clearTimer(channel.id);
  const delay = Math.max(0, closeAt - Date.now());
  const timer = setTimeout(async () => {
    const current = await channel.guild.channels.fetch(channel.id).catch(() => null);
    if (!current || !isTicket(current)) return clearTimer(channel.id);
    const d = ticketData(current);
    if (!d.closeAt || d.closeAt !== closeAt || d.closedAt) return clearTimer(channel.id);
    await closeTicket(current, "The scheduled close-request timer");
  }, delay);
  timers.set(channel.id, timer);
}
async function closeTicket(channel, actor) {
  if (!isTicket(channel)) return false;
  const d = ticketData(channel);
  if (d.closedAt) return false;
  d.closeAt = 0;
  d.closedAt = Date.now();
  await channel.permissionOverwrites.edit(d.opener, { SendMessages: false }).catch(() => {});
  if (!channel.name.startsWith("closed-")) await channel.setName(("closed-" + channel.name).slice(0, 100)).catch(() => {});
  await channel.setTopic(topicFor(d)).catch(() => {});
  await channel.send({
    content: "🔒 This ticket has been closed by **" + actor + "**. It will be automatically deleted in 4 hours. The ticket opener can reopen it using the button below.",
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "Reopen Ticket", custom_id: IDS.reopen, emoji: { name: "🔓" } }] }]
  }).catch(() => {});
  scheduleDelete(channel, d.closedAt);
  return true;
}
async function close(i) {
  if (!await ticketOnly(i)) return;
  const done = await closeTicket(i.channel, i.user.tag);
  await i.reply({ content: done ? "Ticket closed. It will be deleted in 4 hours unless reopened." : "This ticket is already closed.", ephemeral: true });
}
async function reopen(i) {
  if (!await ticketOnly(i)) return;
  const d = ticketData(i.channel);
  if (!d.closedAt) return i.reply({ content: "This ticket is already open.", ephemeral: true });
  clearTimer(i.channel.id);
  d.closedAt = 0;
  d.closeAt = 0;
  await i.channel.permissionOverwrites.edit(d.opener, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
  await i.channel.setTopic(topicFor(d));
  if (i.channel.name.startsWith("closed-")) await i.channel.setName(i.channel.name.slice(7));
  await i.reply({ content: "Ticket reopened. The automatic deletion has been cancelled.", ephemeral: true });
  await i.channel.send("🔓 Ticket reopened by " + i.user.toString() + ".");
}
async function claim(i) {
  if (!await ticketOnly(i)) return;
  const d = ticketData(i.channel);
  if (d.closedAt) return i.reply({ content: "Reopen this ticket before claiming it.", ephemeral: true });
  if (d.claimed) return i.reply({ content: "This ticket has already been claimed.", ephemeral: true });
  d.claimed = i.user.id;
  await i.channel.setTopic(topicFor(d));
  await i.reply({ content: "Ticket claimed.", ephemeral: true });
  await i.channel.send("Claimed by " + i.user.toString() + ".");
}
async function del(i) {
  if (!await ticketOnly(i)) return;
  clearTimer(i.channel.id);
  await i.reply({ content: "Deleting ticket...", ephemeral: true });
  await i.channel.delete("Ticket deleted by " + i.user.tag);
}
async function rename(i) {
  if (!await ticketOnly(i)) return;
  const name = i.options.getString("name", true).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
  if (!name) return i.reply({ content: "Please provide a valid channel name.", ephemeral: true });
  const prefix = ticketData(i.channel).closedAt ? "closed-" : "";
  await i.channel.setName((prefix + name).slice(0, 100));
  await i.reply({ content: "Ticket renamed to **" + i.channel.name + "**.", ephemeral: true });
}
async function closeRequest(i) {
  if (!await ticketOnly(i)) return;
  const d = ticketData(i.channel);
  if (d.closedAt) return i.reply({ content: "This ticket is already closed.", ephemeral: true });
  const hours = i.options.getInteger("delay", true);
  if (hours < 1 || hours > 720) return i.reply({ content: "Delay must be between 1 and 720 hours.", ephemeral: true });
  d.closeAt = Date.now() + hours * 60 * 60 * 1000;
  await i.channel.setTopic(topicFor(d));
  await i.reply({ content: "Close request sent. The ticket will automatically close in **" + hours + " hour(s)** if no choice is made.", ephemeral: true });
  const row = { type: 1, components: [
    { type: 2, style: 3, label: "Keep Open", custom_id: IDS.keepOpen, emoji: { name: "🟢" } },
    { type: 2, style: 4, label: "Close", custom_id: IDS.closeNow, emoji: { name: "🔒" } }
  ] };
  const content = (d.opener ? "<@" + d.opener + "> " : "") + "A close request has been submitted by " + i.user.toString() + ". Choose whether to keep this ticket open or close it. If no choice is made, it will automatically close in **" + hours + " hour(s)**.";
  await i.channel.send({ content, components: [row], allowedMentions: { users: d.opener ? [d.opener] : [] } });
  scheduleClose(i.channel, d.closeAt);
}
async function decideCloseRequest(i, keepOpen) {
  if (!await ticketOnly(i)) return;
  const d = ticketData(i.channel);
  if (d.closedAt) return i.reply({ content: "This ticket is already closed.", ephemeral: true });
  if (!d.closeAt) return i.reply({ content: "There is no pending close request.", ephemeral: true });
  if (d.opener && i.user.id !== d.opener) return i.reply({ content: "Only the ticket opener can choose whether to keep this ticket open or close it.", ephemeral: true });
  clearTimer(i.channel.id);
  if (keepOpen) {
    d.closeAt = 0;
    await i.channel.setTopic(topicFor(d));
    await i.reply({ content: "The ticket will remain open. The close request has been cancelled.", ephemeral: true });
    await i.channel.send("🟢 " + i.user.toString() + " chose to keep this ticket open.");
    return;
  }
  await i.reply({ content: "Closing ticket...", ephemeral: true });
  await closeTicket(i.channel, i.user.tag);
}
async function transfer(i) {
  if (!await ticketOnly(i)) return;
  const key = i.options.getString("panel", true);
  const dest = CATEGORIES[key];
  if (!dest) return i.reply({ content: "Invalid panel.", ephemeral: true });
  await i.channel.setParent(dest.id, { lockPermissions: false });
  for (const category of Object.values(CATEGORIES)) {
    for (const roleId of category.roles) await i.channel.permissionOverwrites.delete(roleId).catch(() => {});
  }
  for (const roleId of dest.roles) await i.channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
  await i.reply({ content: "Moved to " + dest.label + ".", ephemeral: true });
  await i.channel.send("Transferred to **" + dest.label + "** by " + i.user.toString() + ".");
}
async function memberAccess(i, add) {
  if (!await ticketOnly(i)) return;
  const user = i.options.getUser("member", true);
  if (add) await i.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
  else await i.channel.permissionOverwrites.delete(user.id).catch(() => {});
  await i.reply({ content: (add ? "Added " : "Removed ") + user.toString() + (add ? " to" : " from") + " this ticket.", ephemeral: true, allowedMentions: { users: [] } });
}
async function openModal(i, key) {
  const c = CATEGORIES[key];
  const m = new ModalBuilder().setCustomId("ticket_modal_" + key).setTitle(c.label + " Ticket")
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Ticket reason").setStyle(TextInputStyle.Short).setMaxLength(250).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("details").setLabel("Additional information").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false))
    );
  await i.showModal(m);
}
async function create(i, key) {
  const c = CATEGORIES[key];
  const reason = (i.fields.getTextInputValue("reason") || "No reason provided").replace(/\x60/g, "ˋ");
  const details = (i.fields.getTextInputValue("details") || "No additional information provided").replace(/\x60/g, "ˋ");
  const category = await i.guild.channels.fetch(c.id).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) return i.reply({ content: "Ticket category not found.", ephemeral: true });
  const overwrites = [
    { id: i.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] },
    { id: i.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] },
    ...c.roles.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
  ];
  const slug = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 70) || "member";
  const ch = await i.guild.channels.create({ name: "ticket-" + slug, type: ChannelType.GuildText, parent: c.id, topic: topicFor({ opener: i.user.id, claimed: "", closeAt: 0, closedAt: 0 }), permissionOverwrites: overwrites, reason: "Ticket opened by " + i.user.tag });
  await ch.send({ content: c.roles.map(id => "<@&" + id + ">").join(" ") + " " + i.user.toString(), allowedMentions: { roles: c.roles, users: [i.user.id] } });
  await ch.send({
    flags: 32768,
    components: [
      { type: 17, accent_color: 3447003, components: [
        { type: 9, components: [{ type: 10, content: "> <:bell:1572431998578987129> Hello! *You’ve opened a ticket. Our staff will be with you very shortly to assist you. They’ve already been pinged, so please **Do Not** ping staff, or else your ticket will be closed.*" }], accessory: { style: 2, type: 2, label: "Close Ticket", emoji: { id: "1565517444842266765", name: "exclemation", animated: false }, custom_id: IDS.closeTop } },
        { type: 14, spacing: 2 },
        { type: 10, content: FENCE + reason + FENCE },
        { type: 14, spacing: 1 },
        { type: 10, content: FENCE + details + FENCE }
      ], spoiler: false },
      { type: 1, components: [
        { style: 2, type: 2, label: "Claim", emoji: { id: "1565517340270137386", name: "lock", animated: false }, custom_id: IDS.claim },
        { style: 2, type: 2, label: "Close Ticket", emoji: { id: "1565517444842266765", name: "exclemation", animated: false }, custom_id: IDS.close },
        { style: 2, type: 2, label: "Delete Ticket", emoji: { name: "🗑️" }, custom_id: IDS.delete }
      ]}
    ]
  });
  await i.reply({ content: "Ticket created: " + ch.toString(), ephemeral: true });
}
const PANEL = {
  flags: 32768,
  components: [{
    type: 17, accent_color: 3447003,
    components: [
      { type: 12, items: [{ media: { url: "https://cdn.discordapp.com/attachments/1571602084019703860/1572441493380010095/photo-output.png?ex=6afe61c2&is=6afd1042&hm=124c8e919ca4bb4365bf2d4096152dd3d5ddf279940d3f858d4facf8eddaeb37&" } }] },
      { type: 14, spacing: 2 },
      { type: 9, components: [{ type: 10, content: "> *<:planet:1572432002844594300> Hello, and welcome to the support channel. Below are the buttons you can use to open a support ticket. Be sure to check the FAQs before opening a ticket. Pinging staff will result in a ticket closure. <:flowarrow:1572431990387642418>*" }], accessory: { style: 2, type: 2, label: "FAQs", emoji: { id: "1572432008167166024", name: "question", animated: false }, custom_id: IDS.faq, disabled: true } },
      { type: 14, spacing: 2 },
      { type: 1, components: [{ type: 3, options: [
        { label: "General Support", value: "8lrL2UV1fA", description: "For general inquiries", emoji: { id: "1572432002844594300", name: "planet", animated: false } },
        { label: "Internal Affairs", value: "1HiIfgwFH5", description: "To report USMS members", emoji: { id: "1572431993407541288", name: "shield", animated: false } },
        { label: "Leadership support", value: "YV8LIdkDjq", description: "Only for URGENT matters", emoji: { id: "1572431987724132475", name: "wrench", animated: false } }
      ], placeholder: "Select a ticket type", custom_id: IDS.panel, min_values: 1, max_values: 1 }] }
    ]
  }]
};
async function sendPanel(client) {
  const ch = await client.channels.fetch(PANEL_CHANNEL).catch(() => null);
  if (!ch?.isTextBased() || !ch.send) return console.warn("[TroupeBot] Ticket panel channel unavailable.");
  const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  const old = recent?.find(m => m.author.id === client.user.id && m.components?.some(r => r.components?.some(b => b.customId === IDS.panel)));
  if (old) await old.edit(PANEL);
  else await ch.send(PANEL);
}
async function initialize(client) {
  for (const category of Object.values(CATEGORIES)) {
    const cat = await client.channels.fetch(category.id).catch(() => null);
    if (!cat || cat.type !== ChannelType.GuildCategory) continue;
    for (const channel of cat.children.cache.values()) {
      if (!isTicket(channel)) continue;
      const d = ticketData(channel);
      if (d.closedAt) scheduleDelete(channel, d.closedAt);
      else if (d.closeAt) scheduleClose(channel, d.closeAt);
    }
  }
}
async function handle(i) {
  if (i.isStringSelectMenu() && i.customId === IDS.panel) {
    const key = { "8lrL2UV1fA": "general", "1HiIfgwFH5": "internal", "YV8LIdkDjq": "leadership" }[i.values[0]];
    if (key) return openModal(i, key);
  }
  if (i.isButton()) {
    if (i.customId === IDS.faq) return i.reply({ content: "The FAQ link is not configured yet.", ephemeral: true });
    if (i.customId === IDS.claim) return claim(i);
    if (i.customId === IDS.close || i.customId === IDS.closeTop) return close(i);
    if (i.customId === IDS.delete) return del(i);
    if (i.customId === IDS.reopen) return reopen(i);
    if (i.customId === IDS.keepOpen) return decideCloseRequest(i, true);
    if (i.customId === IDS.closeNow) return decideCloseRequest(i, false);
  }
  if (i.isModalSubmit() && i.customId.startsWith("ticket_modal_")) return create(i, i.customId.slice("ticket_modal_".length));
  if (i.isChatInputCommand()) {
    if (i.commandName === "claim") return claim(i);
    if (i.commandName === "close") return close(i);
    if (i.commandName === "delete") return del(i);
    if (i.commandName === "transfer") return transfer(i);
    if (i.commandName === "add") return memberAccess(i, true);
    if (i.commandName === "remove") return memberAccess(i, false);
    if (i.commandName === "rename") return rename(i);
    if (i.commandName === "close-request") return closeRequest(i);
  }
}
function registerCommands() {
  return [
    { name: "claim", description: "Claim this ticket." },
    { name: "close", description: "Close this ticket." },
    { name: "delete", description: "Delete this ticket." },
    { name: "rename", description: "Rename this ticket.", options: [{ type: 3, name: "name", description: "New ticket channel name.", required: true, max_length: 90 }] },
    { name: "close-request", description: "Request ticket closure after a delay.", options: [{ type: 4, name: "delay", description: "Hours before the ticket closes (1-720).", required: true, min_value: 1, max_value: 720 }] },
    { name: "transfer", description: "Move this ticket to another panel.", options: [{ type: 3, name: "panel", description: "Destination panel.", required: true, choices: [{ name: "General Support", value: "general" }, { name: "Internal Affairs", value: "internal" }, { name: "Leadership support", value: "leadership" }] }] },
    { name: "add", description: "Add a member to this ticket.", options: [{ type: 6, name: "member", description: "Member to add.", required: true }] },
    { name: "remove", description: "Remove a member from this ticket.", options: [{ type: 6, name: "member", description: "Member to remove.", required: true }] }
  ];
}
module.exports = { handle, sendPanel, initialize, registerCommands, isTicket };