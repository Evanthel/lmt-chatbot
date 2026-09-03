import { DEFAULTS, KEYS, SAMPLING_LOCKED, SAMPLING_PRESETS, XENOPHON_PROMPT, WRAP, estimateCost, formatCost } from "./config.js";
import { callOpenRouter, callRagChat } from "./api.js";
import { renderMarkdown } from "./render.js";
import { SAMPLE_RUN } from "./sample-run.js";
import { createConversationState, resetConversationState, setOrClear } from "./state.js";

const drawer = document.getElementById("drawer");
const backdrop = document.getElementById("backdrop");
const menuToggle = document.getElementById("menu-toggle");
const drawerClose = document.getElementById("drawer-close");

const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const responseModeSelect = document.getElementById("response-mode");
const supabaseUrlInput = document.getElementById("supabase-url");
const supabaseKeyInput = document.getElementById("supabase-key");
const ragMatchCountInput = document.getElementById("rag-match-count");
const ragThresholdInput = document.getElementById("rag-threshold");
const ragMatchCountValue = document.getElementById("rag-match-count-value");
const ragThresholdValue = document.getElementById("rag-threshold-value");
const tempInput = document.getElementById("temp");
const toppInput = document.getElementById("topp");
const maxtokInput = document.getElementById("maxtok");
const tempValue = document.getElementById("temp-value");
const toppValue = document.getElementById("topp-value");
const maxtokValue = document.getElementById("maxtok-value");
const samplingPresetSelect = document.getElementById("sampling-preset");
const showLogprobsInput = document.getElementById("show-logprobs");
const resizeHandle = document.getElementById("drawer-resize");

const chatEl = document.getElementById("chat");
const placeholder = document.getElementById("placeholder");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const statMsgs = document.getElementById("stat-msgs");
const statIn = document.getElementById("stat-in");
const statOut = document.getElementById("stat-out");
const statCost = document.getElementById("stat-cost");
const statCached = document.getElementById("stat-cached");
const statCachedSep = document.getElementById("stat-cached-sep");
const sampleTopbar = document.getElementById("sample-topbar");
const downloadSimpleBtn = document.getElementById("download-simple");
const downloadDetailedBtn = document.getElementById("download-detailed");
const clearBtn = document.getElementById("clear");
const resetAllBtn = document.getElementById("reset-all");

const state = createConversationState();
const { history, ragHistory, transcriptTurns } = state;

// Hydrate controls from sessionStorage.
keyInput.value = sessionStorage.getItem(KEYS.apiKey) || "";
modelSelect.value = sessionStorage.getItem(KEYS.model) || DEFAULTS.model;
if (!modelSelect.value) modelSelect.value = DEFAULTS.model;
responseModeSelect.value = sessionStorage.getItem(KEYS.response_mode) || DEFAULTS.response_mode;
supabaseUrlInput.value = sessionStorage.getItem(KEYS.supabase_url) || DEFAULTS.supabase_url;
supabaseKeyInput.value = sessionStorage.getItem(KEYS.supabase_key) || DEFAULTS.supabase_key;
ragMatchCountInput.value = sessionStorage.getItem(KEYS.rag_match_count) ?? DEFAULTS.rag_match_count;
ragThresholdInput.value = sessionStorage.getItem(KEYS.rag_threshold) ?? DEFAULTS.rag_threshold;
tempInput.value = sessionStorage.getItem(KEYS.temperature) ?? DEFAULTS.temperature;
toppInput.value = sessionStorage.getItem(KEYS.top_p) ?? DEFAULTS.top_p;
maxtokInput.value = sessionStorage.getItem(KEYS.max_tokens) ?? DEFAULTS.max_tokens;
showLogprobsInput.checked = sessionStorage.getItem(KEYS.show_logprobs) === "1";
renderSliderValues();

// Persist on input.
keyInput.addEventListener("input", () => setOrClear(KEYS.apiKey, keyInput.value));
modelSelect.addEventListener("change", () => setOrClear(KEYS.model, modelSelect.value));
supabaseUrlInput.addEventListener("input", () => setOrClear(KEYS.supabase_url, supabaseUrlInput.value));
supabaseKeyInput.addEventListener("input", () => setOrClear(KEYS.supabase_key, supabaseKeyInput.value));
ragMatchCountInput.addEventListener("input", () => {
  sessionStorage.setItem(KEYS.rag_match_count, ragMatchCountInput.value);
  renderSliderValues();
});
ragThresholdInput.addEventListener("input", () => {
  sessionStorage.setItem(KEYS.rag_threshold, ragThresholdInput.value);
  renderSliderValues();
});
tempInput.addEventListener("input", () => {
  sessionStorage.setItem(KEYS.temperature, tempInput.value);
  renderSliderValues();
  syncSamplingPresetIndicator();
});
toppInput.addEventListener("input", () => {
  sessionStorage.setItem(KEYS.top_p, toppInput.value);
  renderSliderValues();
  syncSamplingPresetIndicator();
});
maxtokInput.addEventListener("input", () => {
  sessionStorage.setItem(KEYS.max_tokens, maxtokInput.value);
  renderSliderValues();
});
showLogprobsInput.addEventListener("change", () => {
  sessionStorage.setItem(KEYS.show_logprobs, showLogprobsInput.checked ? "1" : "0");
  applyLogprobsState();
});

samplingPresetSelect.addEventListener("change", () => {
  const key = samplingPresetSelect.value;
  if (!key) return;
  const preset = SAMPLING_PRESETS[key];
  if (!preset) return;
  tempInput.value = preset.temperature;
  toppInput.value = preset.top_p;
  sessionStorage.setItem(KEYS.temperature, String(preset.temperature));
  sessionStorage.setItem(KEYS.top_p, String(preset.top_p));
  renderSliderValues();
});

function findSamplingPresetKey(temperature, top_p) {
  for (const [k, v] of Object.entries(SAMPLING_PRESETS)) {
    if (
      Math.abs(v.temperature - temperature) < 0.01 &&
      Math.abs(v.top_p - top_p) < 0.01
    ) {
      return k;
    }
  }
  return "";
}
function syncSamplingPresetIndicator() {
  samplingPresetSelect.value = findSamplingPresetKey(
    parseFloat(tempInput.value),
    parseFloat(toppInput.value)
  );
}
syncSamplingPresetIndicator();

function applyLogprobsState() {
  document.body.dataset.logprobsOn = showLogprobsInput.checked ? "true" : "false";
}
applyLogprobsState();

function hasConversation() {
  return chatEl.querySelectorAll(".msg, .compare-card").length > 0;
}

function applyResponseModeState() {
  document.body.dataset.responseMode = responseModeSelect.value;
  const standardMode = responseModeSelect.value === "standard";
  showLogprobsInput.disabled = !standardMode;
  if (!standardMode) showLogprobsInput.checked = false;
  applyLogprobsState();
}
responseModeSelect.addEventListener("change", () => {
  const previousMode = sessionStorage.getItem(KEYS.response_mode) || DEFAULTS.response_mode;
  if (hasConversation() && responseModeSelect.value !== previousMode) {
    const proceed = confirm("Change response mode and clear the current conversation?");
    if (!proceed) {
      responseModeSelect.value = previousMode;
      applyResponseModeState();
      return;
    }
    resetConversation();
  }
  sessionStorage.setItem(KEYS.response_mode, responseModeSelect.value);
  applyResponseModeState();
});
applyResponseModeState();

// Lock sampling-slider UI when a sampling-locked model is selected.
function applySamplingLock() {
  document.body.dataset.samplingLocked =
    SAMPLING_LOCKED(modelSelect.value) ? "true" : "false";
}
modelSelect.addEventListener("change", applySamplingLock);
applySamplingLock();

// Drawer open/close.
function setMenu(open) {
  document.body.dataset.menu = open ? "open" : "closed";
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
  drawer.inert = !open;
}
menuToggle.addEventListener("click", () => setMenu(document.body.dataset.menu !== "open"));
drawerClose.addEventListener("click", () => setMenu(false));
backdrop.addEventListener("click", () => setMenu(false));

// Help tooltips: hover on desktop; tap to toggle on touch devices.
// Clicking anywhere else closes any open tooltip.
document.querySelectorAll(".help-tip").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll(".help-tip.open").forEach((other) => {
      if (other !== btn) other.classList.remove("open");
    });
    btn.classList.toggle("open");
  });
});
document.addEventListener("click", () => {
  document.querySelectorAll(".help-tip.open").forEach((b) => b.classList.remove("open"));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.dataset.menu === "open") setMenu(false);
});

// On desktop the drawer is a persistent sidebar. On narrower screens,
// surface the empty state first so visitors without a key can start the
// local sample playback instead of landing behind the settings overlay.
const isWide = window.matchMedia("(min-width: 900px)").matches;
setMenu(isWide);

// Drawer resize: drag the right edge to change sidebar width. Persisted
// in sessionStorage so it survives reloads within the same tab.
const DRAWER_MIN = 320;
const DRAWER_MAX = 720;
function setDrawerWidth(px) {
  const clamped = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, px));
  document.documentElement.style.setProperty("--drawer-width", `${clamped}px`);
  sessionStorage.setItem(KEYS.drawer_width, String(clamped));
}
const savedWidth = parseInt(sessionStorage.getItem(KEYS.drawer_width), 10);
if (Number.isFinite(savedWidth)) setDrawerWidth(savedWidth);

let dragging = false;
resizeHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dragging = true;
  resizeHandle.setPointerCapture(event.pointerId);
  document.body.classList.add("drawer-resizing");
});
resizeHandle.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  setDrawerWidth(event.clientX);
});
const endDrag = (event) => {
  if (!dragging) return;
  dragging = false;
  try { resizeHandle.releasePointerCapture(event.pointerId); } catch {}
  document.body.classList.remove("drawer-resizing");
};
resizeHandle.addEventListener("pointerup", endDrag);
resizeHandle.addEventListener("pointercancel", endDrag);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (!keyInput.value) {
    addMessage("error", "Paste an OpenRouter API key in Settings first.");
    setMenu(true);
    return;
  }
  if (responseModeSelect.value !== "standard" && (!supabaseUrlInput.value || !supabaseKeyInput.value)) {
    addMessage("error", "Add the Supabase project URL and publishable key in Settings first.");
    setMenu(true);
    return;
  }

  const placeholderEl = document.getElementById("placeholder");
  if (placeholderEl) placeholderEl.remove();
  const userBubble = addMessage("user", text);
  input.value = "";
  if (responseModeSelect.value === "standard") {
    const isFirstTurn = state.prevPromptTokens === 0;
    history.push(buildUserMessage(text, isFirstTurn));
    await sendCompletion({ userBubble, isFirstTurn, newUserMessage: true, userText: text });
    return;
  }
  if (responseModeSelect.value === "rag") {
    const isFirstTurn = state.prevRagPromptTokens === 0;
    ragHistory.push(buildUserMessage(text, isFirstTurn));
    await sendRagCompletion({ newUserMessage: true, userText: text });
    return;
  }
  if (responseModeSelect.value === "agent") {
    const isFirstTurn = state.prevRagPromptTokens === 0;
    ragHistory.push(buildUserMessage(text, isFirstTurn));
    await sendAgentCompletion({ newUserMessage: true, userText: text });
    return;
  }

  const standardFirstTurn = state.prevPromptTokens === 0;
  const ragFirstTurn = state.prevRagPromptTokens === 0;
  history.push(buildUserMessage(text, standardFirstTurn));
  ragHistory.push(buildUserMessage(text, ragFirstTurn));
  await sendCompareCompletion({ userText: text });
});

// Shared flow for both fresh submissions and regenerations. When
// `newUserMessage` is true we're responding to the user's latest text,
// so the delta-based user-token meta is rendered and we revert the
// pushed user entry on error. On regeneration the user bubble already
// has its meta from the previous successful call; we just want a fresh
// assistant reply for the same history.
async function sendCompletion({ userBubble, isFirstTurn, newUserMessage, userText }) {
  sendBtn.disabled = true;
  refreshToolbar();
  const loading = addMessage("assistant", "…");

  try {
    const model = modelSelect.value;
    const requestedAt = Date.now();
    const wantLogprobs = showLogprobsInput.checked;
    // Stream tokens into the bubble as they arrive. Keep auto-scroll
    // on while the user is still pinned to the bottom of the chat;
    // if they scrolled up to read earlier messages, don't yank them
    // back.
    let firstToken = true;
    const onDelta = (text) => {
      const wasAtBottom =
        chatEl.scrollTop + chatEl.clientHeight >= chatEl.scrollHeight - 24;
      if (firstToken) {
        loading.bubble.textContent = "";
        firstToken = false;
      }
      loading.bubble.appendChild(document.createTextNode(text));
      if (wasAtBottom) chatEl.scrollTop = chatEl.scrollHeight;
    };
    const { reply, usage, finish_reason, model_snapshot, id, logprobs } =
      await callOpenRouter({
        apiKey: keyInput.value,
        model,
        messages: history,
        temperature: parseFloat(tempInput.value),
        top_p: parseFloat(toppInput.value),
        max_tokens: parseInt(maxtokInput.value, 10),
        wantLogprobs,
        onDelta,
      });
    const latencyMs = Date.now() - requestedAt;
    // Final pass: once we have the full reply, swap the streamed
    // plain-text in for either the token-chip view or a sanitised
    // markdown render.
    if (logprobs && wantLogprobs) {
      loading.bubble.textContent = "";
      loading.bubble.appendChild(renderTokenChips(logprobs));
    } else {
      loading.bubble.innerHTML = renderMarkdown(reply);
    }
    const entry = {
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
      model_snapshot,
      finish_reason,
      usage,
      latency_ms: latencyMs,
      response_id: id,
      logprobs,
    };
    entry[WRAP] = loading.wrap;
    history.push(entry);
    transcriptTurns.push({
      mode: "standard",
      user: userText ?? history[history.length - 2]?.content ?? "",
      assistant: {
        reply,
        usage,
        finish_reason,
        model_snapshot,
        response_id: id,
      },
    });
    if (usage) {
      const inTok = usage.prompt_tokens || 0;
      const outTok = (usage.total_tokens || 0) - inTok;
      const reasoningTok =
        usage.completion_tokens_details?.reasoning_tokens || 0;
      const cachedTok =
        usage.prompt_tokens_details?.cached_tokens || 0;
      state.tokensIn += inTok;
      state.tokensOut += Math.max(0, outTok);
      state.tokensCached += cachedTok;
      const cost = estimateCost(usage, model);
      state.costTotal += cost;

      if (newUserMessage && userBubble) {
        // Back-compute this user turn's tokens from the prompt_tokens
        // delta. First turn includes the embedded Xenophon prompt.
        // Later turns:
        // delta minus the prior assistant reply isolates this single
        // user message.
        const userTurnTokens = isFirstTurn
          ? inTok
          : Math.max(0, inTok - state.prevPromptTokens - state.prevCompletionTokens);
        appendUserMeta(userBubble.wrap, userTurnTokens, isFirstTurn);
      }

      appendMeta(loading.wrap, inTok, outTok, reasoningTok, cachedTok, cost);
      appendActionChips(loading.wrap, reply);

      state.prevPromptTokens = inTok;
      state.prevCompletionTokens = Math.max(0, outTok);
    }
    // Once the full reply has rendered (markdown or token chips, plus
    // meta and Copy/Regenerate chips) force a scroll to the bottom so
    // the Regenerate button is always visible without the user hunting
    // for it. Override the mid-stream "only if user was at bottom"
    // behaviour for this final pass.
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (err) {
    loading.wrap.remove();
    addMessage("error", err.message || String(err));
    if (newUserMessage) history.pop();
  } finally {
    sendBtn.disabled = false;
    refreshToolbar();
    input.focus();
  }
}

async function sendRagCompletion({ newUserMessage, userText }) {
  sendBtn.disabled = true;
  refreshToolbar();
  const loading = addMessage("assistant", "Consulting Supabase context…");

  try {
    const requestedAt = Date.now();
    const result = await callRagChat({
      supabaseUrl: supabaseUrlInput.value,
      supabaseAnonKey: supabaseKeyInput.value,
      openrouterApiKey: keyInput.value,
      model: modelSelect.value,
      messages: ragHistory,
      temperature: parseFloat(tempInput.value),
      top_p: parseFloat(toppInput.value),
      max_tokens: parseInt(maxtokInput.value, 10),
      match_count: parseInt(ragMatchCountInput.value, 10),
      match_threshold: parseFloat(ragThresholdInput.value),
    });
    const latencyMs = Date.now() - requestedAt;
    loading.bubble.innerHTML = renderMarkdown(result.reply);
    const entry = {
      role: "assistant",
      content: result.reply,
      timestamp: new Date().toISOString(),
      model_snapshot: result.model_snapshot,
      finish_reason: result.finish_reason,
      usage: result.usage,
      latency_ms: latencyMs,
      response_id: result.id,
      sources: result.sources,
    };
    entry[WRAP] = loading.wrap;
    ragHistory.push(entry);
    transcriptTurns.push({
      mode: "rag",
      user: userText ?? ragHistory[ragHistory.length - 2]?.content ?? "",
      assistant: {
        reply: result.reply,
        usage: result.usage,
        finish_reason: result.finish_reason,
        model_snapshot: result.model_snapshot,
        response_id: result.id,
        sources: result.sources,
      },
    });
    if (result.usage) {
      const inTok = result.usage.prompt_tokens || 0;
      const outTok = (result.usage.total_tokens || 0) - inTok;
      const reasoningTok = result.usage.completion_tokens_details?.reasoning_tokens || 0;
      const cachedTok = result.usage.prompt_tokens_details?.cached_tokens || 0;
      state.tokensIn += inTok;
      state.tokensOut += Math.max(0, outTok);
      state.tokensCached += cachedTok;
      const cost = estimateCost(result.usage, modelSelect.value);
      state.costTotal += cost;
      appendMeta(loading.wrap, inTok, outTok, reasoningTok, cachedTok, cost);
      appendActionChips(loading.wrap, result.reply, { allowRegenerate: false });
      appendRetrievedContext(loading.wrap, result.sources);
      state.prevRagPromptTokens = inTok;
      state.prevRagCompletionTokens = Math.max(0, outTok);
    }
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (err) {
    loading.wrap.remove();
    addMessage("error", err.message || String(err));
    if (newUserMessage) ragHistory.pop();
  } finally {
    sendBtn.disabled = false;
    refreshToolbar();
    input.focus();
  }
}

async function sendAgentCompletion({ newUserMessage, userText }) {
  sendBtn.disabled = true;
  refreshToolbar();
  const loading = addMessage("assistant", "Running agent pipeline…");

  try {
    const requestedAt = Date.now();
    const result = await callRagChat({
      supabaseUrl: supabaseUrlInput.value,
      supabaseAnonKey: supabaseKeyInput.value,
      openrouterApiKey: keyInput.value,
      model: modelSelect.value,
      messages: ragHistory,
      temperature: parseFloat(tempInput.value),
      top_p: parseFloat(toppInput.value),
      max_tokens: parseInt(maxtokInput.value, 10),
      match_count: parseInt(ragMatchCountInput.value, 10),
      match_threshold: parseFloat(ragThresholdInput.value),
      pipeline_mode: "agent",
    });
    const latencyMs = Date.now() - requestedAt;
    loading.bubble.innerHTML = renderMarkdown(result.reply);
    const entry = {
      role: "assistant",
      content: result.reply,
      timestamp: new Date().toISOString(),
      model_snapshot: result.model_snapshot,
      finish_reason: result.finish_reason,
      usage: result.usage,
      latency_ms: latencyMs,
      response_id: result.id,
      sources: result.sources,
      trace: result.trace,
    };
    entry[WRAP] = loading.wrap;
    ragHistory.push(entry);
    transcriptTurns.push({
      mode: "agent",
      user: userText ?? ragHistory[ragHistory.length - 2]?.content ?? "",
      assistant: {
        reply: result.reply,
        usage: result.usage,
        finish_reason: result.finish_reason,
        model_snapshot: result.model_snapshot,
        response_id: result.id,
        sources: result.sources,
        trace: result.trace,
      },
    });
    appendActionChips(loading.wrap, result.reply, { allowRegenerate: false });
    appendPipelineTrace(loading.wrap, result.trace);
    appendRetrievedContext(loading.wrap, result.sources);
    if (result.usage) {
      const inTok = result.usage.prompt_tokens || 0;
      const outTok = (result.usage.total_tokens || 0) - inTok;
      const reasoningTok = result.usage.completion_tokens_details?.reasoning_tokens || 0;
      const cachedTok = result.usage.prompt_tokens_details?.cached_tokens || 0;
      state.tokensIn += inTok;
      state.tokensOut += Math.max(0, outTok);
      state.tokensCached += cachedTok;
      const cost = estimateCost(result.usage, modelSelect.value);
      state.costTotal += cost;
      appendMeta(loading.wrap, inTok, outTok, reasoningTok, cachedTok, cost);
      state.prevRagPromptTokens = inTok;
      state.prevRagCompletionTokens = Math.max(0, outTok);
    }
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (err) {
    loading.wrap.remove();
    addMessage("error", err.message || String(err));
    if (newUserMessage) ragHistory.pop();
  } finally {
    sendBtn.disabled = false;
    refreshToolbar();
    input.focus();
  }
}

async function sendCompareCompletion({ userText }) {
  sendBtn.disabled = true;
  refreshToolbar();
  const loading = addMessage("assistant", "Comparing direct answer with RAG…");

  try {
    const latencyStartedAt = Date.now();
    const [standardResult, ragResult] = await Promise.all([
      callOpenRouter({
        apiKey: keyInput.value,
        model: modelSelect.value,
        messages: history,
        temperature: parseFloat(tempInput.value),
        top_p: parseFloat(toppInput.value),
        max_tokens: parseInt(maxtokInput.value, 10),
        wantLogprobs: false,
        stream: false,
      }),
      callRagChat({
        supabaseUrl: supabaseUrlInput.value,
        supabaseAnonKey: supabaseKeyInput.value,
        openrouterApiKey: keyInput.value,
        model: modelSelect.value,
        messages: ragHistory,
        temperature: parseFloat(tempInput.value),
        top_p: parseFloat(toppInput.value),
        max_tokens: parseInt(maxtokInput.value, 10),
        match_count: parseInt(ragMatchCountInput.value, 10),
        match_threshold: parseFloat(ragThresholdInput.value),
      }),
    ]);
    const latencyMs = Date.now() - latencyStartedAt;
    loading.wrap.remove();
    renderCompareResult({ standardResult, ragResult });

    const standardEntry = {
      role: "assistant",
      content: standardResult.reply,
      timestamp: new Date().toISOString(),
      model_snapshot: standardResult.model_snapshot,
      finish_reason: standardResult.finish_reason,
      usage: standardResult.usage,
      latency_ms: latencyMs,
      response_id: standardResult.id,
    };
    const ragEntry = {
      role: "assistant",
      content: ragResult.reply,
      timestamp: new Date().toISOString(),
      model_snapshot: ragResult.model_snapshot,
      finish_reason: ragResult.finish_reason,
      usage: ragResult.usage,
      latency_ms: latencyMs,
      response_id: ragResult.id,
      sources: ragResult.sources,
    };
    history.push(standardEntry);
    ragHistory.push(ragEntry);
    transcriptTurns.push({
      mode: "compare",
      user: userText,
      standard: standardEntry,
      rag: ragEntry,
    });

    trackUsage(standardResult.usage, modelSelect.value, "standard");
    trackUsage(ragResult.usage, modelSelect.value, "rag");
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (err) {
    loading.wrap.remove();
    addMessage("error", err.message || String(err));
    history.pop();
    ragHistory.pop();
  } finally {
    sendBtn.disabled = false;
    refreshToolbar();
    input.focus();
  }
}

async function regenerate() {
  if (responseModeSelect.value !== "standard") return;
  if (!history.length) return;
  const last = history[history.length - 1];
  if (last.role !== "assistant") return;
  // Remove the old reply from both history and DOM, then ask for a new
  // one with the same prior context. Running totals keep accumulating —
  // the old tokens were paid for, the new tokens add on top.
  history.pop();
  if (transcriptTurns.length && transcriptTurns[transcriptTurns.length - 1].mode === "standard") {
    transcriptTurns.pop();
  }
  last[WRAP]?.remove();
  await sendCompletion({
    userBubble: null,
    isFirstTurn: false,
    newUserMessage: false,
  });
}

// Two flavours of JSON export.
//   simple:   a human-readable transcript — model and each turn as just
//             { role, content }. The first user turn includes the
//             embedded Xenophon prompt sent to OpenRouter.
//   detailed: everything the app has captured — per-turn usage (incl.
//             cached_tokens, reasoning_tokens), finish_reason, served
//             model snapshot, latency, response id, full logprobs.
function downloadJson(detailed) {
  const basePayload = {
    exported_at: new Date().toISOString(),
    model: modelSelect.value,
    response_mode: responseModeSelect.value,
  };
  let payload;
  if (detailed) {
    payload = {
      ...basePayload,
      sampling: {
        temperature: parseFloat(tempInput.value),
        top_p: parseFloat(toppInput.value),
        max_tokens: parseInt(maxtokInput.value, 10),
      },
      rag: {
        supabase_url: supabaseUrlInput.value,
        match_count: parseInt(ragMatchCountInput.value, 10),
        match_threshold: parseFloat(ragThresholdInput.value),
      },
      tokens: { prompt: state.tokensIn, completion: state.tokensOut },
      estimated_cost_usd: Number(state.costTotal.toFixed(6)),
      standard_messages: history,
      rag_messages: ragHistory,
      turns: transcriptTurns,
    };
  } else {
    payload = {
      ...basePayload,
      turns: transcriptTurns.map((turn) => {
        if (turn.mode === "compare") {
          return {
            mode: turn.mode,
            user: turn.user,
            standard_reply: turn.standard.content,
            rag_reply: turn.rag.content,
          };
        }
        return {
          mode: turn.mode,
          user: turn.user,
          assistant_reply: turn.assistant.reply,
        };
      }),
    };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const flavour = detailed ? "detailed" : "simple";
  a.download = `xenophon-${flavour}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
downloadSimpleBtn.addEventListener("click", () => downloadJson(false));
downloadDetailedBtn.addEventListener("click", () => downloadJson(true));

clearBtn.addEventListener("click", () => {
  if (!hasConversation()) return;
  if (!confirm("Clear the conversation? Key and settings stay.")) return;
  resetConversation();
});

const samplePlayback = {
  active: false,
  paused: false,
  currentStep: -1,
  timer: null,
  header: null,
  comparison: null,
};

chatEl.addEventListener("click", (event) => {
  if (event.target.closest("#view-sample-run")) {
    startSampleRun();
    return;
  }
  const action = event.target.closest("[data-sample-action]")?.dataset.sampleAction;
  if (action === "pause") toggleSamplePause();
  if (action === "skip") completeSampleRun();
  if (action === "restart") startSampleRun();
  if (action === "exit") resetConversation();
  if (action === "configure") {
    resetConversation();
    setMenu(true);
  }
});

function startSampleRun() {
  stopSamplePlayback();
  resetConversationState(state);
  samplePlayback.active = true;
  samplePlayback.currentStep = -1;
  document.body.dataset.sampleRun = "playing";
  sampleTopbar.hidden = false;
  input.disabled = true;
  input.placeholder = "Sample playback is read-only";
  sendBtn.disabled = true;
  setMenu(false);
  renderSampleShell();
  refreshToolbar();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    completeSampleRun();
    return;
  }
  scheduleSampleStep(280);
}

function stopSamplePlayback() {
  if (samplePlayback.timer) window.clearTimeout(samplePlayback.timer);
  samplePlayback.timer = null;
  samplePlayback.active = false;
  samplePlayback.paused = false;
  samplePlayback.currentStep = -1;
  samplePlayback.header = null;
  samplePlayback.comparison = null;
  delete document.body.dataset.sampleRun;
  sampleTopbar.hidden = true;
  input.disabled = false;
  input.placeholder = "Ask anything...";
  sendBtn.disabled = false;
}

function scheduleSampleStep(delay = 820) {
  if (!samplePlayback.active || samplePlayback.paused) return;
  samplePlayback.timer = window.setTimeout(() => {
    samplePlayback.timer = null;
    revealNextSampleStep();
  }, delay);
}

function revealNextSampleStep({ schedule = true } = {}) {
  if (!samplePlayback.active) return;
  const nextStep = samplePlayback.currentStep + 1;
  if (nextStep >= SAMPLE_RUN.steps.length) {
    finishSampleRun();
    return;
  }
  samplePlayback.currentStep = nextStep;
  renderSampleStage(nextStep);
  updateSampleProgress();
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });
  if (nextStep === SAMPLE_RUN.steps.length - 1) {
    finishSampleRun();
  } else if (schedule) {
    scheduleSampleStep(nextStep === 2 ? 1050 : 820);
  }
}

function toggleSamplePause() {
  if (!samplePlayback.active || samplePlayback.currentStep === SAMPLE_RUN.steps.length - 1) return;
  samplePlayback.paused = !samplePlayback.paused;
  if (samplePlayback.timer) window.clearTimeout(samplePlayback.timer);
  samplePlayback.timer = null;
  const button = samplePlayback.header?.querySelector('[data-sample-action="pause"]');
  if (button) button.textContent = samplePlayback.paused ? "Resume" : "Pause";
  updateSampleProgress();
  if (!samplePlayback.paused) scheduleSampleStep(350);
}

function completeSampleRun() {
  if (!samplePlayback.active) return;
  if (samplePlayback.timer) window.clearTimeout(samplePlayback.timer);
  samplePlayback.timer = null;
  while (samplePlayback.currentStep < SAMPLE_RUN.steps.length - 1) {
    revealNextSampleStep({ schedule: false });
  }
  finishSampleRun();
}

function finishSampleRun() {
  if (!samplePlayback.active) return;
  document.body.dataset.sampleRun = "complete";
  samplePlayback.paused = false;
  const pauseButton = samplePlayback.header?.querySelector('[data-sample-action="pause"]');
  const skipButton = samplePlayback.header?.querySelector('[data-sample-action="skip"]');
  if (pauseButton) pauseButton.hidden = true;
  if (skipButton) skipButton.hidden = true;
  updateSampleProgress();
}

function renderSampleShell() {
  const recordedDate = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(SAMPLE_RUN.recorded_at));
  chatEl.innerHTML = `
    <section class="sample-run-header sample-reveal" aria-labelledby="sample-run-title">
      <div class="sample-run-heading">
        <div>
          <div class="sample-eyebrow">Recorded benchmark · ${recordedDate}</div>
          <h1 id="sample-run-title">Sample Compare run</h1>
          <p>A real saved result, replayed without contacting OpenRouter or Supabase.</p>
        </div>
        <div class="sample-controls" role="group" aria-label="Sample playback controls">
          <button type="button" data-sample-action="pause">Pause</button>
          <button type="button" data-sample-action="skip">Show all</button>
          <button type="button" data-sample-action="restart">Restart</button>
          <button type="button" data-sample-action="exit">Exit</button>
        </div>
      </div>
      <div class="sample-progress" role="progressbar" aria-label="Sample playback progress" aria-valuemin="0" aria-valuemax="${SAMPLE_RUN.steps.length}" aria-valuenow="0">
        <span></span>
      </div>
      <ol class="sample-stage-list">
        ${SAMPLE_RUN.steps.map((step) => `<li data-sample-step="${step.id}">${step.label}</li>`).join("")}
      </ol>
      <div class="sample-status" aria-live="polite">Preparing recorded run…</div>
    </section>
  `;
  samplePlayback.header = chatEl.querySelector(".sample-run-header");
}

function updateSampleProgress() {
  if (!samplePlayback.header) return;
  const completed = samplePlayback.currentStep + 1;
  const progress = samplePlayback.header.querySelector(".sample-progress");
  progress.setAttribute("aria-valuenow", String(Math.max(0, completed)));
  progress.style.setProperty(
    "--sample-progress",
    `${Math.max(0, completed) / SAMPLE_RUN.steps.length * 100}%`,
  );
  samplePlayback.header.querySelectorAll(".sample-stage-list li").forEach((item, index) => {
    item.dataset.status = index < samplePlayback.currentStep
      ? "done"
      : index === samplePlayback.currentStep
        ? "active"
        : "pending";
  });
  const status = samplePlayback.header.querySelector(".sample-status");
  if (samplePlayback.currentStep === SAMPLE_RUN.steps.length - 1) {
    status.textContent = "Playback complete · this run used no API calls";
  } else if (samplePlayback.paused) {
    status.textContent = `Paused after ${SAMPLE_RUN.steps[samplePlayback.currentStep]?.label || "start"}`;
  } else if (samplePlayback.currentStep >= 0) {
    status.textContent = `${SAMPLE_RUN.steps[samplePlayback.currentStep].label} loaded`;
  }
}

function renderSampleStage(index) {
  const sampleCase = SAMPLE_RUN.case;
  if (index === 0) {
    const prompt = addMessage("user", sampleCase.question);
    prompt.bubble.classList.add("sample-reveal");
    const note = document.createElement("div");
    note.className = "msg-meta user sample-reveal";
    note.textContent = `${sampleCase.id} · ${sampleCase.category} · fixed evaluation prompt`;
    prompt.wrap.appendChild(note);
    return;
  }
  if (index === 1) {
    const comparison = document.createElement("div");
    comparison.className = "compare-block sample-reveal";
    const grid = document.createElement("div");
    grid.className = "compare-grid";
    const standardCard = buildCompareCard(
      "No RAG",
      sampleCase.standard.reply,
      sampleCase.standard.usage,
      false,
      SAMPLE_RUN.model,
    );
    appendSampleLatency(standardCard, sampleCase.standard.latency_ms);
    grid.appendChild(standardCard);
    const pendingCard = document.createElement("section");
    pendingCard.className = "compare-card rag sample-pending-card";
    pendingCard.innerHTML = '<div class="compare-label rag">RAG</div><div class="sample-pending-copy"><span class="sample-pulse"></span>Waiting for retrieval</div>';
    grid.appendChild(pendingCard);
    comparison.appendChild(grid);
    chatEl.appendChild(comparison);
    samplePlayback.comparison = comparison;
    return;
  }
  if (index === 2) {
    const pendingCard = samplePlayback.comparison?.querySelector(".sample-pending-card");
    if (!pendingCard) return;
    pendingCard.innerHTML = `
      <div class="compare-label rag">RAG · retrieving</div>
      <div class="sample-retrieval-count">${sampleCase.metrics.retrieved_count} chunks matched</div>
      <ol class="sample-match-list">
        ${sampleCase.rag.sources.slice(0, 3).map((source) => `<li><span>${source.citation}</span><strong>${source.similarity.toFixed(2)}</strong></li>`).join("")}
      </ol>
    `;
    pendingCard.classList.add("sample-reveal");
    return;
  }
  if (index === 3) {
    const pendingCard = samplePlayback.comparison?.querySelector(".sample-pending-card");
    if (!pendingCard) return;
    const ragCard = buildCompareCard(
      "RAG",
      sampleCase.rag.reply,
      sampleCase.rag.usage,
      true,
      SAMPLE_RUN.model,
    );
    ragCard.classList.add("sample-reveal");
    appendSampleLatency(ragCard, sampleCase.rag.latency_ms);
    pendingCard.replaceWith(ragCard);
    return;
  }
  const context = buildRetrievedContext(sampleCase.rag.sources);
  if (context) {
    context.open = false;
    context.classList.add("sample-reveal");
    samplePlayback.comparison?.appendChild(context);
  }
  samplePlayback.comparison?.appendChild(buildSampleEvaluation());
  refreshToolbar();
}

function appendSampleLatency(card, latencyMs) {
  const meta = document.createElement("span");
  meta.className = "sample-latency";
  meta.textContent = `Recorded latency ${(latencyMs / 1000).toFixed(2)}s`;
  card.querySelector(".compare-label")?.appendChild(meta);
}

function buildSampleEvaluation() {
  const { metrics } = SAMPLE_RUN.case;
  const { summary } = SAMPLE_RUN;
  const section = document.createElement("section");
  section.className = "sample-evaluation sample-reveal";
  section.innerHTML = `
    <div class="sample-evaluation-head">
      <div>
        <span class="sample-eyebrow">Evaluation</span>
        <h2>Grounded where the baseline stalled</h2>
      </div>
      <span class="sample-check-badge">Checks passed</span>
    </div>
    <div class="sample-checks">
      <span>${metrics.citation_pass ? "✓" : "—"} valid citations</span>
      <span>${metrics.expected_source_pass ? "✓" : "—"} expected source</span>
      <span>${metrics.retrieved_count} retrieved chunks</span>
      <span>${(metrics.max_similarity * 100).toFixed(1)}% top similarity</span>
    </div>
    <div class="sample-benchmark-summary" role="group" aria-label="Full benchmark summary">
      <div><strong>${summary.question_count}</strong><span>fixed prompts</span></div>
      <div><strong>${Math.round(summary.citation_pass_rate * 100)}%</strong><span>citation pass</span></div>
      <div><strong>${Math.round(summary.expected_source_pass_rate * 100)}%</strong><span>source pass</span></div>
      <div><strong>${(summary.average_rag_latency_ms / 1000).toFixed(2)}s</strong><span>avg RAG latency</span></div>
      <div><strong>$${summary.total_cost_usd.toFixed(4)}</strong><span>full run cost</span></div>
    </div>
    <div class="sample-evaluation-foot">
      <span>Structural checks from the 15-question benchmark.</span>
      <button type="button" data-sample-action="configure">Run with your own key</button>
    </div>
  `;
  return section;
}

function renderHero() {
  chatEl.innerHTML = `
    <div class="hero" id="placeholder">
      <h1 class="hero-title">Xenophon</h1>
      <p class="hero-tagline">Reflective RAG assistant with an inspectable agent pipeline</p>
      <p class="hero-hint">Run Standard, RAG, Agent, or Compare mode to inspect retrieval quality, cited sources, token usage, and grounding checks.</p>
      <div class="hero-actions">
        <button type="button" class="sample-run-cta" id="view-sample-run">View sample run</button>
        <span>No API key required</span>
      </div>
    </div>
  `;
}

resetAllBtn.addEventListener("click", () => {
  if (!confirm("Reset everything? This wipes the key, the sliders, and the conversation.")) return;
  Object.values(KEYS).forEach((k) => sessionStorage.removeItem(k));
  keyInput.value = "";
  modelSelect.value = DEFAULTS.model;
  tempInput.value = DEFAULTS.temperature;
  toppInput.value = DEFAULTS.top_p;
  maxtokInput.value = DEFAULTS.max_tokens;
  renderSliderValues();
  applySamplingLock();
  syncSamplingPresetIndicator();
  showLogprobsInput.checked = false;
  applyLogprobsState();
  responseModeSelect.value = DEFAULTS.response_mode;
  supabaseUrlInput.value = DEFAULTS.supabase_url;
  supabaseKeyInput.value = DEFAULTS.supabase_key;
  ragMatchCountInput.value = DEFAULTS.rag_match_count;
  ragThresholdInput.value = DEFAULTS.rag_threshold;
  applyResponseModeState();
  resetConversation();
  refreshToolbar();
  setMenu(true);
});

function resetConversation() {
  stopSamplePlayback();
  resetConversationState(state);
  renderHero();
  refreshToolbar();
}

function buildFirstUserMessage(text) {
  return `${XENOPHON_PROMPT}\n\n# User message\n${text}`;
}

function buildUserMessage(text, isFirstTurn) {
  return {
    role: "user",
    content: isFirstTurn ? buildFirstUserMessage(text) : text,
    timestamp: new Date().toISOString(),
  };
}



function addMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.style.display = "contents";
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  bubble.textContent = text;
  wrap.appendChild(bubble);
  chatEl.appendChild(wrap);
  bubble.scrollIntoView({ behavior: "smooth", block: "end" });
  return { wrap, bubble };
}

function renderCompareResult({ standardResult, ragResult }) {
  const wrap = document.createElement("div");
  wrap.className = "compare-block";

  const grid = document.createElement("div");
  grid.className = "compare-grid";
  grid.appendChild(buildCompareCard("No RAG", standardResult.reply, standardResult.usage));
  grid.appendChild(buildCompareCard("RAG", ragResult.reply, ragResult.usage, true));
  wrap.appendChild(grid);

  const context = buildRetrievedContext(ragResult.sources);
  if (context) wrap.appendChild(context);

  chatEl.appendChild(wrap);
}

function buildCompareCard(label, reply, usage, isRag = false, model = modelSelect.value) {
  const card = document.createElement("section");
  card.className = `compare-card${isRag ? " rag" : ""}`;

  const heading = document.createElement("div");
  heading.className = `compare-label${isRag ? " rag" : ""}`;
  heading.textContent = label;
  card.appendChild(heading);

  const body = document.createElement("div");
  body.className = "compare-card-body";
  body.innerHTML = renderMarkdown(reply);
  card.appendChild(body);

  if (usage) {
    const inTok = usage.prompt_tokens || 0;
    const outTok = (usage.total_tokens || 0) - inTok;
    const reasoningTok = usage.completion_tokens_details?.reasoning_tokens || 0;
    const cachedTok = usage.prompt_tokens_details?.cached_tokens || 0;
    appendMeta(card, inTok, outTok, reasoningTok, cachedTok, estimateCost(usage, model));
  }
  appendActionChips(card, reply, { allowRegenerate: false });
  return card;
}

// Build the coloured token-chip view for a single assistant reply, from
// the `logprobs.content` array returned when logprobs is enabled.
// Each chip's background is driven by the chosen token's logprob
// (green = confident, red = uncertain). Click a chip → popover showing
// the top-5 alternatives the model considered at that position.
function renderTokenChips(content) {
  const container = document.createElement("span");
  container.className = "token-chips";
  for (const item of content) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "token-chip";
    chip.textContent = item.token;
    chip.style.background = logprobToColor(item.logprob);
    const prob = Math.exp(item.logprob) * 100;
    chip.title = `${prob.toFixed(2)}% — click for alternatives`;
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      showLogprobPopover(chip, item);
    });
    container.appendChild(chip);
  }
  return container;
}

// Map a log-probability onto a hue from red (very unlikely) to green
// (near-certain). Anything below logprob -5 is effectively red.
function logprobToColor(lp) {
  const clamped = Math.max(-5, Math.min(0, lp));
  const hue = 120 * (1 + clamped / 5);
  return `hsl(${hue.toFixed(0)}, 55%, 28%)`;
}

function showLogprobPopover(anchor, item) {
  document.querySelectorAll(".logprob-popover").forEach((p) => p.remove());
  const popover = document.createElement("div");
  popover.className = "logprob-popover";

  const title = document.createElement("div");
  title.className = "popover-title";
  const chosenProb = Math.exp(item.logprob) * 100;
  title.textContent = `"${item.token}" — ${chosenProb.toFixed(2)}% chosen`;
  popover.appendChild(title);

  const list = document.createElement("ul");
  list.className = "popover-list";
  for (const alt of item.top_logprobs || []) {
    const li = document.createElement("li");
    if (alt.token === item.token) li.classList.add("chosen");
    const prob = Math.exp(alt.logprob) * 100;
    const tokenSpan = document.createElement("span");
    tokenSpan.className = "alt-token";
    tokenSpan.textContent = JSON.stringify(alt.token).slice(1, -1);
    const barWrap = document.createElement("span");
    barWrap.className = "alt-bar-wrap";
    const bar = document.createElement("span");
    bar.className = "alt-bar";
    bar.style.width = `${Math.max(2, prob).toFixed(1)}%`;
    barWrap.appendChild(bar);
    const probSpan = document.createElement("span");
    probSpan.className = "alt-prob";
    probSpan.textContent = `${prob.toFixed(2)}%`;
    li.append(tokenSpan, barWrap, probSpan);
    list.appendChild(li);
  }
  popover.appendChild(list);

  document.body.appendChild(popover);
  // Position below the anchor, clamped to the viewport.
  const rect = anchor.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const maxLeft = window.innerWidth - popRect.width - 12;
  const left = Math.min(Math.max(12, rect.left), maxLeft);
  popover.style.left = `${left}px`;
  popover.style.top = `${rect.bottom + 6}px`;

  const dismiss = (event) => {
    if (!popover.contains(event.target) && event.target !== anchor) {
      popover.remove();
      document.removeEventListener("click", dismiss);
    }
  };
  setTimeout(() => document.addEventListener("click", dismiss), 0);
}

function appendActionChips(wrap, textForCopy, options = {}) {
  const { allowRegenerate = true } = options;
  const row = document.createElement("div");
  row.className = "msg-actions";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "action-chip";
  copyBtn.textContent = "Copy";
  copyBtn.title = "Copy this reply to the clipboard";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textForCopy);
      copyBtn.textContent = "Copied";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("copied");
      }, 1200);
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    }
  });
  row.appendChild(copyBtn);
  if (allowRegenerate) {
    const regenBtn = document.createElement("button");
    regenBtn.type = "button";
    regenBtn.className = "action-chip";
    regenBtn.textContent = "Regenerate";
    regenBtn.title = "Ask the model for a different reply to the same prompt";
    regenBtn.addEventListener("click", () => regenerate());
    row.appendChild(regenBtn);
  }
  wrap.appendChild(row);
}

function buildRetrievedContext(sources) {
  if (!Array.isArray(sources) || !sources.length) return null;
  const details = document.createElement("details");
  details.className = "retrieved-context";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = `Retrieved context (${sources.length})`;
  details.appendChild(summary);

  const list = document.createElement("div");
  list.className = "retrieved-context-list";
  for (const source of sources) {
    const item = document.createElement("section");
    item.className = "retrieved-source";

    const head = document.createElement("div");
    head.className = "retrieved-source-head";

    const citation = document.createElement("span");
    citation.className = "retrieved-source-citation";
    citation.textContent = source.citation;
    head.appendChild(citation);

    const score = document.createElement("span");
    score.className = "retrieved-source-score";
    score.textContent = `similarity ${Number(source.similarity || 0).toFixed(2)}`;
    head.appendChild(score);

    const path = document.createElement("span");
    path.className = "retrieved-source-path";
    path.textContent = source.source_path;
    head.appendChild(path);

    const excerpt = document.createElement("div");
    excerpt.className = "retrieved-source-excerpt";
    excerpt.textContent = source.excerpt;

    item.append(head, excerpt);
    list.appendChild(item);
  }
  details.appendChild(list);
  return details;
}

function appendRetrievedContext(wrap, sources) {
  const context = buildRetrievedContext(sources);
  if (context) wrap.appendChild(context);
}

function appendPipelineTrace(wrap, trace) {
  const panel = buildPipelineTrace(trace);
  if (panel) wrap.appendChild(panel);
}

function buildPipelineTrace(trace) {
  if (!trace || !Array.isArray(trace.steps) || !trace.steps.length) return null;

  const panel = document.createElement("section");
  panel.className = "pipeline-trace";

  const head = document.createElement("div");
  head.className = "pipeline-trace-head";

  const title = document.createElement("div");
  title.className = "pipeline-trace-title";
  title.textContent = "Pipeline trace";
  head.appendChild(title);

  const badge = document.createElement("span");
  badge.className = `pipeline-badge ${trace.badge_tone === "grounded" ? "grounded" : "weak"}`;
  badge.textContent = trace.badge || "Weak evidence";
  head.appendChild(badge);
  panel.appendChild(head);

  const summary = document.createElement("div");
  summary.className = "pipeline-summary";
  summary.appendChild(buildPipelineStat("Decision", String(trace.decision || "answer")));
  summary.appendChild(buildPipelineStat("Chunks found", String(trace.retrieved_count ?? 0)));
  summary.appendChild(buildPipelineStat("Queries used", String(Array.isArray(trace.rewritten_queries) ? trace.rewritten_queries.length : 0)));
  summary.appendChild(buildPipelineStat("Retry queries", String(Array.isArray(trace.retry_queries) ? trace.retry_queries.length : 0)));
  summary.appendChild(buildPipelineStat("Final sources", String(Array.isArray(trace.used_sources) ? trace.used_sources.length : 0)));
  panel.appendChild(summary);

  const steps = document.createElement("div");
  steps.className = "pipeline-steps";

  for (const step of trace.steps) {
    const item = document.createElement("section");
    item.className = "pipeline-step";

    const itemHead = document.createElement("div");
    itemHead.className = "pipeline-step-head";

    const label = document.createElement("div");
    label.className = "pipeline-step-label";
    label.textContent = step.label;

    const status = document.createElement("span");
    const normalizedStatus = String(step.status || "skipped").replace(/_/g, "-");
    status.className = `pipeline-step-status ${normalizedStatus}`;
    status.textContent = String(step.status || "skipped");

    itemHead.append(label, status);
    item.appendChild(itemHead);

    const stepSummary = document.createElement("div");
    stepSummary.className = "pipeline-step-summary";
    stepSummary.textContent = step.summary || "";
    item.appendChild(stepSummary);

    const items = buildStepItems(step.id, trace);
    if (items.length) {
      const list = document.createElement("ul");
      list.className = "pipeline-step-list";
      for (const text of items) {
        const li = document.createElement("li");
        li.textContent = text;
        list.appendChild(li);
      }
      item.appendChild(list);
    }

    steps.appendChild(item);
  }

  panel.appendChild(steps);
  return panel;
}

function buildPipelineStat(label, value) {
  const stat = document.createElement("div");
  stat.className = "pipeline-stat";

  const statLabel = document.createElement("span");
  statLabel.className = "pipeline-stat-label";
  statLabel.textContent = label;

  const statValue = document.createElement("span");
  statValue.className = "pipeline-stat-value";
  statValue.textContent = value;

  stat.append(statLabel, statValue);
  return stat;
}

function buildStepItems(stepId, trace) {
  if (stepId === "plan") {
    const items = [];
    if (trace.decision) items.push(`Decision: ${trace.decision}`);
    if (trace.intent) items.push(`Intent: ${trace.intent}`);
    if (trace.retrieval_goal) items.push(`Retrieval goal: ${trace.retrieval_goal}`);
    if (trace.clarifying_question) items.push(`Clarifying question: ${trace.clarifying_question}`);
    return items;
  }
  if (stepId === "query_rewrite") {
    return Array.isArray(trace.rewritten_queries) ? trace.rewritten_queries : [];
  }
  if (stepId === "retrieve") {
    return Array.isArray(trace.used_sources) && trace.used_sources.length
      ? trace.used_sources
      : ["No source citations were used in the final answer."];
  }
  if (stepId === "retrieve_retry") {
    return Array.isArray(trace.retry_queries) && trace.retry_queries.length
      ? trace.retry_queries
      : ["No retry pass was needed."];
  }
  if (stepId === "verify") {
    const items = [];
    const verification = trace.verification || {};
    for (const claim of Array.isArray(verification.supported_claims) ? verification.supported_claims : []) {
      items.push(`Supported: ${claim}`);
    }
    for (const claim of Array.isArray(verification.unsupported_claims) ? verification.unsupported_claims : []) {
      items.push(`Needs caution: ${claim}`);
    }
    return items.slice(0, 4);
  }
  return [];
}

function appendUserMeta(wrap, tokens, isFirstTurn) {
  const meta = document.createElement("div");
  meta.className = "msg-meta user";
  meta.title = isFirstTurn
    ? "Tokens for this turn. Includes the embedded Xenophon prompt, which is prepended only to the first user message."
    : "Tokens this message added to the context.";
  meta.textContent = isFirstTurn
    ? `${tokens.toLocaleString()} tokens (incl. Xenophon prompt)`
    : `${tokens.toLocaleString()} tokens`;
  wrap.appendChild(meta);
}

function appendMeta(wrap, inTok, outTok, reasoningTok, cachedTok, cost) {
  const meta = document.createElement("div");
  meta.className = "msg-meta";
  const bits = [];
  if (reasoningTok) bits.push("'reasoning' tokens are the model's hidden chain-of-thought, billed as output");
  if (cachedTok) bits.push("'cached' tokens are prompt tokens that hit provider prompt caching, billed at a discount when supported");
  meta.title = bits.length
    ? `Tokens and cost for this reply. ${bits.join(". ")}.`
    : "Tokens and cost for this single reply";
  const out = Math.max(0, outTok).toLocaleString();
  const inSegment = cachedTok
    ? `${inTok.toLocaleString()} tokens in · <span class="cached">${cachedTok.toLocaleString()} cached</span>`
    : `${inTok.toLocaleString()} tokens in`;
  const outSegment = reasoningTok
    ? `${out} tokens out (${reasoningTok.toLocaleString()} reasoning)`
    : `${out} tokens out`;
  meta.innerHTML =
    `${inSegment} · ${outSegment} · ` +
    `<span class="cost">${formatCost(cost)}</span>`;
  wrap.appendChild(meta);
}

function refreshToolbar() {
  const hasTranscript = transcriptTurns.length > 0;
  downloadSimpleBtn.disabled = !hasTranscript;
  downloadDetailedBtn.disabled = !hasTranscript;
  clearBtn.disabled = !hasConversation();
  statMsgs.textContent = String(chatEl.querySelectorAll(".msg, .compare-card").length);
  statIn.textContent = state.tokensIn.toLocaleString();
  statOut.textContent = state.tokensOut.toLocaleString();
  statCost.textContent = formatCost(state.costTotal);
  // Only surface the cached pill once caching has actually fired.
  if (state.tokensCached > 0) {
    statCached.textContent = `${state.tokensCached.toLocaleString()} cached`;
    statCached.hidden = false;
    statCachedSep.hidden = false;
  } else {
    statCached.hidden = true;
    statCachedSep.hidden = true;
  }
}

function renderSliderValues() {
  tempValue.textContent = parseFloat(tempInput.value).toFixed(1);
  toppValue.textContent = parseFloat(toppInput.value).toFixed(2);
  maxtokValue.textContent = parseInt(maxtokInput.value, 10).toLocaleString();
  ragMatchCountValue.textContent = parseInt(ragMatchCountInput.value, 10).toLocaleString();
  ragThresholdValue.textContent = parseFloat(ragThresholdInput.value).toFixed(2);
}


function trackUsage(usage, model, kind) {
  if (!usage) return;
  const inTok = usage.prompt_tokens || 0;
  const outTok = (usage.total_tokens || 0) - inTok;
  const cachedTok = usage.prompt_tokens_details?.cached_tokens || 0;
  state.tokensIn += inTok;
  state.tokensOut += Math.max(0, outTok);
  state.tokensCached += cachedTok;
  state.costTotal += estimateCost(usage, model);
  if (kind === "rag") {
    state.prevRagPromptTokens = inTok;
    state.prevRagCompletionTokens = Math.max(0, outTok);
  } else {
    state.prevPromptTokens = inTok;
    state.prevCompletionTokens = Math.max(0, outTok);
  }
}
