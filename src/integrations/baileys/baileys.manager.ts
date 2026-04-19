import {
  BaileysConnectionState,
  ManagedBaileysConnection,
} from "./baileys.types";

class BaileysManager {
  private readonly connections = new Map<string, ManagedBaileysConnection>();
  private readonly qrCodes = new Map<string, string>();

  public get(channelAccountId: string): ManagedBaileysConnection | undefined {
    return this.connections.get(channelAccountId);
  }

  public has(channelAccountId: string): boolean {
    return this.connections.has(channelAccountId);
  }

  public set(connection: ManagedBaileysConnection): void {
    this.connections.set(connection.channelAccountId, connection);
  }

  public remove(channelAccountId: string): void {
    this.connections.delete(channelAccountId);
    this.qrCodes.delete(channelAccountId);
  }

  public updateState(
    channelAccountId: string,
    updater: (state: BaileysConnectionState) => BaileysConnectionState
  ): BaileysConnectionState | null {
    const connection = this.connections.get(channelAccountId);
    if (!connection) {
      return null;
    }

    connection.state = updater(connection.state);
    this.connections.set(channelAccountId, connection);
    return connection.state;
  }

  public getState(channelAccountId: string): BaileysConnectionState | null {
    return this.connections.get(channelAccountId)?.state ?? null;
  }

  public setQr(channelAccountId: string, qr: string): void {
    this.qrCodes.set(channelAccountId, qr);
  }

  public clearQr(channelAccountId: string): void {
    this.qrCodes.delete(channelAccountId);
  }

  public getQr(channelAccountId: string): string | null {
    return this.qrCodes.get(channelAccountId) ?? null;
  }
}

export const baileysManager = new BaileysManager();
