"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baileysManager = void 0;
class BaileysManager {
    constructor() {
        this.connections = new Map();
        this.qrCodes = new Map();
    }
    get(channelAccountId) {
        return this.connections.get(channelAccountId);
    }
    has(channelAccountId) {
        return this.connections.has(channelAccountId);
    }
    set(connection) {
        this.connections.set(connection.channelAccountId, connection);
    }
    remove(channelAccountId) {
        this.connections.delete(channelAccountId);
        this.qrCodes.delete(channelAccountId);
    }
    updateState(channelAccountId, updater) {
        const connection = this.connections.get(channelAccountId);
        if (!connection) {
            return null;
        }
        connection.state = updater(connection.state);
        this.connections.set(channelAccountId, connection);
        return connection.state;
    }
    getState(channelAccountId) {
        return this.connections.get(channelAccountId)?.state ?? null;
    }
    setQr(channelAccountId, qr) {
        this.qrCodes.set(channelAccountId, qr);
    }
    clearQr(channelAccountId) {
        this.qrCodes.delete(channelAccountId);
    }
    getQr(channelAccountId) {
        return this.qrCodes.get(channelAccountId) ?? null;
    }
}
exports.baileysManager = new BaileysManager();
