const {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  Events,
  Partials,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.User, Partials.GuildMember, Partials.Channel],
});

const OWNER_ID          = '1495135081319108628';
const SPAWN_CHANNEL_ID  = '1498363117808390267';
const WELCOME_CHANNEL_ID = '1502582418308337815';
const TRACK_EMOJI_ID    = '1502573591647096832';
const MAX_FREE_STALKS   = 1;

let TRACK_EMOJI = '🔴';

const trackedUsers  = new Map();
const bannedUsers   = new Set();
const stalkCounts   = new Map();

function resolveEmoji() {
  for (const guild of client.guilds.cache.values()) {
    const emoji = guild.emojis.cache.get(TRACK_EMOJI_ID);
    if (emoji) {
      TRACK_EMOJI = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
      console.log(`✅ Emoji résolu : ${TRACK_EMOJI}`);
      return;
    }
  }
  console.log(`⚠️  Emoji introuvable → fallback 🔴`);
}

function isOwner(userId)    { return userId === OWNER_ID; }
function isBanned(userId)   { return bannedUsers.has(userId); }

function canStalk(guild, userId) {
  if (isOwner(userId)) return true;
  const member = guild.members.cache.get(userId);
  if (member?.premiumSince) return true;
  return (stalkCounts.get(userId) || 0) < MAX_FREE_STALKS;
}

function getStalkCount(userId) { return stalkCounts.get(userId) || 0; }
function addStalk(userId)      { stalkCounts.set(userId, getStalkCount(userId) + 1); }
function resetStalk(userId)    { stalkCounts.delete(userId); }

async function fetchUserFull(userId) {
  const raw  = await client.rest.get(`/users/${userId}`);
  const user = await client.users.fetch(userId, { force: true });

  const avatarHash      = raw.avatar || null;
  const bannerHash      = raw.banner || null;
  const accentColor     = raw.accent_color ?? null;
  const globalName      = raw.global_name || null;
  const flags           = user.flags?.toArray() || [];
  const decorationHash  = raw.avatar_decoration_data?.asset || null;

  const avatarUrl = avatarHash
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${avatarHash.startsWith('a_') ? 'gif' : 'png'}?size=1024`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;

  const bannerUrl = bannerHash
    ? `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${bannerHash.startsWith('a_') ? 'gif' : 'png'}?size=1024`
    : null;

  const decorationUrl = decorationHash
    ? `https://cdn.discordapp.com/avatar-decoration-presets/${decorationHash}.png`
    : null;

  return { username: raw.username, globalName, avatarHash, avatarUrl, bannerHash, bannerUrl, accentColor, decorationHash, decorationUrl, flags };
}

function buildNotif(type, username, userId, oldVal, newVal) {
  const map = {
    username:    { emoji: '📝', label: 'Username changé' },
    globalName:  { emoji: '🏷️', label: 'Display name changé' },
    avatar:      { emoji: '🖼️', label: 'Photo de profil changée' },
    banner:      { emoji: '🎨', label: 'Bannière changée' },
    accentColor: { emoji: '🌈', label: 'Couleur accent changée' },
    decoration:  { emoji: '✨', label: "Décoration d'avatar changée" },
    flags:       { emoji: '🏅', label: 'Badges changés' },
    voice:       { emoji: '🔊', label: 'Activité vocale' },
    guild:       { emoji: '🏠', label: 'Activité serveur' },
  };
  const { emoji, label } = map[type] || { emoji: '🔔', label: 'Changement' };
  let content = `## ${TRACK_EMOJI} ${emoji} ${label}\n> 👤 **${username}** (\`${userId}\`)\n\n`;

  if (['avatar','banner','decoration'].includes(type)) {
    if (oldVal && newVal) content += `**Avant :** [Voir](${oldVal})\n**Après :** [Voir](${newVal})`;
    else if (newVal)      content += `**Nouvelle image :** [Voir](${newVal})`;
    else                  content += `**Image supprimée**${oldVal ? ` — [Voir ancienne](${oldVal})` : ''}`;
  } else if (type === 'accentColor') {
    const hex = (c) => c != null ? `#${c.toString(16).padStart(6,'0').toUpperCase()}` : 'aucune';
    content += `**Avant :** \`${hex(oldVal)}\`\n**Après :** \`${hex(newVal)}\``;
  } else if (type === 'flags') {
    const added   = (newVal||[]).filter(f => !(oldVal||[]).includes(f));
    const removed = (oldVal||[]).filter(f => !(newVal||[]).includes(f));
    if (added.length)   content += `**Badge(s) ajouté(s) :** ${added.join(', ')}\n`;
    if (removed.length) content += `**Badge(s) retiré(s) :** ${removed.join(', ')}`;
  } else if (type === 'voice') {
    content += newVal ? `🔊 A **rejoint** : **${newVal}**` : `🔇 A **quitté**${oldVal ? ` : **${oldVal}**` : ''}`;
  } else if (type === 'guild') {
    content += newVal ? `🏠 A **rejoint** : **${newVal}**` : `🚪 A **quitté** : **${oldVal}**`;
  } else {
    content += `**Avant :** \`${oldVal ?? 'aucun'}\`\n**Après :** \`${newVal ?? 'aucun'}\``;
  }

  return new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addTextDisplayComponents(t => t.setContent(content))
    .addSeparatorComponents(s => s)
    .addTextDisplayComponents(t => t.setContent(`-# 🕐 ${new Date().toLocaleString('fr-FR')}`));
}

async function sendToTrackers(userId, container) {
  const tracked = trackedUsers.get(userId);
  if (!tracked) return;
  for (const session of tracked.sessions) {
    const ch = await client.channels.fetch(session.privateChannelId).catch(() => null);
    if (ch) await ch.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }
}

async function checkAndUpdate(userId) {
  const tracked = trackedUsers.get(userId);
  if (!tracked || !tracked.sessions.length) return;

  let p;
  try { p = await fetchUserFull(userId); }
  catch (err) { console.error(`Polling ${userId}: ${err.message}`); return; }

  const check = async (type, oldVal, newVal) => {
    const changed = type === 'flags'
      ? JSON.stringify([...(oldVal||[])].sort()) !== JSON.stringify([...(newVal||[])].sort())
      : oldVal !== newVal;
    if (changed) await sendToTrackers(userId, buildNotif(type, p.username, userId, oldVal, newVal));
    return newVal;
  };

  tracked.username    = await check('username',    tracked.username,    p.username);
  tracked.globalName  = await check('globalName',  tracked.globalName,  p.globalName);
  tracked.accentColor = await check('accentColor', tracked.accentColor, p.accentColor);
  tracked.flags       = await check('flags',       tracked.flags,       p.flags);

  if (tracked.avatarHash !== p.avatarHash) {
    await check('avatar', tracked.avatarUrl, p.avatarUrl);
    tracked.avatarHash = p.avatarHash;
    tracked.avatarUrl  = p.avatarUrl;
  }
  if (tracked.bannerHash !== p.bannerHash) {
    await check('banner', tracked.bannerUrl, p.bannerUrl);
    tracked.bannerHash = p.bannerHash;
    tracked.bannerUrl  = p.bannerUrl;
  }
  if (tracked.decorationHash !== p.decorationHash) {
    await check('decoration', tracked.decorationUrl, p.decorationUrl);
    tracked.decorationHash = p.decorationHash;
    tracked.decorationUrl  = p.decorationUrl;
  }
}

async function pollAll() {
  for (const userId of trackedUsers.keys()) await checkAndUpdate(userId);
}

function buildMainContainer() {
  return new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addTextDisplayComponents(t =>
      t.setContent(`## ${TRACK_EMOJI} Tracker d'Utilisateur\nSélectionne un utilisateur ou entre son ID manuellement.\n-# 🆓 1 stalk gratuit • 🚀 Illimité pour les boosters`)
    )
    .addSeparatorComponents(s => s)
    .addActionRowComponents(row =>
      row.setComponents(
        new UserSelectMenuBuilder().setCustomId('select_user').setPlaceholder('🔍 Choisir un utilisateur...').setMinValues(1).setMaxValues(1)
      )
    )
    .addActionRowComponents(row =>
      row.setComponents(
        new ButtonBuilder().setCustomId('open_id_modal').setLabel('Entrer un ID manuellement').setStyle(ButtonStyle.Secondary).setEmoji('🔎')
      )
    )
    .addSeparatorComponents(s => s)
    .addTextDisplayComponents(t =>
      t.setContent(`*Surveille : username • display name • avatar • bannière • couleur accent • décoration • badges • vocal • serveurs*`)
    );
}

function buildConfirmContainer(user, profile) {
  const display = profile?.globalName ? ` *(${profile.globalName})*` : '';
  return new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addTextDisplayComponents(t => t.setContent(`## ${TRACK_EMOJI} Confirmation de Suivi`))
    .addSeparatorComponents(s => s)
    .addSectionComponents(section =>
      section
        .addTextDisplayComponents(
          t => t.setContent(`**Utilisateur sélectionné :**\n> 👤 **${user.username}**${display}\n> 🆔 \`${user.id}\``),
          t => t.setContent(`Acceptes-tu de suivre cet utilisateur ?\nUn salon privé sera créé avec toutes les alertes en temps réel.`)
        )
        .setButtonAccessory(btn =>
          btn.setCustomId(`confirm_section_${user.id}`).setLabel('Continuer ▶').setStyle(ButtonStyle.Danger)
        )
    )
    .addSeparatorComponents(s => s)
    .addActionRowComponents(row =>
      row.setComponents(
        new ButtonBuilder().setCustomId('cancel_track').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`confirm_track_${user.id}`).setLabel(`${TRACK_EMOJI} Suivre cet utilisateur`).setStyle(ButtonStyle.Danger)
      )
    );
}

function buildSuccessContainer(username, userId, channelMention, isBooster) {
  const tier = isBooster ? '🚀 Accès illimité (booster)' : `🆓 Stalk utilisé`;
  return new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addTextDisplayComponents(t =>
      t.setContent(
        `## ✅ Suivi activé !\n> ${TRACK_EMOJI} **${username}** (\`${userId}\`)\n\n📍 Salon privé : ${channelMention}\n> ${tier}\n\n**Surveillé :** 📝 Username • 🏷️ Display name • 🖼️ Avatar • 🎨 Bannière • 🌈 Couleur • ✨ Décoration • 🏅 Badges • 🔊 Vocal • 🏠 Serveurs`
      )
    );
}

function buildWelcomeContainer(targetProfile, requesterUsername, targetId) {
  const colorStr = targetProfile.accentColor != null
    ? `#${targetProfile.accentColor.toString(16).padStart(6,'0').toUpperCase()}`
    : null;
  const flagsStr = targetProfile.flags?.length ? targetProfile.flags.join(', ') : 'aucun';

  let infoText = `> 👤 **${targetProfile.username}**${targetProfile.globalName ? ` *(${targetProfile.globalName})*` : ''}\n> 🆔 \`${targetId}\``;
  if (colorStr)                  infoText += `\n> 🌈 Couleur accent : \`${colorStr}\``;
  if (targetProfile.bannerUrl)   infoText += `\n> 🎨 [Voir bannière](${targetProfile.bannerUrl})`;
  if (targetProfile.decorationUrl) infoText += `\n> ✨ [Voir décoration](${targetProfile.decorationUrl})`;
  infoText += `\n> 🏅 Badges : ${flagsStr}`;

  return new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addSectionComponents(section =>
      section
        .addTextDisplayComponents(
          t => t.setContent(`## ${TRACK_EMOJI} Nouveau suivi actif`),
          t => t.setContent(infoText),
          t => t.setContent(`-# 👁️ Stalker : **${requesterUsername}** • 🕐 ${new Date().toLocaleString('fr-FR')}`)
        )
        .setThumbnailAccessory(thumbnail =>
          thumbnail.setURL(targetProfile.avatarUrl)
        )
    );
}

async function activateTracking(interaction, user) {
  const guild     = interaction.guild;
  const requester = interaction.user;

  if (!guild) {
    await interaction.followUp({ content: '❌ Cette action doit être faite dans un serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (isBanned(requester.id)) {
    await interaction.followUp({ content: '🚫 Tu es banni d\'utilisation du bot.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!canStalk(guild, requester.id)) {
    await interaction.followUp({
      content: `❌ **Limite atteinte.** Tu as déjà utilisé ton stalk gratuit.\n🚀 **Booste le serveur** pour avoir des stalks illimités !`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const safeName = requester.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

  let privateChannel;
  try {
    privateChannel = await guild.channels.create({
      name: `🔴stalker-${safeName}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: requester.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
      topic: `Suivi par ${requester.username} — Cible : ${user.username} (${user.id})`,
    });
  } catch (err) {
    console.error('❌ Salon privé :', err.message);
    await interaction.followUp({ content: '❌ Impossible de créer le salon privé. Donne la permission **Gérer les salons** au bot.', flags: MessageFlags.Ephemeral });
    return;
  }

  let p;
  try { p = await fetchUserFull(user.id); }
  catch {
    p = {
      username: user.username, globalName: user.globalName || null,
      avatarHash: user.avatar, avatarUrl: user.displayAvatarURL({ size: 1024 }),
      bannerHash: user.banner || null, bannerUrl: user.bannerURL?.({ size: 1024 }) || null,
      accentColor: user.accentColor ?? null, decorationHash: null, decorationUrl: null,
      flags: user.flags?.toArray() || [],
    };
  }

  if (!trackedUsers.has(user.id)) {
    trackedUsers.set(user.id, {
      username: p.username, globalName: p.globalName,
      avatarHash: p.avatarHash, avatarUrl: p.avatarUrl,
      bannerHash: p.bannerHash, bannerUrl: p.bannerUrl,
      accentColor: p.accentColor, decorationHash: p.decorationHash, decorationUrl: p.decorationUrl,
      flags: p.flags, voiceChannel: null, sessions: [],
    });
  }

  if (!isOwner(requester.id) && !guild.members.cache.get(requester.id)?.premiumSince) {
    addStalk(requester.id);
  }

  trackedUsers.get(user.id).sessions.push({ requesterId: requester.id, privateChannelId: privateChannel.id });

  const booster = !!guild.members.cache.get(requester.id)?.premiumSince || isOwner(requester.id);

  await interaction.editReply({
    components: [buildSuccessContainer(p.username, user.id, `<#${privateChannel.id}>`, booster)],
    flags: MessageFlags.IsComponentsV2,
  });

  await privateChannel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addSectionComponents(section =>
          section
            .addTextDisplayComponents(
              t => t.setContent(`## ${TRACK_EMOJI} Salon de suivi actif`),
              t => t.setContent(
                `> 👁️ **Stalker :** ${requester.username}\n` +
                `> 👤 **Cible :** ${p.username}${p.globalName ? ` *(${p.globalName})*` : ''} (\`${user.id}\`)\n` +
                `> 🖼️ **Avatar :** [Voir](${p.avatarUrl})\n` +
                (p.bannerUrl ? `> 🎨 **Bannière :** [Voir](${p.bannerUrl})\n` : '') +
                (p.accentColor != null ? `> 🌈 **Couleur :** \`#${p.accentColor.toString(16).padStart(6,'0').toUpperCase()}\`\n` : '') +
                (p.decorationUrl ? `> ✨ **Décoration :** [Voir](${p.decorationUrl})\n` : '') +
                `> 🏅 **Badges :** ${p.flags.length ? p.flags.join(', ') : 'aucun'}`
              ),
              t => t.setContent(`-# 🔄 Polling API actif toutes les 5s + événements temps réel`)
            )
            .setThumbnailAccessory(thumb => thumb.setURL(p.avatarUrl))
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  try {
    const welcomeChannel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      await welcomeChannel.send({
        components: [buildWelcomeContainer(p, requester.username, user.id)],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch {}

  console.log(`👁️ ${requester.username} suit ${p.username} (${user.id})`);
}

async function registerSlashCommands() {
  const token   = process.env.DISCORD_TOKEN;
  const appId   = client.application.id;
  const rest    = new REST({ version: '10' }).setToken(token);

  const commands = [
    new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Commandes admin du bot')
      .addSubcommand(sub =>
        sub.setName('ban').setDescription('Bannir un utilisateur du bot')
           .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('unban').setDescription('Débannir un utilisateur du bot')
           .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('reset').setDescription('Réinitialiser les stalks d\'un utilisateur')
           .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('stalks').setDescription('Voir tous les stalks actifs')
      )
      .addSubcommand(sub =>
        sub.setName('banlist').setDescription('Voir la liste des bannis')
      )
      .toJSON(),
  ];

  try {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log('✅ Slash commands enregistrées');
  } catch (err) {
    console.error('❌ Slash commands :', err.message);
  }
}

client.on(Events.ClientReady, async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  console.log(`📡 Serveurs : ${client.guilds.cache.size}`);
  resolveEmoji();
  await registerSlashCommands();

  try {
    const channel = await client.channels.fetch(SPAWN_CHANNEL_ID);
    if (channel) {
      await channel.send({ components: [buildMainContainer()], flags: MessageFlags.IsComponentsV2 });
      console.log(`📨 Interface envoyée dans #${channel.name}`);
    }
  } catch (err) {
    console.error(`❌ Spawn channel :`, err.message);
  }

  setInterval(pollAll, 5_000);
  console.log('🔄 Polling démarré (5s)');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'admin') {
    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: '🚫 Accès refusé.', flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'ban') {
      const target = interaction.options.getUser('user');
      if (isOwner(target.id)) {
        await interaction.reply({ content: '❌ Impossible de bannir le propriétaire.', flags: MessageFlags.Ephemeral });
        return;
      }
      bannedUsers.add(target.id);
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xFF0000)
            .addTextDisplayComponents(t => t.setContent(`## 🚫 Utilisateur banni\n> 👤 **${target.username}** (\`${target.id}\`)\nCet utilisateur ne peut plus utiliser le bot.`))
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (sub === 'unban') {
      const target = interaction.options.getUser('user');
      bannedUsers.delete(target.id);
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x00FF88)
            .addTextDisplayComponents(t => t.setContent(`## ✅ Utilisateur débanni\n> 👤 **${target.username}** (\`${target.id}\`)\nCet utilisateur peut à nouveau utiliser le bot.`))
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (sub === 'reset') {
      const target = interaction.options.getUser('user');
      resetStalk(target.id);
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xFF0000)
            .addTextDisplayComponents(t => t.setContent(`## 🔄 Stalks réinitialisés\n> 👤 **${target.username}** (\`${target.id}\`)\nSes stalks gratuits ont été remis à zéro.`))
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (sub === 'stalks') {
      let lines = '';
      for (const [userId, data] of trackedUsers.entries()) {
        if (!data.sessions.length) continue;
        lines += `\n> 🔴 **${data.username}** (\`${userId}\`) — ${data.sessions.length} stalker(s)`;
      }
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xFF0000)
            .addTextDisplayComponents(t =>
              t.setContent(`## 📋 Stalks actifs\n${lines || '> Aucun stalk actif.'}`)
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (sub === 'banlist') {
      const list = [...bannedUsers].map(id => `> 🚫 \`${id}\``).join('\n') || '> Aucun utilisateur banni.';
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xFF0000)
            .addTextDisplayComponents(t => t.setContent(`## 🚫 Liste des bannis\n${list}`))
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }
  }

  if (interaction.isUserSelectMenu() && interaction.customId === 'select_user') {
    if (isBanned(interaction.user.id)) {
      await interaction.reply({ content: '🚫 Tu es banni d\'utilisation du bot.', flags: MessageFlags.Ephemeral });
      return;
    }
    const userId = interaction.values[0];
    let user, profile;
    try {
      user    = await client.users.fetch(userId, { force: true });
      profile = await fetchUserFull(userId).catch(() => null);
    } catch {
      await interaction.reply({ content: '❌ Impossible de récupérer cet utilisateur.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ components: [buildConfirmContainer(user, profile)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'open_id_modal') {
      if (isBanned(interaction.user.id)) {
        await interaction.reply({ content: '🚫 Tu es banni d\'utilisation du bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_enter_id')
          .setTitle('Entrer un ID utilisateur')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('user_id_input')
                .setLabel("ID Discord de l'utilisateur")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 123456789012345678')
                .setRequired(true).setMinLength(17).setMaxLength(20)
            )
          )
      );
      return;
    }

    if (interaction.customId === 'cancel_track') {
      await interaction.update({ components: [buildMainContainer()], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    if (interaction.customId.startsWith('confirm_track_') || interaction.customId.startsWith('confirm_section_')) {
      const userId = interaction.customId.replace('confirm_track_', '').replace('confirm_section_', '');
      let user;
      try { user = await client.users.fetch(userId, { force: true }); }
      catch {
        await interaction.reply({ content: '❌ Utilisateur introuvable.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferUpdate();
      await activateTracking(interaction, user);
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_enter_id') {
    if (isBanned(interaction.user.id)) {
      await interaction.reply({ content: '🚫 Tu es banni d\'utilisation du bot.', flags: MessageFlags.Ephemeral });
      return;
    }
    const inputId = interaction.fields.getTextInputValue('user_id_input').trim();
    let user, profile;
    try {
      user    = await client.users.fetch(inputId, { force: true });
      profile = await fetchUserFull(inputId).catch(() => null);
    } catch {
      await interaction.reply({ content: `❌ Aucun utilisateur trouvé avec l'ID \`${inputId}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ components: [buildConfirmContainer(user, profile)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
});

client.on(Events.UserUpdate, async (oldUser, newUser) => {
  if (!trackedUsers.has(newUser.id)) return;
  await checkAndUpdate(newUser.id);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (!trackedUsers.has(newState.id)) return;
  const tracked = trackedUsers.get(newState.id);
  const oldCh = oldState.channel?.name || null;
  const newCh = newState.channel?.name || null;
  if (oldCh === newCh) return;
  await sendToTrackers(newState.id, buildNotif('voice', tracked.username, newState.id, oldCh, newCh));
  tracked.voiceChannel = newCh;
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (!trackedUsers.has(member.id)) return;
  const tracked = trackedUsers.get(member.id);
  await sendToTrackers(member.id, buildNotif('guild', tracked.username, member.id, null, member.guild.name));
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (!trackedUsers.has(member.id)) return;
  const tracked = trackedUsers.get(member.id);
  await sendToTrackers(member.id, buildNotif('guild', tracked.username, member.id, member.guild.name, null));
});

process.on('unhandledRejection', err => console.error('Erreur :', err.message));

const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('❌ DISCORD_TOKEN manquant !'); process.exit(1); }
client.login(token);
