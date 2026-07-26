# Code Review Decisions

GitHub Pull Request の review から得た、検証済みで再利用可能な判断を管理します。reviewer は
人間、CodeRabbit、その他の bot / service のいずれでも構いません。

- [index.md](./index.md): 判断記録の検索用一覧
- [decision-template.md](./decision-template.md): 新規記録の template
- `decisions/`: `PRR-YYYY-NNN-short-description.md` 形式の判断記録

新規記録を作る前に index と repository 全体を検索し、同じ根本原因があれば既存記録を更新します。
型、schema、lint、architecture rule、test、CI などで機械的に防止できる場合は、docs より先に
その enforcement を実装してください。
