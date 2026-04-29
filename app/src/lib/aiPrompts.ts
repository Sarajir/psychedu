export type PresetId =
  | "pack"
  | "cloze"
  | "cards"
  | "english"
  | "math"
  | "music"
  | "psych";

const PRESETS: Record<
  PresetId,
  { label: string; system: string; userSuffix: string }
> = {
  pack: {
    label: "综合复习包（大纲 + 自测 + 易错点）",
    system: `你是学习教练。根据用户上传的材料，输出一份「可执行」的复习包，必须用简体中文。
要求：结构清晰，使用 Markdown 标题（## / ###）；避免空话；若材料不足以推断，明确写「材料未给出，需补充」。
不要编造不存在的引用或页码。`,
    userSuffix: `请输出：1) 核心概念地图（分层要点）2) 10 道自测问答题（先问题，后附简短答案）3) 易错点/混淆点清单 4) 建议的 7 天轻量复习节奏（每天 10–20 分钟）。`,
  },
  cloze: {
    label: "填空挖空 + 术语表",
    system: `你是出题助手。根据材料用简体中文生成「填空练习」与术语表。不要编造材料里不存在的事实。`,
    userSuffix: `请输出：1) 20 个填空句（用 ____ 表示空），每题单独一行，空后另起一行给答案 2) 术语表（术语：一句话定义）至少 15 条。`,
  },
  cards: {
    label: "问答卡（Markdown，便于复制）",
    system: `你用简体中文生成「问答卡」列表，便于复制到 Anki/Markdown。材料不足处请标注。`,
    userSuffix: `请输出至少 24 张卡，每张格式严格如下：
### Q
（问题）
### A
（答案，尽量简洁）
---`,
  },
  english: {
    label: "英语：词汇 + 搭配 + 例句",
    system: `你是英语学习教练。根据材料提取高频词与学术表达，用简体中文讲解，例句中英对照。`,
    userSuffix: `请输出：1) 词汇表（词/音标可选/中文义/常见搭配）至少 20 个 2) 10 组易混词辨析 3) 5 个可直接背诵的句子模板。`,
  },
  math: {
    label: "数学：定义–定理–例题骨架",
    system: `你是数学老师。根据材料用简体中文整理结构化解题与概念要点；推导要分步；若材料缺证明只写「材料未给出」。`,
    userSuffix: `请输出：1) 关键定义 2) 关键定理/公式（适用条件）3) 3 道由易到难的练习题（附答案要点）4) 常见错误模式。`,
  },
  music: {
    label: "乐理 / 五线谱读谱要点",
    system: `你是乐理与视奏教练。若材料含谱面或乐理内容，请用简体中文给出练习步骤；若只是文字则据文字总结。`,
    userSuffix: `请输出：1) 谱面信息速读清单（拍号、调性、节奏型等，能看出的才写）2) 视奏/听辨练习建议 3) 10 个小测验问答。`,
  },
  psych: {
    label: "心理 / 认知：概念 + 例子 + 辨析",
    system: `你是心理学本科助教。根据材料用简体中文整理概念、经典效应、研究范式与易混辨析；避免临床诊断建议。`,
    userSuffix: `请输出：1) 概念卡片（概念：定义+1 个生活例子）至少 16 条 2) 易混概念对比表 3) 自测问答题 10 道（附短答）。`,
  },
};

export function listPresets(): { id: PresetId; label: string }[] {
  return (Object.keys(PRESETS) as PresetId[]).map((id) => ({
    id,
    label: PRESETS[id].label,
  }));
}

export function buildPresetPayload(opts: {
  preset: PresetId;
  topicHint: string;
  fileMime: string | null;
  hasBinary: boolean;
}): { systemInstruction: { parts: { text: string }[] }; userSuffix: string } {
  const p = PRESETS[opts.preset];
  const scope = opts.hasBinary
    ? "用户上传了文件（可能是 PDF 或图片）。请优先依据文件内容作答。"
    : "用户未上传文件，仅根据文字说明生成。";
  const topic = opts.topicHint.trim()
    ? `用户给出的学习主题/场景说明：${opts.topicHint.trim()}`
    : "用户未额外说明主题，请从材料中自行归纳学习目标。";
  const system = `${p.system}\n\n${scope}\n${topic}`;
  return {
    systemInstruction: { parts: [{ text: system }] },
    userSuffix: p.userSuffix,
  };
}
