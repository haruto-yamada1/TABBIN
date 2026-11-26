const aiChatComposerMessages = {
  en: {
    'aiChat.send': 'Send',
    'aiChat.sending': 'Sending...',
    'aiChat.liveErrorOccurred': 'An error occurred in AI chat',
    'aiChat.liveResponseCompleted': 'AI response completed',
    'aiChat.submitHint': 'Enter to send · Shift+Enter for a new line',
    'aiChat.openAiSettings': 'Open AI settings',
    'aiChat.setupDescription':
      'AI chat uses Ollama running on your computer. Set it up with these steps:',
    'aiChat.setupStepInstall': 'Install Ollama from ollama.com and start it',
    'aiChat.setupStepModel':
      'Download a model (for example: ollama pull qwen3.5:2b)',
    'aiChat.setupStepStart':
      'If the connection is blocked, restart Ollama with OLLAMA_ORIGINS set to allow this extension',
    'aiChat.setupStepSelect':
      'Fetch and select the model in the selector below — no need to reopen the chat',
  },
  ja: {
    'aiChat.send': '送信',
    'aiChat.sending': '送信中...',
    'aiChat.liveErrorOccurred': 'AIチャットでエラーが発生しました',
    'aiChat.liveResponseCompleted': 'AIの応答が完了しました',
    'aiChat.submitHint': 'Enterで送信 · Shift+Enterで改行',
    'aiChat.openAiSettings': 'AI設定を開く',
    'aiChat.setupDescription':
      'AIチャットはお使いのコンピューターで動作する Ollama を使います。次の手順でセットアップしてください:',
    'aiChat.setupStepInstall':
      'ollama.com から Ollama をインストールして起動する',
    'aiChat.setupStepModel':
      'モデルをダウンロードする（例: ollama pull qwen3.5:2b）',
    'aiChat.setupStepStart':
      '接続が拒否される場合は、OLLAMA_ORIGINS でこの拡張機能を許可して Ollama を再起動する',
    'aiChat.setupStepSelect':
      '下のモデル選択でモデルを取得して選ぶ（チャットを開き直す必要はありません）',
  },
} as const

export { aiChatComposerMessages }
