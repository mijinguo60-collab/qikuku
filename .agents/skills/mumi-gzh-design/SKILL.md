---
name: mumi-gzh-design
description: 将 Mumi聊Ai 的公众号 Markdown 排成可粘贴的内联 HTML，默认采用教程类“摸鱼绿”信息层级，并在封面、分隔、提示和结尾适量加入企鹅 IP 占位图；适用于公众号，不用于普通网页。
---

# Mumi 公众号排版

这是公众号正文片段，不输出 `html/head/body/style/script/div` 外壳。所有样式内联，文字节点使用 `<span leaf="">` 包裹，图片位置使用 `<!-- IMG:文件名 -->`，没有真实 URL 时绝不编造。

## 排版流程

1. 读取 Markdown 并识别标题、引言、步骤、提示、代码/提示词、图片、表格和结尾。
2. 教程、工具盘点和实测默认使用“摸鱼绿”语法：白底、绿色标题锚点、浅绿提示块、紧凑代码块。
3. 只在三个地方放企鹅：开头封面占位、章节分隔或提示块旁、结尾 CTA。信息密集段落不放大图，避免装饰压过内容。
4. 每段标记 1–3 个核心短语，锚点强调全文不超过 5 次；提示词、命令和参数放代码块。
5. 检查全角标点；代码、URL 和标识符保留原样。公众号正文中不使用外部 CSS、脚本、class、id、定位和 grid。
6. 运行 `scripts/validate_mumi_gzh.py`。ERROR 和 WARNING 都必须为 0；失败就修复后重跑。

## 企鹅占位语法

```html
<!-- IMG:penguin-cover.png -->
<!-- IMG:penguin-divider.png -->
<!-- IMG:penguin-tip.png -->
```

它们是素材清单，不是 URL。交付时同时列出每个占位对应的表情/动作和尺寸建议。

## 最小模板

```html
<section style="margin:0 auto;padding:0 16px;color:#1f2937;font-size:16px;line-height:1.8;">
  <p style="margin:0 0 16px;text-align:center;"><span leaf=""><!-- IMG:penguin-cover.png --></span></p>
  <p style="margin:0 0 16px;"><span leaf="">这里放引言和实测结论。</span></p>
  <p style="margin:24px 0 12px;border-left:4px solid #059669;padding-left:10px;"><span leaf="">01｜先做什么</span></p>
  <p style="margin:0 0 16px;"><span leaf="">这里放步骤说明，关键词用绿色下划线标记。</span></p>
  <p style="margin:24px 0;text-align:center;"><span leaf=""><!-- IMG:penguin-divider.png --></span></p>
</section>
```

实际生成时优先参考本仓库的组件规则和校验脚本，不能把此最小模板机械套在每篇文章上。
