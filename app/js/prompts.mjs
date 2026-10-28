/* Seren 7 — prompt construction from the models' own verified templates.
   Template sources: chat templates extracted from the CP001 archives
   (workspace/models/falcon_*: chat_template.jinja files), byte-identical to the
   official HF repos:
   - falcon_instruct: <|im_start|>/<|im_end|> style chat
   - falcon_reason:   {{bos_token}} + <|im_start|> style; tool branch adds the
                      function-calling protocol
   - falcon_tools:    same <|im_start|> family style + tool protocol
   - falcon_coder:    NO chat template (GGUF kv + archive agree) → raw completion / FIM
   Token ids (GGUF metadata): bos=17 <|begin_of_text|>, eos=11 <|end_of_text|>,
   eot=16 <|eot_id|>, im_end=228 (instruct generation_config eos list [228, 11]). */

export const SPC = {
  start: "<|im_start|>", end: "<|im_end|>",
  bos: "<|begin_of_text|>", eos: "<|end_of_text|>", eot: "<|eot_id|>",
  fimPrefix: ">>PREFIX<<", fimMiddle: ">>MIDDLE<<", fimSuffix: ">>SUFFIX<<",
};

/* Generation stop ids per family. The ingest pipeline refreshes these from
   the actual GGUF markers in each model descriptor (stopsFor). */
export const DEFAULT_STOPS = {
  falcon_instruct: [228, 11, 16],
  falcon_reason: [228, 11, 16],
  falcon_tools: [228, 11, 16],
  falcon_coder: [11],
};

export function stopsFor(desc) {
  if (!desc || !desc.gguf) return DEFAULT_STOPS.falcon_instruct;
  if (desc.id === "falcon_coder") {
    const eos = desc.gguf.markers ? desc.gguf.markers[SPC.eos] : null;
    return [...new Set([eos, desc.gguf.eosId].filter(v => v != null))];
  }
  const m = desc.gguf.markers || {};
  return [...new Set([m[SPC.end], m[SPC.eot], desc.gguf.eosId].filter(v => v != null))];
}

/* Honest local system prompt. Kept short: 90M models do best with terse rules. */
export function baseSystem(opts) {
  opts = opts || {};
  const lines = [
    "You are Seren, a local assistant running on this device inside the Seren 7 app. Nothing goes to the cloud.",
    "Answer in chat-friendly Markdown: short paragraphs, occasional bold, lists when they help, fenced code blocks for code. No tables, images or HTML.",
    "Keep most answers under 200 words unless asked for more. Be warm, precise and direct, with no filler openers.",
    "If asked what you are: you are Seren, running local Falcon models entirely on the user's device.",
  ];
  if (opts.think) lines.push("The person asked you to think deeper: work out the tricky parts carefully step by step before answering.");
  return lines.join("\n");
}

export function toolSystemBlock(jsonTools) {
  return [
    "You are a Falcon assistant skilled in function calling. You are helpful, respectful, and concise.",
    "",
    "# Tools",
    "",
    "You have access to the following functions. You MUST use them to answer questions when needed. For each function call, you MUST return a JSON object inside <tool_call></tool_call> tags.",
    "",
    "<tools>",
    JSON.stringify(jsonTools, null, 2),
    "</tools>",
    "",
    "# Output Format",
    "",
    "Your response MUST follow this format when making function calls:",
    "<tool_call>",
    '[{"name": "function_name", "arguments": {"arg1": "value1"}}]',
    "</tool_call>",
    "If no function calls are needed, respond normally without the tool_call tags.",
  ].join("\n");
}

/* Build the final prompt for a chat turn.
   turns: [{role:'user'|'assistant', content}] earliest-first.
   opts:  {system, tools (JSON tool descriptions|null), think}           */
export function buildChatPrompt(modelId, turns, opts) {
  opts = opts || {};
  if (modelId === "falcon_coder") return buildCoderPrompt(turns, opts);
  const fam = modelId === "falcon_reason" ? "falcon_reason" : modelId === "falcon_tools" ? "falcon_tools" : "falcon_instruct";
  const sys = opts.tools ? (opts.system || baseSystem({ think: !!opts.think })) + "\n" + toolSystemBlock(opts.tools) : (opts.system || baseSystem({ think: !!opts.think }));
  let s = "";
  if (fam !== "falcon_instruct") s += SPC.bos;
  s += opts.tools && fam !== "falcon_instruct" ? "<|system|>\n" + sys + "\n" : SPC.start + "system\n" + sys + SPC.end + "\n";
  for (const t of turns) {
    if (t.role === "system") continue;
    s += SPC.start + (t.role === "assistant" ? "assistant" : "user") + "\n" + t.content + SPC.end + "\n";
  }
  s += SPC.start + "assistant\n";
  return { prompt: s, stops: DEFAULT_STOPS[fam], mode: "chat", family: fam };
}

/* Coder: raw-continuation specialist (no chat template — evidence on record).
   Framing is deliberately minimal: the conversation text, then continuation. */
export function buildCoderPrompt(turns, opts) {
  opts = opts || {};
  const text = turns.filter(t => t.role !== "system").map(t => t.content).join("\n\n");
  return { prompt: text, stops: DEFAULT_STOPS.falcon_coder, mode: "raw", family: "falcon_coder" };
}

/* Coder FIM (prefix / suffix / middle). FIM token existence is verified against
   the GGUF vocab; the padding ORDER below is the standard PSM layout and must be
   empirically confirmed in CP006 (code-completion acceptance) before promotion. */
export function buildFimPrompt(prefix, suffix) {
  return {
    prompt: prefix + "\n" + SPC.fimSuffix + "\n" + suffix + "\n" + SPC.fimMiddle + "\n",
    stops: DEFAULT_STOPS.falcon_coder, mode: "fim", family: "falcon_coder",
  };
}
