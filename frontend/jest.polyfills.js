/**
 * Runs in Jest setupFiles (before test modules load). react-router v7 pulls in
 * code that expects TextEncoder/TextDecoder; jsdom does not define them.
 */
const { TextEncoder, TextDecoder } = require("util");

if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder;
}
