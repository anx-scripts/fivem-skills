import { homedir } from "node:os";
import { join } from "node:path";

export const VERSION = "0.4.2";

/** Tool home directory — downloaded data lives here. */
export const ROOT_DIR = join(homedir(), ".fivem-skills");
export const DATA_DIR = join(ROOT_DIR, "data");
