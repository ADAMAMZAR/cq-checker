export function formatCitationLinks(text: string): string {
  if (!text) return "";
  let cleanText = text
    .replace(/\$\\rightarrow\$/g, "→")
    .replace(/\\rightarrow/g, "→")
    .replace(/\$\\Rightarrow\$/g, "⇒")
    .replace(/\\Rightarrow/g, "⇒");

  // Auto-number multi-line procedures if the model omitted "1. ", "2. " prefixes
  if (!/^\s*\d+\.\s+/m.test(cleanText)) {
    const rawLines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (
      rawLines.length >= 3 &&
      rawLines.every((l) => !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("*"))
    ) {
      cleanText = rawLines.map((line, idx) => `${idx + 1}. ${line}`).join("\n");
    }
  }

  return cleanText.replace(/\[(\d+(?:[\s,–-]+\d+)*)\]/g, (match, p1) => {
    if (p1.includes("-") || p1.includes("–")) {
      const parts = p1.split(/[-–]/).map((s: string) => parseInt(s.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const nums = [];
        for (let i = parts[0]; i <= parts[1]; i++) nums.push(i);
        return nums.map((n) => `[${n}](#cite-${n})`).join(" ");
      }
    }
    const nums = p1.split(",").map((s: string) => s.trim()).filter((s: string) => /^\d+$/.test(s));
    if (nums.length > 0) {
      return nums.map((n: string) => `[${n}](#cite-${n})`).join(" ");
    }
    return match;
  });
}

export function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
