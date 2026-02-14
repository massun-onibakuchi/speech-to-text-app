import { clipboard } from 'electron'

export class ClipboardClient {
  readText(): string {
    return clipboard.readText()
  }

  writeText(text: string): void {
    clipboard.writeText(text)
  }
}
