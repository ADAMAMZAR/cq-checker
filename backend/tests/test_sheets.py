from unittest.mock import MagicMock, patch
import pytest
from app.schemas import AuditLogEntry, DocumentEvidence
from app.services import sheets


@pytest.fixture
def mock_call_supabase_select():
    with patch("app.services.sheets.call_supabase_select") as mock:
        yield mock


@pytest.fixture
def mock_call_supabase_insert():
    with patch("app.services.sheets.call_supabase_insert") as mock:
        yield mock


@pytest.fixture
def mock_call_supabase_rpc():
    with patch("app.services.sheets.call_supabase_rpc") as mock:
        yield mock


def test_get_or_create_supplier_exists(mock_call_supabase_select):
    mock_call_supabase_select.return_value = [{"supplier_id": 5}]
    result = sheets.get_or_create_supplier("ACME Corp")
    assert result == 5
    mock_call_supabase_select.assert_called_once()


def test_get_or_create_supplier_creates(
    mock_call_supabase_select, mock_call_supabase_insert
):
    mock_call_supabase_select.side_effect = [
        [],
        [{"supplier_id": 6}],
        [{"supplier_id": 7}],
    ]
    mock_call_supabase_insert.return_value = True
    result = sheets.get_or_create_supplier("ACME Corp")
    assert result == 7


def test_get_next_audit_id_success(mock_call_supabase_rpc):
    mock_call_supabase_rpc.return_value = "AUDIT_0043"
    result = sheets.get_next_audit_id()
    assert result == "AUDIT_0043"
    mock_call_supabase_rpc.assert_called_once_with("fn_next_audit_id")


def test_get_next_audit_id_fallback(mock_call_supabase_rpc):
    mock_call_supabase_rpc.return_value = None
    result = sheets.get_next_audit_id()
    assert len(result) == 36
    assert "-" in result
