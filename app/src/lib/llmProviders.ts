export type LlmProviderId = "gemini" | "deepseek" | "groq";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderConfig {
  id: LlmProviderId;
  label: string;
  blurb: string;
  keyHint: string;
  keyUrl: string;
  models: ModelOption[];
}

export const LLM_PROVIDERS: ProviderConfig[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    blurb: "支持 PDF / 图片 / Office 等多模态；免费额度以 Google 为准。",
    keyHint: "Google AI Studio 申请",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.0-flash", label: "gemini-2.0-flash（稳）" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash（新）" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    blurb: "OpenAI 兼容、价格低；本页仅传文本（不上传 PDF/图）。",
    keyHint: "DeepSeek 开放平台",
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "deepseek-chat" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner（推理）" },
      { id: "deepseek-v4-flash", label: "deepseek-v4-flash" },
      { id: "deepseek-v4-pro", label: "deepseek-v4-pro" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    blurb: "速度快，常有慷慨免费档；仅文本。模型列表以 Groq 控制台为准。",
    keyHint: "Groq Console",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { id: "gemma2-9b-it", label: "Gemma2 9B IT" },
    ],
  },
];

export function providerById(id: LlmProviderId): ProviderConfig {
  const p = LLM_PROVIDERS.find((x) => x.id === id);
  return p ?? LLM_PROVIDERS[0];
}
