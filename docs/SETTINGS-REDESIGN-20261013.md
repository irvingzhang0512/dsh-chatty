# 配置改版 v6 技术契约

用户已明确要求实施完整方案，目标 0.2.0-rc.2+chatty.2，配置仍为官方 26＋增强 74，字段名／所有者／默认和在途任务快照不变。目录缓存不参与配置优先级，不引入第三方运行时依赖。

## 展示与保存

settings 响应各 fields 附加 presentation：中文 label、help、分组、单位与高级标记。Chatty 增强只保存 chatty，官方分区分别提交 speech/api/sensevoice 并逐项显示结果；任何刷新不得清除另一所有者草稿或偷推进其 revision。成功只刷新该所有者，失败保留其待保存项。重置沿用 unset；弃稿／重载明确确认后只作用当前分区。

## 目录接口

POST /dsh-chatty/models/catalog：purpose=stt|tts|llm、provider、sessionId、refresh（默认 false）；可传该供应商白名单草稿 model/model_id/base_url/credential/key_env，LLM 自定义端点同理。只允许引用名，不接受密钥或网页 URL。响应 catalog 包含 models[{id,label,status,reason}]、sources、updatedAt、warning、voices（TTS）及 llmProviders；状态 compatible/unverified/incompatible。非刷新只读缓存与供应商元数据，不调用可能联网的 listModels；手动刷新可取消，超时和响应体有界。固定官方网页仅用于目录，不能改变端点、凭据或资源 ID。

火山正文使用官方 getDocDetail（LibraryCode=ark、DocumentCode=agent-plan-personal-voice-model），校验正文结构后只取支持模型的用途段落，默认 ASR 产品 ID 映射由原适配器完成。硅基官方语音 API HTML 只提取 model 字段的枚举，排除 voice／示例；模型 API 用对应类型筛选／与文档交叉分类，不能把 audio 全集当 TTS。LLM 通过 llm.listProviders/listModels/listConfigurableProviders/discoverModels；自定义兼容 URL 使用 /models。适配能力单列，不将新型号当作已经实测。

缓存为 DSH_HOME/chatty/model-catalog 下按 purpose/provider/端点/引用名指纹分文件保存，原子写入；不保存凭据、网页正文或音频。刷新失败保留旧缓存与内置目录；失效选择仍显示。请求与卸载取消，刷新不跑推理、试听或自动切换模型。

## 凭据文件

GET /dsh-chatty/credentials/file：返回存在性／可打开状态／原因；POST 同路径触发打开，不接受路径参数。宿主从公开 configEditor 配置条目取得实际 credentials-local 组装与覆盖配置，经该包 resolveSpec 确定路径；入口懒加载 dsh-native-command.openNativeTextFile，缺能力只禁用此动作，不影响插件其余功能。固定目标必须存在且是文件，不读取正文，不创建文件或修改权限。

现有凭据状态响应补齐 writable；管理凭据保存后仅刷新凭据状态。新增精确 optional peers 为 dsh-native-command 与 dsh-credentials-local 0.2.0-rc.2，宿主入口才允许引用；不是浏览器依赖。

## 验收与交付

对应 SPEC F017–F019；全字段、草稿并发与分区保存、网页解析、缓存与取消、凭据打开，均需离线和目标 Desktop 验证。原生主题／宽窄／问号、目录刷新与凭据文件打开单列证据，真实云端与日常升级不由本次实现自动推导通过。独立提交与主仓库候选同步，不改变原日常安装提交或历史核心锁。

音色目录刷新使用硅基适配器 listVoices({signal,strict:true})：HTTP／结构失败上抛，由目录层保留上一有效音色并显示原因；普通已有调用的静态兜底行为保持。成功合并系统音色与自定义音色。
