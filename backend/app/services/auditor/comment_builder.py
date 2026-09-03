import re
from typing import Optional
from app.services.auditor.types import InterceptType

RE_LABEL_CLEAN = re.compile(r'\s+[-–—]\s*|\s*[-–—]\s+')


def clean_question_label(label: Optional[str]) -> str:
    if not label:
        return "General Attachment"
    label = label.strip()
    parts = RE_LABEL_CLEAN.split(label, maxsplit=1)
    cleaned = parts[0].strip() if parts else label
    return cleaned or "General Attachment"


def build_comment_lines(
    intercept: Optional[InterceptType],
    intercept_params: dict,
    mismatches: list,
    special_mismatches: list,
) -> Optional[list]:
    """Return a list of bullet-point lines for this entry, or None if nothing to say."""
    parts = []

    if intercept == InterceptType.RECERTIFICATION_LETTER:
        parts.append(
            "The submitted document is a recertification letter or confirmation of registration renewal, "
            "which is not acceptable for this item. Please provide the official, valid, and unexpired ISO certificate instead."
        )
    elif intercept == InterceptType.SSM_UPLOAD:
        expected = intercept_params.get("expected_type", "technical certificate")
        parts.append(
            f"The submitted document is an SSM corporate profile registration, which is not acceptable for this item. "
            f"Please remove the SSM profile and upload a valid, unexpired {expected} certificate instead."
        )
    elif intercept == InterceptType.EXPIRED:
        parts.append(
            "The submitted certificate has expired. Please provide a valid, unexpired certificate document."
        )
    elif intercept == InterceptType.PL_INSUFFICIENT:
        parts.append(
            "Stated coverage amount does not meet the minimum requirement. "
            "Please revise the document and provide a certificate with a minimum coverage of AUD 20 million."
        )
    elif intercept == InterceptType.MULTIPLE_CERTIFICATES:
        parts.append(
            "The uploaded file contains two different certificates. To claim recognition for the additional certificate, "
            "please add a new 'Other Recognition' item in Ariba, upload this exact same file, "
            "and fill in the input details according to that second certificate."
        )
    elif intercept == InterceptType.PERMANENT_DATE_REVISION:
        calculated_date = intercept_params.get("calculated_expiry", "")
        parts.append(
            f'Please revise the Expiration Date to "{calculated_date} (DD/MM/YYYY)" '
            f"as the certificate is unexpirable/permanent."
        )
    elif intercept == InterceptType.WRONG_DOC:
        extracted_type = intercept_params.get("extracted_type", "unknown")
        parts.append(
            f"The attachment submitted for this item belongs to your {extracted_type} certification context. "
            f"We kindly request that you change the certificate that you attached in this question "
            f"to another relevant certificate, or remove it from this question."
        )
    elif intercept == InterceptType.WRONG_STANDARD:
        ev = intercept_params.get("evidence_type", "unknown")
        qa = intercept_params.get("expected_type", "requested")
        parts.append(
            f"The submitted document shows a {ev} standard. "
            f"Please provide a valid, unexpired certificate specifically covering the requested {qa} standard context."
        )
    elif intercept == InterceptType.SUPPLIER_MISMATCH:
        cert_supplier = intercept_params.get("cert_supplier", "unknown")
        qa_supplier = intercept_params.get("qa_supplier", "unknown")
        cert_type = intercept_params.get("cert_type", "certificate")
        parts.append(
            f"You have submitted a '{cert_type}' for {cert_supplier}. "
            f"Please submit a '{cert_type}' for {qa_supplier} in this item. "
            f"Otherwise, please select 'No' in this item if you do not hold a '{cert_type}' for {qa_supplier}."
        )

    for m in mismatches:
        disp = m["field"]
        ev = m["evidence"]
        if disp == "Supplier Name":
            qa_val = m["qa"]
            parts.append(f'Please revise the {disp} to "{qa_val}"')
        else:
            parts.append(f'Please revise the {disp} to "{ev}"')

    for m in special_mismatches:
        if m["field"] == "Public Liability Amount":
            parts.append(
                "Stated coverage amount does not meet the minimum requirement. "
                "Please revise the document and provide a certificate with a minimum coverage of AUD 20 million."
            )
        elif m["field"] == "CIDB Certificate":
            parts.append(
                "A valid CIDB certificate is required for this questionnaire. "
                "Please upload a valid, unexpired CIDB certificate."
            )

    return parts if parts else None
