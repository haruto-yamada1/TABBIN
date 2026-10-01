# infrastructure 層

saved-tabs の IndexedDB、Chrome Storage の設定、browser API への接続を担当します。
依存方向は [DDD ガイド](../../../../docs/architecture/ddd.md) を参照してください。

| サブディレクトリ              | 役割                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `persistence/indexed-db/`     | ドメインデータの snapshot reader、Unit of Work、Backup V2 replacement、recovery snapshot と schema upgrade |
| `persistence/chrome-storage/` | `userSettings` の repository と settings 専用 port/key                                                     |
| `browser/`                    | tabs/windows/runtime、設定変更通知、ドメイン変更通知、Web Locks の adapter                                 |
| `composition/`                | IndexedDB の起動と操作ゲート、native saved-tabs use-case と presentation port の構築                       |

通常のドメイン操作は IndexedDB だけを使います。端末内の旧 Chrome Storage
ドメインデータの reader、repository、migration、router は Issue #861 で撤去しました。
DB schema upgrade と record decoding / integrity 検査は維持します。

domain は repository interface、application は port を参照し、infrastructure が
実装します。presentation への逆依存や Chrome API 型の domain への漏洩は禁止です。
