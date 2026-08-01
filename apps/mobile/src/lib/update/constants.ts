import { version } from "../../../package.json";

// App version — mirrors package.json so it only needs updating in one place.
// Applies to EAS and dev builds alike since it's read at bundle time.
export const APP_VERSION = version;
