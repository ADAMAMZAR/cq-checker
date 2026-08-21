"""SSO configuration loaded from central app settings."""
from app.config import settings


def get_role_mapping() -> dict[str, str]:
    """Return dictionary mapping Entra Security Group Object IDs to app role names."""
    mapping = {}
    if settings.role_group_admin:
        mapping[settings.role_group_admin] = "admin"
    if settings.role_group_reviewer:
        mapping[settings.role_group_reviewer] = "reviewer"
    if settings.role_group_auditor:
        mapping[settings.role_group_auditor] = "auditor"
    return mapping
