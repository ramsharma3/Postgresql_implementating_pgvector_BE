import { AsyncLocalStorage } from 'async_hooks';

export class DatabaseContext {
  private static readonly storage = new AsyncLocalStorage<string>();

  static run<T>(networkId: string, fn: () => T): T {
    return this.storage.run(networkId, fn);
  }

  static getNetworkId(): string {
    return this.storage.getStore() || 'default';
  }
}
