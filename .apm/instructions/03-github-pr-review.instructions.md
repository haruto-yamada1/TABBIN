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
  branch への通常 push までを許可しますが、返信は含みません。
- 妥当な指摘は根本原因を修正し、回帰テストと必要な gate を実行してから PR branch へ push します。
- 妥当でない指摘では code を変更しません。
- 同じ thread への証拠付き返信は、ユーザーが返信を明示的に依頼した場合だけ行います。
- 再利用可能で検証済みの学びだけを永続化候補とし、型、schema、lint、architecture test、
  regression test、CI、hook、skill、APM instruction、docs の順で強い enforcement を優先します。
- merge、close、approve、force push、base branch への直接 push、thread resolve はしません。

PR がない、Closed / Merged、レビューがない、実装前の code review を依頼された、CI failure や
merge conflict だけを扱う場合は、この skill を使いません。
