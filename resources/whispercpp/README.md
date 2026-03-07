# whisper.cpp Runtime Assets

This directory is reserved for packaged local-streaming runtime assets.

Expected layout for PR-6:

```text
resources/whispercpp/
  bin/
    macos-arm64/
      whisper-stream
```

Notes:
- The runtime binary is copied with `electron-builder.extraResources` so it stays outside the ASAR and remains spawnable.
- Large ggml/Core ML model assets are not bundled here by default.
- Models are managed under the app data directory at runtime:
  `.../whispercpp/models/<model>.bin`
  `.../whispercpp/models/<model>-encoder.mlmodelc`
- The packaged binary is expected to implement the app-owned `speech-to-text-jsonl-v1` stdin/stdout protocol:
  - stdin: `push_audio_batch` and `stop` JSONL messages
  - stdout: `ready`, `final_segment`, and `error` JSONL messages only
  - stderr: wrapper logs and diagnostics
