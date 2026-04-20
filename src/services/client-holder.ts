let _client: any = null

export function setGlobalClient(client: any): void {
  _client = client
}

export function getGlobalClient(): any {
  return _client
}
