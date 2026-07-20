import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import json
import logging
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)

# Initialize the Gemini SDK
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)

# Gemini API Pricing (USD per 1 Million tokens)
# gemini-2.5-flash-lite  — used for OCR extraction
EXTRACTION_INPUT_RATE  = 0.10 / 1_000_000
EXTRACTION_OUTPUT_RATE = 0.40 / 1_000_000
# # gemini-3.5-flash — used for audit comparison (kept for accuracy)
# COMPARISON_INPUT_RATE  = 1.50 / 1_000_000
# COMPARISON_OUTPUT_RATE = 9.00 / 1_000_000

def calculate_cost(prompt_tokens: int, candidates_tokens: int,
                   input_rate: float = EXTRACTION_INPUT_RATE,
                   output_rate: float = EXTRACTION_OUTPUT_RATE) -> float:
    return (prompt_tokens * input_rate) + (candidates_tokens * output_rate)

# ---------------------------------------------------------------------------
# JSON Schemas — enforce exact keys/types so backend key-access can't crash
# ---------------------------------------------------------------------------
EXTRACTION_SCHEMA = {
    "type": "object",
    "required": [
        "certificateOwnerName", "issuerName", "certificateType",
        "certificateNumber", "expirationDate", "effectiveDate", "certificateLocation", "yearOfPublication"
    ],
    "properties": {
        "certificateOwnerName": {"type": "string"},
        "issuerName":           {"type": "string"},
        "certificateType":      {"type": "string"},
        "certificateNumber":    {"type": "string"},
        "expirationDate":       {"type": "string"},
        "effectiveDate":        {"type": "string"},
        "certificateLocation":  {"type": "string"},
        "yearOfPublication":    {"type": "string"},
    }
}

# COMPARISON_SCHEMA = {
#     "type": "object",
#     "required": ["result", "expiration_date", "suggested_comment", "comparison_table"],
#     "properties": {
#         "result": {
#             "type": "string",
#             "enum": ["Match", "Mismatch"]
#         },
#         "expiration_date": {"type": "string"},
#         "suggested_comment": {"type": "string"},
#         "comparison_table": {"type": "string"},
#     }
# }
# 
# 
# DEFAULT_SYSTEM_INSTRUCTION = """
# You are a High-Precision Document Auditor. Your task is to audit extracted certificate details against Ariba QA form data.
# Compare the fields and identify matches or mismatches.
# 
# Check the following:
# 1. Supplier Name: Verify the name on the certificate matches the Ariba Supplier Name.
# 2. Expiration Date: Verify the certificate is current and not expired.
# 3. Regional Compliance Rules:
#    - Malaysia certificates: 10-year maximum validity cap.
#    - Australia certificates: 3-year maximum validity cap.
# 4. If there is any mismatch, generate a standard suggested comment (e.g. "Wrong Standard", "SSM Upload Mismatch", "Supplier Name Mismatch", "Certificate Expired").
# 
# CRITICAL CONSTRAINT: You must never request a text revision of the 'Certificate Type' field; you may only flag mismatched categories.
# 
# For expiration_date return: the certificate's expiry in YYYY-MM-DD, 'Expired' if already expired, or 'N/A' if absent.
# For comparison_table return: a markdown table with headers (Field Name | QA Value | Certificate Value | Status).
# """

def _run_extraction(file_bytes: bytes, mime_type: str, question_label: Optional[str] = None) -> tuple[Dict[str, Any], int, int, float]:
    """
    Internal "Worker" function. Calls Gemini 1.5 Flash to perform OCR and extract certificate data as JSON.
    Returns: (extracted_data_dict, input_tokens, output_tokens, cost_usd)
    """
    if not settings.gemini_api_key:
        logger.warning("Gemini API key is not configured. Returning mock extraction data.")
        mock_data = {
            "certificateOwnerName": "MOCK SUPPLIER",
            "issuerName": "MOCK ISSUER",
            "certificateType": "MOCK CERT",
            "certificateNumber": "MOCK-12345",
            "expirationDate": "31/12/2029",
            "effectiveDate": "01/01/2026",
            "certificateLocation": "Selangor, Malaysia",
            "yearOfPublication": "2026"
        }
        return mock_data, 150, 45, calculate_cost(150, 45)

    try:
        # Use gemini-1.5-flash for cost-efficient and capable OCR extraction
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        
        section_context = f" for the section '{question_label}'" if question_label else ""
        merged_instruction = (
            f"\nNote: If this document contains multiple different certificates merged together, "
            f"only extract the metadata for the specific certificate relevant to '{question_label}'."
        ) if question_label else ""
        
        prompt = (
            f"OCR this certificate{section_context}. Extract every field exactly as written. "
            "Use 'N/A' for any field not found. "
            "Dates must be formatted as DD/MM/YYYY. "
            "yearOfPublication must be the 4-digit year (e.g. 2024). If no year of publication is found on the document, use the 4-digit year from effectiveDate. "
            f"certificateLocation must be 'State, Country' (e.g. Selangor, Malaysia).{merged_instruction}"
        )
        
        response = model.generate_content(
            [
                prompt,
                {
                    "mime_type": mime_type,
                    "data": file_bytes
                }
            ],
            generation_config={
                "temperature": 0,                        # deterministic OCR — no creativity
                "response_mime_type": "application/json",
                "response_schema": EXTRACTION_SCHEMA     # enforce exact keys/types
            }
        )
        
        # Parse the JSON response
        data = json.loads(response.text.strip())

        # Fallback yearOfPublication from effectiveDate if missing or N/A
        year_pub = data.get("yearOfPublication", "N/A")
        if not year_pub or year_pub == "N/A":
            eff_date = data.get("effectiveDate", "")
            if eff_date and eff_date != "N/A":
                match = re.search(r'\b(20\d\d|19\d\d)\b', eff_date)
                if match:
                    data["yearOfPublication"] = match.group(1)
        
        # Extract usage metadata
        usage = response.usage_metadata
        in_tokens = usage.prompt_token_count if usage else 0
        out_tokens = usage.candidates_token_count if usage else 0
        cost = calculate_cost(in_tokens, out_tokens, EXTRACTION_INPUT_RATE, EXTRACTION_OUTPUT_RATE)
        
        return data, in_tokens, out_tokens, cost
    except Exception as e:
        logger.error(f"Error during initial Gemini certificate extraction: {e}")
        fallback_data = {
            "certificateOwnerName": "Extraction Failed",
            "issuerName": "N/A",
            "certificateType": "N/A",
            "certificateNumber": "N/A",
            "expirationDate": "N/A",
            "effectiveDate": "N/A",
            "certificateLocation": "N/A",
            "error": str(e)
        }
        return fallback_data, 0, 0, 0.0

def _run_verification(file_bytes: bytes, mime_type: str, initial_data: Dict[str, Any]) -> tuple[Dict[str, Any], int, int, float]:
    """
    Internal "Judge" function. Takes initial data and verifies it against the document, returning a corrected version.
    Returns: (verified_data_dict, input_tokens, output_tokens, cost_usd)
    """
    if not settings.gemini_api_key:
        logger.warning("Gemini API key not configured. Skipping verification.")
        return initial_data, 0, 0, 0.0

    try:
        # Use gemini-1.5-flash as it's capable and cost-effective for this task.
        # For higher stakes, you could swap this with "gemini-1.5-pro".
        model = genai.GenerativeModel("gemini-2.5-flash-lite")

        initial_json_str = json.dumps(initial_data, indent=2)

        prompt = (
            "You are a meticulous quality assurance auditor. Your task is to verify the accuracy of extracted data against the provided document. "
            "Review the document and the `INITIAL_EXTRACTED_DATA` JSON object. "
            "1. For each field, check if the value in the JSON is correct based on the document. "
            "2. If you find any errors, inaccuracies, or missing information, correct them. "
            "3. If all data is perfectly correct, return the original data. "
            "4. Ensure dates are in DD/MM/YYYY format. "
            "5. Your final output MUST be only the corrected and complete JSON object, adhering to the required schema."
            f"\n\nINITIAL_EXTRACTED_DATA:\n```json\n{initial_json_str}\n```"
        )

        response = model.generate_content(
            [
                prompt,
                {"mime_type": mime_type, "data": file_bytes}
            ],
            generation_config={
                "temperature": 0,
                "response_mime_type": "application/json",
                "response_schema": EXTRACTION_SCHEMA
            }
        )

        verified_data = json.loads(response.text.strip())

        usage = response.usage_metadata
        in_tokens = usage.prompt_token_count if usage else 0
        out_tokens = usage.candidates_token_count if usage else 0
        cost = calculate_cost(in_tokens, out_tokens, EXTRACTION_INPUT_RATE, EXTRACTION_OUTPUT_RATE)

        return verified_data, in_tokens, out_tokens, cost

    except Exception as e:
        logger.error(f"Error during Gemini verification step: {e}. Falling back to initial data.")
        # If the judge fails, we still have the worker's output.
        return initial_data, 0, 0, 0.0

def extract_certificate_data(file_bytes: bytes, mime_type: str, question_label: Optional[str] = None) -> tuple[Dict[str, Any], int, int, float]:
    """
    Orchestrator function. Performs a two-step "worker" and "judge" extraction to improve accuracy.
    1. Runs an initial extraction.
    2. Runs a second verification pass to correct any errors.
    Returns the final, verified data and the combined token/cost usage.
    """
    # Step 1: Initial Extraction (Worker)
    initial_data, in1, out1, cost1 = _run_extraction(file_bytes, mime_type, question_label)

    # If the first step fails, don't proceed to verification.
    if initial_data.get("certificateOwnerName") == "Extraction Failed":
        return initial_data, in1, out1, cost1

    # Step 2: Verification (Judge)
    verified_data, in2, out2, cost2 = _run_verification(file_bytes, mime_type, initial_data)

    # Return the verified data with combined usage stats
    return verified_data, (in1 + in2), (out1 + out2), (cost1 + cost2)

def check_keyword_match(val_evidence: str, val_qa: str) -> str:
    def clean(s: str) -> str:
        if not s:
            return ""
        s = str(s).strip().lower()
        if s in ("n/a", "na", "-", "missing", "none", "null"):
            return ""
        return s

    ev_clean = clean(val_evidence)
    qa_clean = clean(val_qa)

    if not ev_clean and not qa_clean:
        return "Match"
    if not ev_clean or not qa_clean:
        return "Mismatch"

    # Exact, substring, or reverse substring match
    if ev_clean == qa_clean or ev_clean in qa_clean or qa_clean in ev_clean:
        return "Match"

    # Token/word inclusion match
    def get_words(s: str):
        words = re.sub(r'[^\w\s]', '', s).split()
        return [w for w in words if len(w) > 1]

    ev_words = get_words(ev_clean)
    qa_words = get_words(qa_clean)

    if ev_words and all(w in qa_clean for w in ev_words):
        return "Match"
    if qa_words and all(w in ev_clean for w in qa_words):
        return "Match"

    return "Mismatch"


def normalize_date(s: str) -> str:
    s = str(s).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s

def clean_question_label(label: Optional[str]) -> str:
    """
    Cleans Ariba question labels by stripping noisy text after dashes (e.g. instructions).
    Example: '2.6 Certificate of Currency for Workers\' Compensation (QLD) - Please select YES...'
    Returns: '2.6 Certificate of Currency for Workers\' Compensation (QLD)'
    """
    if not label:
        return "General Attachment"
    label = label.strip()
    parts = re.split(r'\s+[-–—]\s*|\s*[-–—]\s+', label, maxsplit=1)
    cleaned = parts[0].strip() if parts else label
    return cleaned or "General Attachment"


def run_programmatic_audit(supplier_name: str, file_contexts: List[Dict[str, Any]], extraction_results: List[Dict[str, Any]]) -> tuple[str, str, dict]:
    """
    Programmatically compares extracted document metadata with QA answers using keyword matching.
    Returns: (overall_verdict, suggested_comment, comparison_table_dict)
    """
    overall_verdict = "Match"
    mismatch_blocks = []
    
    comparison_table_dict = {
        "supplier_name": supplier_name,
        "tables": []
    }

    # Sort comparison pairs by question label number prefix (e.g. 1.1, 1.2, 1.3)
    pairs = list(zip(file_contexts, extraction_results))
    def get_sort_key(pair):
        label = clean_question_label(pair[0].get("ariba_question_label", "General Attachment"))
        match = re.match(r'^(\d+(?:\.\d+)*)', label)
        if match:
            try:
                return [int(x) for x in match.group(1).split('.')]
            except Exception:
                pass
        return [999]
    pairs.sort(key=get_sort_key)

    field_display_names = {
        "Certificate Type": "certificate type",
        "Supplier Name": "supplier name",
        "Issuer": "issuer",
        "Year of Publication": "year of publication",
        "Certificate Number": "certificate number",
        "Certificate Location": "certificate location",
        "Effective Date": "effective date",
        "Expiration Date": "expiration date"
    }

    for ctx, extracted_data in pairs:
        question_label = clean_question_label(ctx.get("ariba_question_label", "General Attachment"))
        qa_answers_str = ctx.get("ariba_qa_answers", "[]")

        qa_answers_list = []
        try:
            if qa_answers_str:
                qa_answers_list = json.loads(qa_answers_str)
        except Exception:
            pass

        qa_map = {}
        for item in qa_answers_list:
            label = item.get("label", "").strip().lower()
            val = item.get("value", "")
            qa_map[label] = val

        # Compare the 8 fields in the requested sequence
        table_rows = []

        # 1. certificate type
        ev_val = extracted_data.get("certificateType", "N/A")
        qa_val = qa_map.get("certificate type", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Certificate Type", ev_val, qa_val, res))

        # 2. supplier name
        ev_val = extracted_data.get("certificateOwnerName", "N/A")
        qa_val = supplier_name
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Supplier Name", ev_val, qa_val, res))

        # 3. issuer
        ev_val = extracted_data.get("issuerName", "N/A")
        qa_val = qa_map.get("issuer", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Issuer", ev_val, qa_val, res))

        # 4. year of publication
        ev_val = extracted_data.get("yearOfPublication", "N/A")
        if not ev_val or ev_val == "N/A":
            eff_date = extracted_data.get("effectiveDate", "")
            if eff_date and eff_date != "N/A":
                match = re.search(r'\b(20\d\d|19\d\d)\b', eff_date)
                if match:
                    ev_val = match.group(1)
        qa_val = qa_map.get("year of publication", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Year of Publication", ev_val, qa_val, res))

        # 5. certificate number
        ev_val = extracted_data.get("certificateNumber", "N/A")
        qa_val = qa_map.get("certificate number", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Certificate Number", ev_val, qa_val, res))

        # 6. certificate location
        ev_val = extracted_data.get("certificateLocation", "N/A")
        qa_val = qa_map.get("certificate location", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Certificate Location", ev_val, qa_val, res))

        # 7. effective date
        ev_val = normalize_date(extracted_data.get("effectiveDate", "N/A"))
        qa_val = normalize_date(qa_map.get("effective date", "N/A"))
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Effective Date", ev_val, qa_val, res))

        # 8. expiration date
        ev_val = normalize_date(extracted_data.get("expirationDate", "N/A"))
        qa_val = normalize_date(qa_map.get("expiration date", "N/A"))
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Expiration Date", ev_val, qa_val, res))

        # Build structured JSON dict for frontend
        table_dict = {
            "question_label": question_label,
            "attached_file": ctx.get("filename", ""),
            "comparison_rows": []
        }
        for field, ev, qa, r in table_rows:
            table_dict["comparison_rows"].append({
                "field_name": field,
                "value_evidence": ev,
                "value_qa": qa,
                "result": r
            })
        comparison_table_dict["tables"].append(table_dict)

        # Collect mismatches for this specific document/question label
        mismatch_sentences = []
        for field, ev, qa, r in table_rows:
            if r == "Mismatch":
                disp_name = field_display_names.get(field, field.lower())
                mismatch_sentences.append(f"- Please revise the {disp_name} to \"{ev}\"")
        
        if mismatch_sentences:
            filename = ctx.get("filename", "")
            header = f"{question_label} ({filename})" if filename else question_label
            block = f"{header}\n" + "\n".join(mismatch_sentences)
            mismatch_blocks.append(block)

    if overall_verdict == "Match":
        suggested_comment = "All match."
    else:
        blocks_text = "\n\n".join(mismatch_blocks)
        suggested_comment = (
            "Dear Sir/Madam,\n\n"
            "We seek for your resubmission for the following in Part 2: Modular Certificates Questionnaire:\n\n"
            f"{blocks_text}\n\n"
            "Thank you."
        )

    return overall_verdict, suggested_comment, comparison_table_dict
