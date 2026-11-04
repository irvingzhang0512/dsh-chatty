# Design

文档版：v1（2026-11-04）。实现状态：待实现；具体文档确认：待确认。

## Context

范围和现行依据见 [proposal](proposal.md)。本设计仅记录目标差异；实施与验证独立登记。

## Goals / Non-Goals

保持既有能力，交付可核验的新宿主组合；不包含新业务功能、恢复 Web 或发布 npm／Release／市场投稿。

## Decisions

### 领域实现契约

更新 compatibility.json 和实际宿主 peers，维持零运行时依赖及现有包名／loader 身份；读取 native-settings 中实际生效值时使用 effectiveConfig，覆盖与迁移检查区分原始值。已有 sessionProjection.snapshot(session,["modelSelection"]) 读取接口保留；检查官方语音 UI 注入与热卸载。密钥只在宿主解析，不进入浏览器、报告或公开规格。

### 固定运行环境

本插件完整版本 0.2.2-rc.1+rev.1，宿主 0.2.2-rc.1；按目标 Desktop 实包锁定官方 SDK，Cordis／Schemastery／Loader 采用实包精确版本。完整字符串、源码 SHA、运行资源散列共同核验，保留原 patch 条目、客户端身份及业务接口。工具主要使用 register，原生调用实测后才登记可用，不无依据重写工具框架。

### 配置、存储和恢复

原始覆盖通过 configEditor.configuration()/edit() 读写，生效值读取 effectiveConfig 并检查生命周期；默认／表达式／继承值不整份写入覆盖层。取消不写入，CAS 冲突拒绝，未挂载所有者明确反馈。旧有效字段及完整引用保留，确有失效字段须证明并定向处理；没有迁移需求则保持原文件。备份和安装事务由维护入口负责，日常旧资料只读核验，隔离副本执行业务写入。官方 schedule v2 与新会话事件不可据此承诺旧宿主可读；恢复须核验配套数据，后续业务有变化则保护双方内容并停止自动降级。

## Risks / Trade-offs

精确声明不能代替实际接口、配置或运行验证；依赖不兼容、来源漂移或无法无损恢复时保留原环境并报告具体阻碍。

## Migration Plan

取得本版具体确认后按 [tasks](tasks.md) 实施，技术说明随实现同步；旧证据不改写为新组合通过。
