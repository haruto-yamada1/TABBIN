---
name: shell
description: /shell リクエストの残りを literal な shell コマンドとして実行します。ユーザーが明示的に /shell を呼び出し、その後のテキストを terminal で直接実行したいときだけ使います。
disable-model-invocation: true
---
# shell コマンドの実行

ユーザーが明示的に `/shell` を呼び出したときだけ、この skill を使います。

## 動作

1. `/shell` 呼び出し以降のユーザー入力をすべて、実行する literal な shell コマンドとして扱います。
2. そのコマンドを terminal tool で即座に実行します。
3. 実行前にコマンドを書き換え、説明、または「改善」しません。
4. コマンド自体が repository context を必要としない限り、先に repository を調査しません。
5. ユーザーが `/shell` だけを呼び出し、続くテキストがない場合は、実行するコマンドを尋ねます。

## 応答

- 先にコマンドを実行します。
- その後、exit status と重要な stdout または stderr を簡潔に報告します。
