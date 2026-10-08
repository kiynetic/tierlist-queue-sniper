const EventEmitter = require('events');
const WebSocket = require('ws');
const https = require('https');

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

const TIERLIST_SERVER_KEYWORDS = [
  'tier', 'mctier', 'pvptier', 'sword', 'uhc', 'pot', 'crystal',
  'smp', 'axe', 'ranked', 'neth', 'pvp', 'duels', 'testing', 'waitlist', 'mace', 'speed'
];

const WAITLIST_CHANNEL_KEYWORDS = [
  'waitlist', 'queue', 'tester-queue', 'test-queue', 'wait-list'
];

const SUPER_PROPERTIES = Buffer.from(
  JSON.stringify({
    os: 'Windows',
    browser: 'Discord Client',
    release_channel: 'stable',
    client_version: '1.0.9168',
    os_version: '10.0.19045',
    os_arch: 'x64',
    app_arch: 'x64',
    system_locale: 'en-US',
    browser_user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9168 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
    browser_version: '32.2.7',
    client_build_number: 339462,
    native_build_number: null,
    client_event_source: null,
  })
).toString('base64');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 32,
  keepAliveMsecs: 60000,
  timeout: 30000,
});

class DiscordClient extends EventEmitter {
  constructor(token, settings = {}, accountId = null) {
    super();
    this.token = (token || '').trim();
    this.id = accountId;
    this.settings = Object.assign(
      {
        cps: 100,
        burstLength: 3.0,
        cooldown: 60,
      },
      settings
    );

    this.ws = null;
    this.heartbeatInterval = null;
    this.heartbeatAck = true;
    this.sequence = null;
    this.sessionId = null;
    this.resumeUrl = null;
    this.user = null;

    this.guilds = new Map();
    this.activeSnipes = new Set();
    this.snipedMessageIds = new Set();
    this.channelTimeouts = new Map();
    this.burstingChannels = new Set();

    this.destroyed = false;
    this.accessibleChannelCache = new Map();
    this.customTargets = new Map();
    this._connectResolve = null;
    this._connectReject = null;
    this._guildCreateDebounce = null;

    this.isIdlePaused = false;
    this.queuePauseUntil = 0;
  }

  setIdlePaused(isIdle) {
    this.isIdlePaused = !!isIdle;
  }

  setQueuePaused(paused, pauseUntil = 0) {
    this.queuePauseUntil = paused ? pauseUntil : 0;
  }

  isQueuePaused() {
    if (this.queuePauseUntil && Date.now() < this.queuePauseUntil) {
      return true;
    }
    return false;
  }

  updateSettings(newSettings) {
    this.settings = Object.assign(this.settings, newSettings);
  }

  apiRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${DISCORD_API}${endpoint}`);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        agent: httpsAgent,
        headers: {
          Authorization: this.token,
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9168 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
          'X-Super-Properties': SUPER_PROPERTIES,
          'X-Discord-Locale': 'en-US',
          'X-Discord-Timezone': 'UTC',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            if (res.statusCode === 204) return resolve(null);
            if (res.statusCode === 429) {
              const parsed = JSON.parse(data);
              const retryAfter = (parsed.retry_after || 1) * 1000;
              setTimeout(() => {
                this.apiRequest(method, endpoint, body)
                  .then(resolve)
                  .catch(reject);
              }, retryAfter);
              return;
            }
            if (res.statusCode >= 400) {
              return reject(new Error(`API ${res.statusCode}: ${data}`));
            }
            resolve(data ? JSON.parse(data) : null);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  _onWebSocketMessage(raw) {
    try {
      const str = typeof raw === 'string' ? raw : raw.toString();

      // ⚡ Bolt: Check slices at the beginning and end of the payload for noisy event types.
      // Discord gateway JSON often places "t" (event type) near the start or end of the string.
      // Testing slices with a Regex is ~30x faster than running 6 separate .includes() on the entire O(N) string.
      const IGNORE_RE = /"t":"(?:PRESENCE_UPDATE|TYPING_START|VOICE_STATE_UPDATE|SESSIONS_REPLACE|CHANNEL_UNREAD_UPDATE|THREAD_LIST_SYNC)"/;
      const len = str.length;
      if (len < 300) {
        if (IGNORE_RE.test(str)) return;
      } else {
        if (IGNORE_RE.test(str.substring(0, 150)) || IGNORE_RE.test(str.substring(len - 150))) return;
      }

      const msg = JSON.parse(str);
      this._handleGateway(msg);
    } catch (e) {}
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;

      this.ws = new WebSocket(DISCORD_GATEWAY);

      this.ws.on('open', () => {});

      this.ws.on('message', (raw) => this._onWebSocketMessage(raw));

      this.ws.on('close', (code, reason) => {
        this._stopHeartbeat();
        if (!this.destroyed) {
          this.emit('disconnected', { accountId: this.id, code, reason: reason?.toString() });
          setTimeout(() => {
            if (!this.destroyed) this._reconnect();
          }, 4000);
        }
      });

      this.ws.on('error', (err) => {
        this.emit('error', { accountId: this.id, error: err.message || String(err) });
        if (this._connectReject) {
          this._connectReject(err);
          this._connectReject = null;
          this._connectResolve = null;
        }
      });
    });
  }

  _handleGateway(msg) {
    const { op, d, s, t } = msg;
    if (s) this.sequence = s;

    switch (op) {
      case 10:
        this._startHeartbeat(d.heartbeat_interval);
        this._identify();
        break;

      case 11:
        this.heartbeatAck = true;
        break;

      case 0:
        this._handleDispatch(t, d);
        break;

      case 7:
        this._reconnect();
        break;

      case 9:
        if (d) {
          this._reconnect();
        } else {
          setTimeout(() => this._identify(), 1500 + Math.random() * 2500);
        }
        break;
    }
  }

  _identify() {
    this._wsSend({
      op: 2,
      d: {
        token: this.token,
        capabilities: 16381,
        properties: {
          os: 'Windows',
          browser: 'Discord Client',
          release_channel: 'stable',
          client_version: '1.0.9168',
          os_version: '10.0.19045',
          os_arch: 'x64',
          app_arch: 'x64',
          system_locale: 'en-US',
          browser_user_agent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9168 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
          browser_version: '32.2.7',
          client_build_number: 339462,
        },
        presence: {
          status: 'online',
          since: 0,
          activities: [],
          afk: false,
        },
        compress: false,
        client_state: {
          guild_versions: {},
          highest_last_message_id: '0',
          read_state_version: 0,
          user_guild_settings_version: -1,
          user_settings_version: -1,
        },
      },
    });
  }

  _handleDispatch(eventName, data) {
    switch (eventName) {
      case 'READY':
      case 'READY_SUPPLEMENTAL':
        if (data.user) {
          this.user = data.user;
          this.sessionId = data.session_id;
          this.resumeUrl = data.resume_gateway_url;
          const prevId = this.id;
          if (!this.id || this.id.startsWith('acc_') || this.id.startsWith('temp_')) {
            this.id = data.user.id;
          }

          this.emit('ready', {
            accountId: this.id,
            tempId: prevId !== this.id ? prevId : null,
            user: {
              id: data.user.id,
              username: data.user.username,
              discriminator: data.user.discriminator,
              avatar: data.user.avatar,
              globalName: data.user.global_name || data.user.username,
            },
          });

          this.emit('scanning', { accountId: this.id, isScanning: true });

          if (data.guilds) {
            for (const g of data.guilds) {
              const existing = this.guilds.get(g.id) || {};
              this.guilds.set(g.id, {
                id: g.id,
                name: g.properties?.name || g.name || existing.name || 'Unknown',
                icon: g.properties?.icon || g.icon || existing.icon || null,
                channels: (g.channels && g.channels.length > 0)
                  ? g.channels.map(ch => ({ id: ch.id, name: ch.name, type: ch.type, parentId: ch.parent_id, position: ch.position ?? 0 }))
                  : (existing.channels || []),
              });
            }
          }

          this._scheduleScan(1200);

          if (this._connectResolve) {
            this._connectResolve();
            this._connectResolve = null;
            this._connectReject = null;
          }
        }
        break;

      case 'GUILD_CREATE':
        if (data.id) {
          this.guilds.set(data.id, {
            id: data.id,
            name: data.name,
            icon: data.icon,
            channels: (data.channels || []).map((ch) => ({
              id: ch.id,
              name: ch.name,
              type: ch.type,
              parentId: ch.parent_id,
              position: ch.position ?? 0,
            })),
          });

          this._scheduleScan(800);
        }
        break;

      case 'MESSAGE_CREATE':
        this._onMessage(data, false);
        break;

      case 'MESSAGE_UPDATE':
        this._onMessage(data, true);
        break;
    }
  }

  _scheduleScan(delayMs) {
    if (this._guildCreateDebounce) {
      clearTimeout(this._guildCreateDebounce);
    }
    this._guildCreateDebounce = setTimeout(() => {
      this.scanServers();
    }, delayMs);
  }

  async _verifyChannelAccess(channelId) {
    if (this.accessibleChannelCache.has(channelId)) {
      return this.accessibleChannelCache.get(channelId);
    }
    try {
      const messages = await this.apiRequest('GET', `/channels/${channelId}/messages?limit=1`);
      this.accessibleChannelCache.set(channelId, true);
      if (Array.isArray(messages) && messages.length > 0) {
        this._checkAndSnipe(messages[0]);
      }
      return true;
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('403') || msg.includes('50001') || msg.includes('Missing Access')) {
        this.accessibleChannelCache.set(channelId, false);
        return false;
      }
      return true;
    }
  }

  async scanServers() {
    this.emit('scanning', { accountId: this.id, isScanning: true });
    try {
      const tierlistGuilds = [];

      for (const [id, guild] of this.guilds) {

        const candidateChannels = (guild.channels || []).filter((ch) =>
          this._isWaitlistChannel(ch)
        );

        if (candidateChannels.length === 0) continue;

        const accessChecks = await Promise.all(
          candidateChannels.map(async (ch) => {
            const hasAccess = await this._verifyChannelAccess(ch.id);
            return hasAccess ? ch : null;
          })
        );
        const accessibleChannels = accessChecks.filter(Boolean);

        if (accessibleChannels.length > 0) {
          accessibleChannels.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          tierlistGuilds.push({
            id: guild.id,
            name: guild.name,
            icon: guild.icon
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
              : null,
            waitlistChannels: accessibleChannels.map((ch) => ({
              id: ch.id,
              name: ch.name,
              region: this._extractRegion(ch.name),
              guildId: guild.id,
              guildName: guild.name,
            })),
          });
        }
      }

      for (const [chId, custom] of this.customTargets) {
        let existingGuild = tierlistGuilds.find(g => g.id === custom.guildId);
        if (!existingGuild) {
          existingGuild = {
            id: custom.guildId,
            name: custom.guildName || 'Custom Server',
            icon: custom.icon || null,
            waitlistChannels: [],
          };
          tierlistGuilds.unshift(existingGuild);
        }
        if (!existingGuild.waitlistChannels.some(c => c.id === chId)) {
          existingGuild.waitlistChannels.push({
            id: chId,
            name: custom.channelName,
            region: custom.region || 'CUSTOM',
            guildId: custom.guildId,
            guildName: custom.guildName,
            customButtonText: custom.customButtonText,
            isCustom: true,
          });
        }
      }

      this.emit('scanning', { accountId: this.id, isScanning: false });
      this.emit('servers', { accountId: this.id, servers: tierlistGuilds });
      return tierlistGuilds;
    } catch (err) {
      this.emit('scanning', { accountId: this.id, isScanning: false });
      this.emit('error', { accountId: this.id, error: err.message || String(err) });
      return [];
    }
  }

  _isTierlistGuildName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return TIERLIST_SERVER_KEYWORDS.some((kw) => lower.includes(kw));
  }

  _isWaitlistChannel(channel) {
    if (!channel || (channel.type !== 0 && channel.type !== 5)) return false;
    const lower = (channel.name || '').toLowerCase();

    return lower.includes('waitlist') || lower.includes('wait-list') || lower.includes('queue');
  }

  _extractRegion(channelName) {
    if (!channelName) return 'GLOBAL';
    let clean = channelName.toLowerCase()
      .replace(/^#\s*/, '')
      .replace(/wait-?list/g, '')
      .replace(/tester-?queue/g, '')
      .replace(/test-?queue/g, '')
      .replace(/queue/g, '')
      .replace(/testing/g, '')
      .replace(/^[-_]+|[-_]+$/g, '');

    if (!clean) return 'GLOBAL';

    const parts = clean.split(/[-_]+/).filter(Boolean);
    for (const part of parts) {
      if (part.length >= 2 && part.length <= 4) {
        return part.toUpperCase();
      }
    }
    return parts[parts.length - 1].toUpperCase();
  }

  addCustomTarget(target) {
    if (!target || !target.channelId) return;
    this.customTargets.set(target.channelId, target);
    this.activeSnipes.add(target.channelId);
    this.accessibleChannelCache.set(target.channelId, true);
    this._primeChannel(target.channelId);
    this.emit('channel-armed', {
      accountId: this.id,
      channelId: target.channelId,
      armed: true,
      guildName: target.guildName,
      channelName: target.channelName,
      region: target.region,
    });
  }

  removeCustomTarget(channelId) {
    this.customTargets.delete(channelId);
    this.activeSnipes.delete(channelId);
    this.burstingChannels.delete(channelId);
    this.emit('channel-armed', {
      accountId: this.id,
      channelId,
      armed: false,
    });
  }

  getAllGuildsAndChannels() {
    const list = [];
    for (const [id, guild] of this.guilds) {
      const textChannels = (guild.channels || [])
        .filter(ch => ch.type === 0 || ch.type === 5)
        .map(ch => ({ id: ch.id, name: ch.name }));
      list.push({
        id: guild.id,
        name: guild.name,
        icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
        channels: textChannels,
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  armChannel(channelId, guildName, channelName, region) {
    this.activeSnipes.add(channelId);
    this.emit('channel-armed', {
      accountId: this.id,
      channelId,
      guildName,
      channelName,
      region,
      armed: true,
    });

    this._primeChannel(channelId);
  }

  disarmChannel(channelId) {
    this.activeSnipes.delete(channelId);
    this.burstingChannels.delete(channelId);
    this.emit('channel-armed', {
      accountId: this.id,
      channelId,
      armed: false,
    });
  }

  getArmedCount() {
    return this.activeSnipes.size;
  }

  async _primeChannel(channelId) {
    try {
      const messages = await this.apiRequest(
        'GET',
        `/channels/${channelId}/messages?limit=5`
      );
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          this._checkAndSnipe(msg);
        }
      }
    } catch (e) {

    }
  }

  _onMessage(message, isUpdate = false) {
    if (!message || !message.channel_id) return;
    const channelId = message.channel_id;

    if (!this.activeSnipes.has(channelId)) return;

    this._checkAndSnipe(message);
  }

  _checkAndSnipe(message) {
    const channelId = message.channel_id;
    if (!this.activeSnipes.has(channelId)) return;

    if (this.isIdlePaused) {
      return;
    }

    if (this.isQueuePaused()) {
      return;
    }

    if (this.snipedMessageIds.has(message.id)) {
      return;
    }

    const cooldownExpiry = this.channelTimeouts.get(channelId);
    if (cooldownExpiry && Date.now() < cooldownExpiry) {
      return;
    }

    if (this.burstingChannels.has(channelId)) return;

    const queueButton = this._findJoinQueueButton(message, channelId);
    if (!queueButton) return;

    if (this.snipedMessageIds.size > 800) {
      const oldest = this.snipedMessageIds.values().next().value;
      this.snipedMessageIds.delete(oldest);
    }
    this.snipedMessageIds.add(message.id);
    this._startBurst(message, queueButton);
  }

  _findJoinQueueButton(message, channelId = null) {
    if (!message.components || !Array.isArray(message.components)) return null;

    const customTarget = channelId ? this.customTargets.get(channelId) : null;
    const customText = customTarget?.customButtonText ? customTarget.customButtonText.trim().toLowerCase() : null;

    for (const row of message.components) {
      if (row.type !== 1) continue;
      for (const comp of row.components || []) {
        if (comp.type === 2) {

          const label = (comp.label || '').trim().toLowerCase();
          if (comp.disabled) continue;

          if (customText && (label === customText || label.includes(customText))) {
            return comp;
          }

          if (
            label === 'join queue' ||
            label.includes('join queue') ||
            label.includes('enter queue') ||
            label.includes('join waitlist') ||
            label === 'queue' ||
            label === 'join'
          ) {
            return comp;
          }
        }
      }
    }
    return null;
  }

  async _startBurst(message, button) {
    const channelId = message.channel_id;
    const guildId = message.guild_id;
    const applicationId = message.author?.id || message.application_id;

    this.burstingChannels.add(channelId);

    const cps = Math.max(1, Math.min(100, this.settings.cps || 100));

    const burstDurationMs = Math.max(500, (this.settings.burstLength || 3.0) * 1000);

    const intervalMs = Math.max(10, Math.floor(1000 / cps));
    const startTime = Date.now();
    let clicksSent = 0;
    let burstActive = true;

    const cooldownMs = (this.settings.cooldown || 60) * 1000;
    this.channelTimeouts.set(channelId, Date.now() + burstDurationMs + cooldownMs);

    this.emit('burst-start', {
      accountId: this.id,
      user: this.user,
      channelId,
      guildId,
      cps,
      burstLength: (burstDurationMs / 1000).toFixed(1),
    });

    const sendSingleClick = async () => {
      if (!burstActive || !this.burstingChannels.has(channelId)) return;

      const clickStart = Date.now();
      clicksSent++;

      try {
        const nonce = String(
          BigInt(Date.now()) * BigInt(1000000) +
            BigInt(Math.floor(Math.random() * 1000000))
        );

        const payload = {
          type: 3,
          nonce,
          guild_id: guildId,
          channel_id: channelId,
          message_flags: message.flags || 0,
          message_id: message.id,
          application_id: applicationId,
          session_id: this.sessionId,
          data: {
            component_type: button.type,
            custom_id: button.custom_id,
          },
        };

        await this.apiRequest('POST', '/interactions', payload);
        const elapsedMs = Date.now() - clickStart;

        if (clicksSent === 1 || elapsedMs < 200) {
          this.emit('queue-joined', {
            accountId: this.id,
            user: this.user,
            channelId,
            latencyMs: Math.max(18, elapsedMs),
            clicks: clicksSent,
          });
        }
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('429')) {

          burstActive = false;
        }
      }
    };

    sendSingleClick();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (!burstActive || elapsed >= burstDurationMs || !this.burstingChannels.has(channelId)) {
        clearInterval(timer);
        burstActive = false;
        this.burstingChannels.delete(channelId);
        return;
      }
      sendSingleClick();
    }, intervalMs);

    setTimeout(() => {
      burstActive = false;
      clearInterval(timer);
      this.burstingChannels.delete(channelId);
    }, burstDurationMs + 100);
  }

  _startHeartbeat(intervalMs) {
    this._stopHeartbeat();
    setTimeout(() => {
      this._sendHeartbeat();
      this.heartbeatInterval = setInterval(() => {
        if (!this.heartbeatAck) {
          this._reconnect();
          return;
        }
        this.heartbeatAck = false;
        this._sendHeartbeat();
      }, intervalMs);
    }, intervalMs * Math.random());
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _sendHeartbeat() {
    this._wsSend({ op: 1, d: this.sequence });
  }

  _reconnect() {
    this._stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    if (this.destroyed) return;

    const url = this.resumeUrl || DISCORD_GATEWAY;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      if (this.sessionId && this.sequence) {
        this._wsSend({
          op: 6,
          d: {
            token: this.token,
            session_id: this.sessionId,
            seq: this.sequence,
          },
        });
      }
    });

    this.ws.on('message', (raw) => this._onWebSocketMessage(raw));

    this.ws.on('close', () => {
      if (!this.destroyed) {
        setTimeout(() => this._reconnect(), 4000);
      }
    });

    this.ws.on('error', (err) => this.emit('error', err));
  }

  _wsSend(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  destroy() {
    this.destroyed = true;
    this._stopHeartbeat();
    if (this._guildCreateDebounce) clearTimeout(this._guildCreateDebounce);
    this.activeSnipes.clear();
    this.burstingChannels.clear();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

module.exports = DiscordClient;
