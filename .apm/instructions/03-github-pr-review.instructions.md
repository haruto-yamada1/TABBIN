---
description: Open GitHub Pull Request のレビュー指摘を検証して対応するときの skill routing。
applyTo: "**/*"
---

# GitHub Pull Request review の処理

Open PR の未対応レビューを調査、修正、push、または返信する依頼では
`github-pr-review` skill を使ってください。投稿者が人間、CodeRabbit、その他の bot / service の
どれであっても、投稿者の権威ではなく latest PR HEAD、現在の型、schema、test、runtime path、
Issue / PR contract、repository rule を根拠に各指摘を検証します。

- 「レビュー対応」「address review」は live triage、妥当な修正、test、scoped commit、対象 PR
  branch への通常 push、同じ thread への証拠付き返信、対応済み thread の resolve までを許可します。
- 妥当な指摘は根本原因を修正し、回帰テストと必要な gate を実行して PR branch へ push した後、
  reviewer の種別にかかわらず同じ thread へ証拠を返信して resolve します。
- 妥当でない指摘では code を変更せず、技術的根拠を同じ thread へ返信して resolve します。
- read-only の「確認」「triage」、またはユーザーが「返信しない」「resolve しない」と明示した場合だけ、
  GitHub 上の返信と resolve を行いません。
- 再利用可能で検証済みの学びだけを永続化候補とし、型、schema、lint、architecture test、
  regression test、CI、hook、skill、APM instruction、docs の順で強い enforcement を優先します。
- merge、close、approve、force push、base branch への直接 push はしません。

PR がない、Closed / Merged、レビューがない、実装前の code review を依頼された、CI failure や
merge conflict だけを扱う場合は、この skill を使いません。
