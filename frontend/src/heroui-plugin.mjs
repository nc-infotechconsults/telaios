// Shim so Tailwind v4 @plugin can load the heroui theme plugin.
// @heroui/theme exports `heroui` as a named export; @plugin needs a default.
import { heroui } from "@heroui/theme";
export default heroui;
