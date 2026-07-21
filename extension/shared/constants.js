// ============================================================
// constants.js — Shared constants and settings for the extension
// ============================================================

var BACKEND_URL = "http://127.0.0.1:8000";

// Extension panel window dimensions (pixels)
var POPUP_WIDTH = 400;
var POPUP_HEIGHT = 520;

// Supplier name cleaning regex rules
var SUPPLIER_CLEAN_RULES = [
  [/["']/g, ''],    // strip quotes entirely
  [/PTY LIMITED/gi, 'P/L'],
  [/PTY LTD\.(?!pdf|docx?|xlsx?|txt|jpe?g|png)/gi, 'P/L'], // PTY LTD. not before an extension
  [/PTY LTD/gi, 'P/L'],
  [/The trustee of\s+/gi, 'TOF '],
  [/The trustee for\s+/gi, 'TOF '],
  [/[\/\\?%*:|<>]/g, '-'],   // illegal filesystem chars → dash
  [/\.+$/, ''],    // Windows: no trailing periods
];
