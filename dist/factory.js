import { WhatsAppEngine } from "./engine.js";
import { MessengerEngine } from "./messenger/engine.js";
export function createEngine(platform, config) {
    if (platform === "whatsapp") {
        return new WhatsAppEngine(config);
    }
    if (platform === "messenger") {
        return new MessengerEngine(config);
    }
    throw new Error(`Unsupported platform: ${platform}`);
}
//# sourceMappingURL=factory.js.map