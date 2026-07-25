---
title: Vault2077 OPC 页面设计方案
aliases:
  - OPC 页面方案
type: supporting-plan
status: superseded
updated: 2026-07-25
superseded-by: Vault2077-OPC-Design-Spec.md
version: "0.2"
date: 2026-07-23
scope: OPC website section only
---

# Vault2077 OPC 页面设计方案（已取代）

本提案已被 [OPC 设计规格](Vault2077-OPC-Design-Spec.md) 完整取代，不再保留可能与现行实现混淆的旧页面结构和旧路由细节。

历史提案曾建议为基础设施和专项服务建立独立详情页。该建议已经明确废止：当前权威设计要求所有具体服务在 `/opc` 工作台内展开，稳定 slug 只写入查询参数以恢复选中状态；桌面端和移动端共用同一信息结构，移动端仅改变排列方式。

当前 OPC 产品行为、版式、反色块边界、服务字段和路由均以 [OPC 设计规格](Vault2077-OPC-Design-Spec.md) 为准；后台编辑与发布方式见 [OPC 服务目录后台操作手册](Vault2077-OPC-Admin-Manual.md)。
