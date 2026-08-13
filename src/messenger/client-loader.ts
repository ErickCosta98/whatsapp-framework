import { createRequire } from "module";

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
  sendMessage(
    message: string | any,
    threadID: string,
    replyToMessage?: string,
    callback?: any,
  ): Promise<any>;
  sendTypingIndicator(sendTyping: boolean, threadID: string, callback?: any): Promise<void>;
  stopListening?(): void;
}

export async function loadMessengerClient(): Promise<{
  login: (
    credentials: MessengerLoginCredentials,
    options?: MessengerLoginOptions | any,
    callback?: any,
  ) => Promise<MessengerAPI | void>;
}> {
  try {
    const require = createRequire(import.meta.url);
    const nkxfca = require("@neoaz07/nkxfca");

    // nkxfca's login() crashes with "'logging' in undefined" when options is
    // omitted, so guarantee a default options object at the integration seam.
    const login = async (
      credentials: MessengerLoginCredentials,
      options?: MessengerLoginOptions | any,
      callback?: any,
    ): Promise<MessengerAPI | void> => {
      const safeOptions = options ?? {};
      if (typeof callback === "function") {
        return nkxfca.login(credentials, safeOptions, callback);
      }
      return nkxfca.login(credentials, safeOptions);
    };

    return { login };
  } catch {
    throw new Error(
      "Missing optional peer dependency @neoaz07/nkxfca. Install it to use Messenger support.",
    );
  }
}
