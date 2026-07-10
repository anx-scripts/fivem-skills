import { homedir } from "node:os";
import { join } from "node:path";

export const VERSION = "0.1.0";

/** Katalog domowy narzędzia — tu trafiają dane i konfiguracja. */
export const ROOT_DIR = join(homedir(), ".fivem-skills");
export const DATA_DIR = join(ROOT_DIR, "data");
export const SOURCES_FILE = join(ROOT_DIR, "sources.json");
