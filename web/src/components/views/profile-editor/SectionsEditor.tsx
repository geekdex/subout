/**
 * Backwards-compatible barrel for the visual config editor panels.
 * Each tab now lives in its own module; import from the individual files
 * when adding new call sites.
 */
export { RouteTabPanel } from "./RouteTabPanel";
export { DnsTabPanel } from "./DnsTabPanel";
export { InboundsTabPanel } from "./InboundsTabPanel";
export { OutboundsTabPanel } from "./OutboundsTabPanel";
export { BasicDirectTabPanel } from "./BasicDirectTabPanel";
