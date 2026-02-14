import './styles.css'

const app = document.querySelector<HTMLDivElement>('#app')

const render = async (): Promise<void> => {
  if (!app) {
    return
  }

  const [pong, settings] = await Promise.all([window.speechToTextApi.ping(), window.speechToTextApi.getSettings()])
  app.innerHTML = `
    <main class="shell">
      <h1>Speech-to-Text v1</h1>
      <p>IPC health: ${pong}</p>
      <p>STT: ${settings.transcription.provider} / ${settings.transcription.model}</p>
    </main>
  `
}

void render()
