# Proposal

文档版：v1（2026-11-04）。实现状态：待实现；具体文档确认：待确认。

## Why

@irvingzhang0512/dsh-chatty当前版本0.2.1-rc.3+rev.1精确绑定rc3；目标Desktop升级到0.2.1-rc.5，需要在真实目标SDK及原生运行时完成兼容验证。

## What Changes

- 目标版本0.2.1-rc.5+rev.1，官方peer和engines依据目标包精确核对；完整运行产物随固定Git提交分发。
- 本库重点：官方语音Bundle和四子包均为rc.5；manifest、compatibility与实际挂载一致，缺包或跨基线拒绝；保留转写、朗读和不自动发送的边界。
- 按实际声明更新ws至8.22.1、tsdown至0.23.5；React／类型与真实宿主对齐，其他大版本不迁移。
- 保留本库业务接口、配置、引用与存储；只完成目标组合适配，不实现其他待确认change。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- chatty-delivery-boundaries：为F016/F021补充rc5精确交付与目标运行验收，不重写历史证据。

## Impact

本库package／锁、运行兼容接缝、完整lib及实际受影响说明。根协调最终组合与安装，本库不自行改用户profile。 当前行为和旧编号来源见[迁移表](../../MIGRATION.md)，实际技术入口见[README](../../../README.md)及[实现](../../../compatibility.json)。
