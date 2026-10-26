import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./auth.schema";

/**
 * Per-user UI preferences, one row per user.
 *
 *   - `uiTheme`:   "default" | "gmail" | "outlook" — which mail client the
 *                  inbox emulates. Null means "use the default".
 *   - `colorMode`: "light" | "dark" | "system".
 *   - `density`:   "comfortable" | "compact".
 *
 * Kept as plain text columns rather than enums so a new value is a frontend
 * change; the router validates the allowed set.
 */
export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  uiTheme: text("ui_theme"),
  colorMode: text("color_mode"),
  density: text("density"),
  updatedAt: integer("updated_at").notNull(),
});
