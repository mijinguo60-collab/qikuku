# 语音与视频项目评估表

核验日期：2026-10-04。以下是“适合先做小规模本地验证”的方向，不是商用许可意见；下载前重新看代码、模型权重、依赖和数据许可。

| 项目 | 适合做什么 | 许可/风险提示 | Mumi 建议 |
| --- | --- | --- | --- |
| [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) | 中文少样本 TTS 和音色实验，支持短参考音频 | 仓库 MIT；训练数据、参考声音和模型权重仍需单独确认 | 适合先做企鹅固定声线原型 |
| [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) | 中文多语种 TTS、声音克隆和情绪控制 | 以官方仓库及模型卡为准，避免把社区镜像当授权来源 | 适合第二阶段评估自然度 |
| [IndexTTS](https://github.com/index-tts/index-tts) | 中文零样本 TTS、情绪/速度/发音控制 | 代码、模型和数据条款需分开看，不能只看仓库页面 | 适合需要可控口播节奏时测试 |
| [Fish Speech](https://github.com/fishaudio/fish-speech) | 表达力强的多语言 TTS | 当前 Fish Audio Research License 对商业用途要求单独书面许可 | 个人商业账号暂不作为默认方案 |
| [MuseTalk](https://github.com/TMElyralab/MuseTalk) | 音频驱动人脸口型 | 代码 MIT，但依赖和权重仍需逐项核验；默认面向脸部区域 | 只在单只企鹅近景实验，不作为第一版主链路 |
| [LivePortrait](https://github.com/KlingAIResearch/LivePortrait) | 静态角色驱动头部/表情 | 代码 MIT；README 明确提示 InsightFace 检测模型有非商业研究限制 | 可做动作测试，商用前必须替换受限检测模型 |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | 拼接、裁切、混音、字幕、转码 | 代码主要 LGPL，也含 GPL 可选组件，构建时确认配置 | 作为稳定的后期装配工具 |

## 建议结论

第一版不要从“全自动三企鹅口型视频”开始。先用一只中企鹅做讲解卡面，配固定声线、屏幕录制和字幕；把动作限制在点头、侧看、举牌、翅膀指向。稳定后再测试 MuseTalk 或 LivePortrait。这样更容易保持 IP 形象，也能先验证内容而不是把时间耗在模型调参上。

## 许可证清单

- `Punk-Skill v1.0.0-mit` 只作为视觉方法参考；当前 v2 有商业授权限制，本包没有复制其源码或提示词。
- `gzh-design-skill` 当前仓库是 AGPL-3.0，本包只总结工作流和约束，没有复制它的组件库、脚本或 HTML。
- `khazix-skills` 与 `stop-slop` 的公开仓库标示 MIT；本包只保留适合 Mumi 的方法，并删除原作者口癖和品牌人设。
- `awesome-claude-skills` 是索引/示例集合，单项 skill 许可可能不同；本包不直接打包其源码。
