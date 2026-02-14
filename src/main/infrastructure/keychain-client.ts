import { execFileSync } from 'node:child_process'

export class KeychainClient {
  setPassword(service: string, account: string, password: string): void {
    execFileSync('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', password], {
      stdio: 'ignore'
    })
  }

  getPassword(service: string, account: string): string | null {
    try {
      const value = execFileSync('security', ['find-generic-password', '-s', service, '-a', account, '-w'], {
        encoding: 'utf8'
      })
      return value.trim()
    } catch {
      return null
    }
  }
}
