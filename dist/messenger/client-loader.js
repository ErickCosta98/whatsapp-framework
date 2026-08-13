import { createRequire } from "module";
export async function loadMessengerClient() {
    try {
        const require = createRequire(import.meta.url);
        const nkxfca = require("@neoaz07/nkxfca");
        // nkxfca's login() crashes with "'logging' in undefined" when options is
        // omitted, so guarantee a default options object at the integration seam.
        const login = async (credentials, options, callback) => {
            const safeOptions = options ?? {};
            if (typeof callback === "function") {
                return nkxfca.login(credentials, safeOptions, callback);
            }
            return nkxfca.login(credentials, safeOptions);
        };
        return { login };
    }
    catch {
        throw new Error("Missing optional peer dependency @neoaz07/nkxfca. Install it to use Messenger support.");
    }
}
//# sourceMappingURL=client-loader.js.map