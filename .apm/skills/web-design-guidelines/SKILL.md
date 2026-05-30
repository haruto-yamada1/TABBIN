---
name: web-design-guidelines
description: Web Interface Guidelines 準拠の UI コードレビュー。「review my UI」「check accessibility」「audit design」「review UX」「check my site against best practices」と依頼されたときに使います。
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines レビュー

Web Interface Guidelines 準拠でファイルをレビューします。

## 動作

1. 下記 source URL から最新ガイドラインを取得
2. 指定ファイルを読む（未指定ならユーザーに files/pattern を確認）
3. 取得したガイドラインの全ルールでチェック
4. 簡潔な `file:line` 形式で findings を出力

## ガイドライン source

レビューのたびに最新版を取得:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

WebFetch で最新ルールを取得する。取得内容にルールと出力形式の指示が含まれる。

## 使い方

ユーザーが file または pattern を指定した場合:
1. 上記 source URL からガイドラインを取得
2. 指定ファイルを読む
3. 取得したガイドラインの全ルールを適用
4. ガイドラインで指定された形式で findings を出力

files 未指定なら、レビュー対象ファイルをユーザーに確認する。
