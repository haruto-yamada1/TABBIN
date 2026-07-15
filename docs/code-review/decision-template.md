---
id: PRR-YYYY-NNN
status: adopted
category: architecture
severity: high
source_pr: null
source_comment_url: ''
source_author_type: null
scope: []
occurrences: 1
enforcement: []
created_at: YYYY-MM-DD
last_reviewed_at: YYYY-MM-DD
superseded_by: null
---

# 概要

検証済みの問題または判断を記載します。

## Review の指摘

投稿者やサービスの表現へ依存せず、技術的な指摘を短く要約します。

## 判定

`adopt`、`partially-adopt`、`reject-false-positive`、`reject-context-mismatch`、
`reject-already-enforced`、`reject-preference-only`、`reject-speculative`、`already-fixed`、
`duplicate`、`defer` の判断と理由を記載します。

## 根拠

latest PR HEAD の code、型、schema、test、runtime path、仕様、実行 command を記載します。

## 一般化したルール

同じ根本原因へ適用できる条件を記載します。

## 今回の対応

code 修正、test、commit、push、thread reply の実施内容を記載します。

## 再発防止

型、schema、lint、architecture rule、test、CI、hook、skill、APM、docs のうち、採用した
最も強い enforcement と理由を記載します。

## 適用しないケース

この判断を適用すべきでない条件を記載します。

## 再評価条件

設計変更、dependency update、browser / API contract 変更などの再評価条件を記載します。
