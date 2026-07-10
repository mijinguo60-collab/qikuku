/**
 * 图片生成 Prompt 增强器
 * 把用户的简短描述 → 适合图片模型的优质 prompt
 */

export interface PromptOptions {
  purpose?: string;
  size?: string;
  style?: string;
  referenceText?: string;
}

const SIZE_HINTS: Record<string, string> = {
  '1024x1024': 'square 1:1 composition',
  '1024x1792': 'vertical 9:16 poster composition',
  '1792x1024': 'horizontal 16:9 banner composition',
  '768x1024': 'vertical 3:4 composition',
  '1024x768': 'horizontal 4:3 composition',
  '1024x2152': 'ultra-tall 1:2.16 mobile composition',
};

const STYLE_MODIFIERS: Record<string, string> = {
  '高级简约': 'minimalist, premium, clean, elegant, white space, sophisticated',
  '写实商业': 'photorealistic, commercial photography, professional lighting, sharp',
  '科技感': 'futuristic, tech, digital, cyber, glassmorphism, neon accents, clean UI',
  '国潮': 'Chinese traditional aesthetics, modern Chinese design, bold colors, cultural motifs',
  '奢华质感': 'luxurious, gold accents, marble, velvet, premium materials, soft glow',
  'Apple 极简': 'Apple style, minimal, pure white background, subtle shadows, premium product photography',
  '电商爆款': 'ecommerce, vibrant colors, attention-grabbing, clean product focus, marketplace optimized',
};

const PURPOSE_HINTS: Record<string, string> = {
  '电商主图': 'ecommerce main image, product centered, white background, professional',
  '海报': 'poster design, bold typography area, eye-catching, balanced composition',
  '探店封面': 'food exploration cover, warm lighting, inviting atmosphere, social media thumbnail',
  '朋友圈图': 'WeChat Moments friendly, natural, lifestyle feel, warm tones',
  '小红书封面': 'Xiaohongshu cover, aesthetic, trendy, soft colors, lifestyle photography',
  '公众号配图': 'WeChat official account image, editorial style, professional, clean',
  '企业宣传图': 'corporate promotional image, professional, trustworthy, modern office feel',
  '详情页': 'product detail page, clean layout, product focused, informative feel',
};

export function buildImagePrompt(userPrompt: string, opts: PromptOptions = {}): { prompt: string; finalPrompt: string } {
  const parts: string[] = [userPrompt];

  // Subject / purpose context
  if (opts.purpose && PURPOSE_HINTS[opts.purpose]) {
    parts.push(PURPOSE_HINTS[opts.purpose]);
  }

  // Composition by size
  if (opts.size && SIZE_HINTS[opts.size]) {
    parts.push(SIZE_HINTS[opts.size]);
  }

  // Style modifiers
  if (opts.style && STYLE_MODIFIERS[opts.style]) {
    parts.push(STYLE_MODIFIERS[opts.style]);
  }

  // Reference text context
  if (opts.referenceText) {
    parts.push(`Context: ${opts.referenceText}`);
  }

  // Quality / negative constraints
  parts.push('high quality, professional, no watermark, no distorted text, no templates');
  if (!userPrompt.includes('文字') && !userPrompt.includes('text') && !userPrompt.includes('字')) {
    parts.push('no text, no letters');
  }

  const finalPrompt = parts.join('. ');
  return { prompt: userPrompt, finalPrompt };
}
