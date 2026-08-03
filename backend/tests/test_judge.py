"""Tests for the Qwen reasoning judge (with deterministic fallback)."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch
from app.services.judge import judge_certificate, _derive_status_from_rules
from app.services.rules import RuleResult


def _valid_cert(**overrides):
    data = {
        "certificateOwnerName": "ACME Corp",
        "issuerName": "Certifier Ltd",
        "certificateType": "ISO 9001",
        "certificateNumber": "CERT-123",
        "expirationDate": "31/12/2029",
        "effectiveDate": "01/01/2026",
        "certificateLocation": "Selangor, Malaysia",
        "yearOfPublication": "2026",
    }
    data.update(overrides)
    return data


def _full_qa() -> str:
    return (
        '[{"label": "Certificate Type", "value": "ISO 9001"},'
        '{"label": "Issuer", "value": "Certifier Ltd"},'
        '{"label": "Year of Publication", "value": "2026"},'
        '{"label": "Certificate Number", "value": "CERT-123"},'
        '{"label": "Certificate Location", "value": "Selangor, Malaysia"},'
        '{"label": "Effective Date", "value": "01/01/2026"},'
        '{"label": "Expiration Date", "value": "31/12/2029"}]'
    )


def test_judge_falls_back_to_rules_without_qwen_key():
    with patch("app.config.settings.qwen_api_key", ""):
        result = judge_certificate(
            _valid_cert(), "ACME Corp",
            ariba_question_label="1.1 ISO 9001", ariba_qa_answers=_full_qa(),
        )
    assert result["status"] == "PASS"
    assert result["judge_source"] == "rules"
    assert result["rule_result"]["verdict"] == "Match"


def test_judge_fallback_flags_fail():
    with patch("app.config.settings.qwen_api_key", ""):
        result = judge_certificate(
            _valid_cert(expirationDate="01/01/2020"),
            "ACME Corp",
            ariba_question_label="1.1 ISO 9001",
        )
    assert result["status"] == "FAIL"
    assert result["judge_source"] == "rules"


def test_judge_parses_qwen_response():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": '{"status": "PASS", "reasoning_trace": "All fields match.", "confidence": 0.98}'}}]
    }
    with patch("app.config.settings.qwen_api_key", "qwen-test"):
        with patch("requests.post", return_value=mock_resp):
            result = judge_certificate(_valid_cert(), "ACME Corp")
    assert result["status"] == "PASS"
    assert result["judge_source"] == "qwen"
    assert result["confidence"] == 0.98


def test_judge_handles_markdown_fenced_response():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    content = '```json\n{"status": "FAIL", "reasoning_trace": "Expired.", "confidence": 0.9}\n```'
    mock_resp.json.return_value = {"choices": [{"message": {"content": content}}]}
    with patch("app.config.settings.qwen_api_key", "qwen-test"):
        with patch("requests.post", return_value=mock_resp):
            result = judge_certificate(
                _valid_cert(expirationDate="01/01/2020"),
                "ACME Corp",
                ariba_question_label="1.1 ISO 9001",
            )
    assert result["status"] == "FAIL"
    assert result["judge_source"] == "qwen"


def test_judge_invalid_status_sanitized_to_rules():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": '{"status": "MAYBE", "reasoning_trace": "?", "confidence": 0.5}'}}]
    }
    with patch("app.config.settings.qwen_api_key", "qwen-test"):
        with patch("requests.post", return_value=mock_resp):
            result = judge_certificate(_valid_cert(), "ACME Corp")
    assert result["status"] in ("PASS", "FAIL", "REQUIRES_HUMAN_REVIEW")


def test_derive_status_mapping():
    assert _derive_status_from_rules(RuleResult(verdict="Match", region="malaysia")) == "PASS"
    assert _derive_status_from_rules(RuleResult(verdict="Mismatch", region="malaysia", intercept_type="EXPIRED")) == "FAIL"
    assert _derive_status_from_rules(RuleResult(verdict="Mismatch", region="malaysia", intercept_type="FIELD_MISMATCH")) == "REQUIRES_HUMAN_REVIEW"
