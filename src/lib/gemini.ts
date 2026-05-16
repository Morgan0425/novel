import { GoogleGenAI } from "@google/genai";

export interface NovelConfig {
  characterProfiles: string;
  worldbuilding: string;
  writingStyle: string;
  outline: string;
  wordCount: number;
}

export interface ChapterParams {
  chapterNum: number;
  chapterTitle?: string;
  synopsis?: string;
  lastChapterEnding?: string;
}

export interface BatchParams {
  start: number;
  end: number;
  total: number;
  batchSynopsisList: string;
}

export interface RegenParams {
  chapterNum: number;
  regenNote: string;
  issue: string;
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const buildSystemInstruction = (config: NovelConfig) => {
  return `你是一位专业的中文小说写作助手。每次写作前，请严格遵循以下所有设定。

══════════════════════════════
【角色档案】
${config.characterProfiles}

══════════════════════════════
【世界观设定】
${config.worldbuilding}

══════════════════════════════
【文风参考】
${config.writingStyle}

══════════════════════════════
【全文大纲】
${config.outline}

══════════════════════════════
【写作规则】
1. 严格遵循以上设定，不得擅自改变角色性格或违反世界观逻辑
2. 保持所指定的文风，不随意改变叙事节奏与语言风格
3. 每章目标字数：${config.wordCount} 字
4. 章节末尾自然收束，留有情绪钩子引出下一章
5. 直接输出正文内容，不要附加任何说明、注释或前言`;
};

export async function generateChapter(config: NovelConfig, params: ChapterParams) {
  const ai = getAI();
  const systemInstruction = buildSystemInstruction(config);
  
  let userPrompt = "";
  if (params.synopsis) {
    userPrompt = `【单章生成指令（含梗概）】
请根据以下梗概，写作第 ${params.chapterNum} 章《${params.chapterTitle || "未命名"}》。
本章梗概：${params.synopsis}`;
  } else {
    userPrompt = `【单章生成指令（无梗概）】
请根据大纲，自由发挥写作第 ${params.chapterNum} 章。
上一章结尾：${params.lastChapterEnding || "（第一章，无上一章结尾）"}`;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: 0.8,
    },
  });

  return response.text;
}

export async function generateBatch(config: NovelConfig, params: BatchParams) {
  const ai = getAI();
  const systemInstruction = buildSystemInstruction(config);
  
  const userPrompt = `【批量生成指令】
请依次写作第 ${params.start} 章到第 ${params.end} 章，共 ${params.total} 章。
各章梗概：${params.batchSynopsisList}
每章之间用「---」分隔，每章开头标注章节名。`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview", // Use Pro for complex batch generation
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: 0.7,
    },
  });

  return response.text;
}

export async function regenerateChapter(config: NovelConfig, params: RegenParams) {
  const ai = getAI();
  const systemInstruction = buildSystemInstruction(config);
  
  const userPrompt = `【重新生成指令】
请重新写作第 ${params.chapterNum} 章，做出以下调整：
${params.regenNote}
原版问题：${params.issue}
其余设定不变，直接输出新版正文。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: 0.9,
    },
  });

  return response.text;
}
