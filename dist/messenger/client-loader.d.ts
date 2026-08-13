export interface MessengerLoginCredentials {
    appState?: any;
    email?: string;
    password?: string;
}
export interface MessengerLoginOptions {
    online?: boolean;
    selfListen?: boolean;
    listenEvents?: boolean;
    autoMarkDelivery?: boolean;
    autoMarkRead?: boolean;
    listenTyping?: boolean;
    autoReconnect?: boolean;
    simulateTyping?: boolean;
    [key: string]: any;
}
export interface MessengerAPI {
    getCurrentUserID(): string;
    listenMqtt(callback: (err: any, event: any) => void): void;
    sendMessage(message: string | any, threadID: string, replyToMessage?: string, callback?: any): Promise<any>;
    sendTypingIndicator(sendTyping: boolean, threadID: string, callback?: any): Promise<void>;
    stopListening?(): void;
}
export declare function loadMessengerClient(): Promise<{
    login: (credentials: MessengerLoginCredentials, options?: MessengerLoginOptions | any, callback?: any) => Promise<MessengerAPI | void>;
}>;
//# sourceMappingURL=client-loader.d.ts.map