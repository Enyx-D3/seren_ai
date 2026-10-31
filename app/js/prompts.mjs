/* Seren 7 — the verified Falcon Instruct chat template only.
   Token ids (GGUF metadata): eos=11, eot=16, im_end=228. */

export const SPC = {
  start: "<|im_start|>", end: "<|im_end|>",
  bos: "<|begin_of_text|>", eos: "<|end_of_text|>", eot: "<|eot_id|>",
};

/* Generation stop ids per family. The ingest pipeline refreshes these from
   the actual GGUF markers in each model descriptor (stopsFor). */
export const DEFAULT_STOPS = {
  falcon_instruct: [228, 11, 16],
};

export function stopsFor(desc) {
  if (!desc || !desc.gguf) return DEFAULT_STOPS.falcon_instruct;
  if (desc.id !== 'falcon_instruct') throw new Error('only Falcon Instruct is supported');
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
    "Your name is Seren. Do not invent another name, human identity or personal experience. For greetings, reply briefly without a self-introduction.",
    "If asked what you are: you are Seren, running one local Falcon Instruct model with B2 Spiral entirely on the user's device.",
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
  if (modelId !== 'falcon_instruct') throw new Error('only Falcon Instruct is supported');
  const sys = opts.tools ? (opts.system || baseSystem({ think: !!opts.think })) + "\n" + toolSystemBlock(opts.tools) : (opts.system || baseSystem({ think: !!opts.think }));
  let s = SPC.start + "system\n" + sys + SPC.end + "\n";
  for (const t of turns) {
    if (t.role === "system") continue;
    s += SPC.start + (t.role === "assistant" ? "assistant" : "user") + "\n" + t.content + SPC.end + "\n";
  }
  s += SPC.start + "assistant\n";
  return { prompt: s, stops: DEFAULT_STOPS.falcon_instruct, mode: "chat", family: "falcon_instruct" };
}
