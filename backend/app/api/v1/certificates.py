import hashlib
from typing import List, Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.db.session import get_session_factory
from app.repositories.certificates import CertificateRepository
from app.schemas import CertificateVerificationResponse, CertificateVerifyResult
from app.services import extractor, storage
from app.services.rules import _derive_status_from_rules, verify_document
from app.services.timezones import to_malaysia

router = APIRouter()


@router.post("/api/certificates/verify", response_model=CertificateVerifyResult, tags=["Certificate Verification"])
async def verify_certificate(
    file: UploadFile = File(...),
    supplier_name: str = Form(...),
    question_label: Optional[str] = Form(None),
    qa_answers: Optional[str] = Form("[]"),
    qa_data_title: Optional[str] = Form(""),
):
    if not supplier_name.strip():
        raise HTTPException(status_code=400, detail="Supplier name cannot be empty.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File content cannot be empty.")

    mime_type = file.content_type or "application/pdf"
    filename = file.filename or "certificate"
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    file_url, object_id = await storage.store_and_record(file_bytes, supplier_name, filename, mime_type)

    factory = get_session_factory()
    async with factory() as session:
        repo = CertificateRepository(session)
        existing = await repo.get_by_hash(file_hash)
        if existing:
            confidence = None
            if isinstance(existing.extracted_data, dict):
                confidence = existing.extracted_data.get("confidence")
            return CertificateVerifyResult(
                status=existing.status,
                extracted_data=existing.extracted_data,
                reasoning_trace=existing.reasoning_trace or "",
                confidence=float(confidence) if confidence is not None else None,
                record_id=str(existing.id),
            )

    extracted_data, in_t, out_t, cost = extractor.extract_certificate_data(
        file_bytes, mime_type, question_label,
    )
    certs = extracted_data.get("certificates")
    if not certs or certs[0].get("certificateOwnerName") == "Extraction Failed":
        raise HTTPException(status_code=502, detail="Certificate extraction failed.")

    def _rule_payload(r):
        return {
            "verdict": r.verdict,
            "region": r.region,
            "category": r.category,
            "intercept_type": r.intercept_type,
            "expiry_status": r.expiry_status,
            "reasons": r.reasons[:10],
            "comparison_rows": r.comparison_rows,
        }

    per_cert = []
    for idx, cert in enumerate(certs, start=1):
        rule = verify_document(
            cert,
            supplier_name,
            ariba_question_label=question_label,
            ariba_qa_answers=qa_answers,
            qa_data_title=qa_data_title,
        )
        per_cert.append({
            "index": idx,
            "status": _derive_status_from_rules(rule),
            "rule_result": _rule_payload(rule),
            "reasons": rule.reasons[:8],
        })

    statuses = [pc["status"] for pc in per_cert]
    if "FAIL" in statuses:
        status = "FAIL"
    elif "REQUIRES_HUMAN_REVIEW" in statuses:
        status = "REQUIRES_HUMAN_REVIEW"
    else:
        status = "PASS"

    trace_parts = ["Deterministic rules only."]
    for pc in per_cert:
        trace_parts.append(f"Certificate {pc['index']}: " + "; ".join(pc["reasons"]))
    reasoning_trace = " ".join(trace_parts)
    confidence = 0.9 if status == "PASS" else 0.7
    rule_payload = {"overall": status, "certificates": [pc["rule_result"] for pc in per_cert]}

    record_id = None
    async with factory() as session:
        repo = CertificateRepository(session)
        record = await repo.create(
            extracted_data={**extracted_data, "confidence": confidence},
            status=status,
            reasoning_trace=reasoning_trace,
            object_id=object_id,
        )
        record_id = str(record.id)

    return CertificateVerifyResult(
        status=status,
        extracted_data=extracted_data,
        reasoning_trace=reasoning_trace,
        confidence=confidence,
        rule_result=rule_payload,
        record_id=record_id,
    )


@router.get("/api/certificates", response_model=List[CertificateVerificationResponse], tags=["Certificate Verification"])
async def list_certificates(limit: int = 50, offset: int = 0):
    factory = get_session_factory()
    async with factory() as session:
        repo = CertificateRepository(session)
        records = await repo.list_all(limit=limit, offset=offset)

    results = []
    for r in records:
        confidence = None
        if isinstance(r.extracted_data, dict):
            confidence = r.extracted_data.get("confidence")
        results.append(CertificateVerificationResponse(
            id=str(r.id),
            file_url=r.file_url,
            extracted_data=r.extracted_data,
            status=r.status,
            reasoning_trace=r.reasoning_trace,
            confidence=float(confidence) if confidence is not None else None,
            created_at=to_malaysia(r.created_at).strftime("%d/%m/%Y, %H:%M:%S") if r.created_at else None,
        ))
    return results
