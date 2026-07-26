---
description: Open GitHub Pull Request のレビュー指摘を検証して対応するときの skill routing。
applyTo: "**/*"
---

# GitHub Pull Request review の routing

Open PR の未対応レビューを調査、修正、push、または返信する依頼では
`$github-pr-review` Skill を使ってください。PR がない / Closed・Merged / レビューがない /
実装前 review / CI failure・merge conflict 単独のときはこの Skill を使いません。

レビュー指摘の検証、修正、返信、resolve の詳細は Skill 本体に記載されています。
