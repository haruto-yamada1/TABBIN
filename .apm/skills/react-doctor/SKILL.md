---
name: react-doctor
description: React の変更後に問題を早期検出するために実行します。React project の code review、feature 完了、bug fix 時に使います。
version: 1.0.0
---

# React Doctor

React codebase を走査し、security、performance、correctness、architecture の問題を
検出します。0-100 の score と、対応可能な diagnostic を出力します。

## 使い方

```bash
npx -y react-doctor@latest . --verbose --diff
```

## ワークフロー

変更後に実行し、問題を早期に捕捉します。まず error を修正し、その後に再実行して
score が改善したことを確認します。
