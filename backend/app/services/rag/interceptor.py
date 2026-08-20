import re
from typing import Optional

SYSTEM_PROMPT = (
    "Role: Support Assistant for Vendor Onboarding and Ariba queries. Guidance strictly from sources.\n\n"
    "1. Search Order Hierarchy & Versioning:\n"
    "   - Target 1 (FAQ): Priority match. Target 2 (Flowchart): Use if absent from Target 1. Target 3 (PDF Guides/Memos): Use only for granular field details absent from 1 & 2.\n"
    "   - Version Priority: Use exclusively the most recent document by date. Ignore superseded versions.\n\n"
    "2. Regional & Language Routing Protocols:\n"
    "   - Classification: MY, AU, TW, VN, or General.\n"
    "   - Language Rules: Malaysia (MY), Australia (AU), & General -> English. Taiwan (TW) -> Traditional Chinese (繁體中文). Vietnam (VN) -> Vietnamese (Tiếng Việt).\n"
    "   - User Query Override: If user explicitly asks in English about TW or VN, reply in English.\n"
    "   - Deduplication: If a rule is identical across regions, output the answer ONCE in English. If rules differ across regions, split into explicit regional blocks (Malaysia:, Australia:, Taiwan (台灣):, Vietnam (Việt Nam):).\n\n"
    "3. Response Formatting & Citations:\n"
    "   - Format step-by-step procedures as an explicit Markdown numbered list ('1. ', '2. '). Use plain text or unicode arrows ('→' or '->'). NEVER output LaTeX math (e.g. \\rightarrow).\n"
    "   - Mandatory PostgreSQL citation brackets like [1] or [2] attached to each statement. No greetings, filler, or closing offers.\n\n"
    "4. Special Workflows & Policy Phrasing:\n"
    "   - Portal / Event Link: If user asks for access link, respond strictly with: https://supplier.ariba.com\n"
    "   - Non-Ariba Vendors: Direct to GPO Business Partner Maintenance Form.\n"
    "   - Mandatory Phrasing: Mention RM100k/GAPP policy only if asked. Always use verbatim 'shall be implemented through' and '...as the Group Accounting Policy and Procedures (GAPP) no G-011-General (on Payments) has been amended accordingly.' Auction ceiling price -> 'the ceiling price confirmation shall be implemented through the SAP Ariba Platform.'\n\n"
    "5. Out-of-Scope Queries:\n"
    "   - If unrelated to onboarding, Ariba, procurement, or business partner maintenance, respond verbatim:\n"
    "     'I apologize, but my assistance is limited to vendor onboarding and Ariba-related queries. Please let me know if you have a question regarding a supplier's registration guide, profile maintenance or policy.'"
)

OUT_OF_SCOPE_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"\b(recipe|cook|bake|weather|forecast|movie|song|joke|sport|football|soccer|cricket|fifa|world cup|olympics|match|tournament|trophy)\b",
        r"\bwho (is|was|will) (president|prime minister|actor|singer|coach|win|winner)\b",
        r"\b(which|what) (team|country|player) (win|won|will win)\b",
        r"\bhow to (code|program|build a website|fix my car)\b",
    ]
]


def _check_fast_rule_interceptor(query_text: str) -> Optional[dict]:
    """Fast $0.00 LLM cost interceptor for deterministic queries."""
    q = query_text.lower().strip()

    if any(k in q for k in ["portal link", "ariba link", "access link", "event link", "questionnaire link", "url to access"]):
        return {
            "answer": "https://supplier.ariba.com",
            "sources": [],
        }

    if any(p.search(q) for p in OUT_OF_SCOPE_PATTERNS):
        return {
            "answer": "I apologize, but my assistance is limited to vendor onboarding and Ariba-related queries. Please let me know if you have a question regarding a supplier's registration guide, profile maintenance or policy.",
            "sources": [],
        }

    return None


def normalize_query(query: str) -> str:
    """Clean conversational filler, lower-case, and trim whitespace/punctuation for cache matching."""
    if not query:
        return ""
    text = query.lower().strip()
    fillers = [
        "can you please tell me", "can you tell me", "can you show me",
        "could you please explain", "could you explain", "please tell me",
        "please explain", "what is the process to", "how do i", "how to",
        "show me", "tell me",
    ]
    for filler in fillers:
        if text.startswith(filler):
            text = text[len(filler):].strip()
            break
    text = text.rstrip("?!.,;:")
    return text or query.strip()
