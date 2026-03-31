// modules/agent.js — Gemini AI Meteorology Chat Agent
import { state, addLogEntry, uiState, saveUIState } from './state.js';
import { getInstabilityContext } from './instability.js';
import { getThreatContext } from './threat.js';
import { getRoadContext } from './roads.js';

const SYSTEM_PROMPT = `You are an expert storm chasing meteorologist and field chase coordinator AI. Your job is to assist active storm chasers in real-time with meteorological analysis, safety decisions, intercept strategy, and route planning.

Your expertise includes:
- Supercell thunderstorm structure and tornado meteorology
- Reading and interpreting CAPE, CIN, wind shear, hodographs, and lifted index
- SPC convective outlooks (Marginal through High risk)
- NWS watch/warning terminology and polygon geography
- Storm intercept positioning (safe zones, escape routes, forward flank vs rear flank)
- Storm motion vectors and future track prediction
- Road network strategy for the Great Plains (T-roads, paved vs dirt)
- Radar interpretation (hook echoes, BWER, mesocyclone signatures)
- Safety protocols and abort criteria

Always prioritize safety. Be direct, concise, and field-ready — the user is likely driving or in a high-stress situation. Use meteorological terminology but explain briefly when needed. When conditions are dangerous, say so clearly. If escape routes are needed, give specific directional guidance (e.g., "Drive south on a paved road immediately").`;

export function initAgent() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const clearBtn = document.getElementById('chat-clear-btn');
  const toggleBtn = document.getElementById('chat-toggle-btn');
  const chatHeader = document.getElementById('chat-header');
  const chatSection = document.getElementById('chat-section');

  // Welcome message
  appendMessage('agent', `Hello, Prater here. I'm connected to your live weather data and ready to assist. Ask me about chase strategy, storm structure, intercept positioning, escape routes, or anything else.\n\n${getWelcomeStatus()}`);
  
  updateModelBadge();

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
  });

  clearBtn.addEventListener('click', () => {
    document.getElementById('chat-messages').innerHTML = '';
    state.chatHistory = [];
    appendMessage('agent', 'Chat cleared. How can I assist with your chase?');
  });

  // Quick prompts
  document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.prompt;
      sendMessage();
    });
  });

  if (uiState.panels.chatCollapsed) {
    chatSection.classList.add('collapsed');
  }

  // Toggle collapse
  const toggle = () => {
    chatSection.classList.toggle('collapsed');
    uiState.panels.chatCollapsed = chatSection.classList.contains('collapsed');
    saveUIState();
  };
  toggleBtn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  chatHeader.addEventListener('click', toggle);
}

function getWelcomeStatus() {
  const alerts = state.activeAlerts || [];
  const torWarn = alerts.filter(f => /tornado warning/i.test(f.properties.event)).length;
  const svrWarn = alerts.filter(f => /severe thunderstorm warning/i.test(f.properties.event)).length;
  const score = state.threatScore || 0;

  if (torWarn > 0) return `⚠️ **${torWarn} active tornado warning(s)** detected. Current threat score: ${score}/10.`;
  if (svrWarn > 0) return `📡 **${svrWarn} severe thunderstorm warning(s)** active. Threat score: ${score}/10.`;
  return `No active severe warnings at this time. Threat score: ${score}/10. Monitoring continues.`;
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  if (!state.geminiKey) {
    appendMessage('agent', '⚠️ No Gemini API key configured. Please open Settings (⚙) and enter your API key to use the AI agent.');
    return;
  }

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('chat-send-btn').disabled = true;

  appendMessage('user', text);
  addLogEntry('agent', `User asked: ${text.slice(0, 100)}`);

  const typingEl = appendTyping();

  try {
    const contextInjection = buildContext();
    const fullUserMessage = `${contextInjection}\n\nUser question: ${text}`;

    // Build message history for multi-turn conversation
    const messages = [
      ...state.chatHistory.slice(-8), // Last 4 exchanges
      { role: 'user', parts: [{ text: fullUserMessage }] }
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: messages,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            topP: 0.9,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';

    // Store in history
    state.chatHistory.push(
      { role: 'user', parts: [{ text: fullUserMessage }] },
      { role: 'model', parts: [{ text: reply }] }
    );

    typingEl.remove();
    appendMessage('agent', reply);
    addLogEntry('agent', `AI response: ${reply.slice(0, 100)}…`);
  } catch (err) {
    typingEl.remove();
    appendMessage('agent', `⚠️ Error contacting AI agent: ${err.message}. Check your API key and model selection in Settings.`);
  } finally {
    document.getElementById('chat-send-btn').disabled = false;
  }
}

function buildContext() {
  const loc = state.userLat
    ? `User GPS: ${state.userLat.toFixed(4)}°N, ${state.userLon.toFixed(4)}°W`
    : 'User GPS: unknown (not set)';

  const track = state.stormTrack
    ? `Active storm track: storm at ${state.stormTrack.lat}, ${state.stormTrack.lon}, moving ${state.stormTrack.dir}° at ${state.stormTrack.speed} kt`
    : 'No storm track plotted.';

  return `[LIVE CONTEXT — ${new Date().toLocaleTimeString()}]
${loc}
${getThreatContext()}
${getInstabilityContext()}
${getRoadContext()}
${track}
Active alerts: ${state.activeAlerts.length} total (${state.activeAlerts.filter(f => /tornado warning/i.test(f.properties.event)).length} tornado warnings)`;
}

function appendMessage(role, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg msg-${role}`;

  const avatarHtml = role === 'agent' 
    ? `<img src="/F5CHASRai/jay.png" class="chat-avatar-icon-small" alt="THE BOSS" />`
    : '👤';
  const label = role === 'agent' ? 'THE BOSS' : 'You';

  // Format bold text (**text** → <strong>)
  const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  div.innerHTML = `
    <div class="chat-msg-avatar">${avatarHtml}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-role">${label}</div>
      <div class="chat-msg-text">${formatted}</div>
    </div>`;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function appendTyping() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg msg-agent';
  div.innerHTML = `
    <div class="chat-msg-avatar"><img src="/F5CHASRai/jay.png" class="chat-avatar-icon-small" alt="THE BOSS" /></div>
    <div class="chat-msg-body">
      <div class="chat-msg-role">THE BOSS</div>
      <div class="chat-typing">
        <div class="chat-typing-dot"></div>
        <div class="chat-typing-dot"></div>
        <div class="chat-typing-dot"></div>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

export function updateModelBadge() {
  const badge = document.getElementById('chat-model-badge');
  if (badge) {
    const modelName = state.model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    badge.textContent = modelName;
  }
}
