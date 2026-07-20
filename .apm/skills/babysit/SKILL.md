---
name: babysit
disable-model-invocation: true
description: PR コメントの triage、明確な conflict 解消、CI 修正をループで行い、merge-ready 状態を維持するときに使います。
---
# PR babysit

この PR を merge-ready 状態にすることが目的です。

PR の status、コメント、最新 CI を確認し、merge 可能になるまで issue を解消します。

1. **Comments**: 対応前にすべてのコメント（Bugbot を含む）を確認します。同意できるコメントだけ修正し、不同意または不明な場合は理由を説明します。
2. **Merge conflicts**: conflict がある場合は base branch と同期します。意図が明確に同じ場合のみ merge conflict を解消し、そうでなければ停止して確認を求めます。
3. **CI**: 発生した CI issue は小さく scope を絞って修正します。push 後、mergeable + green + コメント triage 完了まで CI を再確認します。
