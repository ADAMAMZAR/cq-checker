"""Domain models for Firebase Firestore collections."""
from dataclasses import dataclass, field
from typing import List, Optional, Any, Dict


@dataclass
class User:
    email: str
    display_name: Optional[str] = None
    roles: List[str] = field(default_factory=lambda: ["user"])
    sso_subject: Optional[str] = None
    is_active: bool = True
    last_login_at: Optional[Any] = None
    created_at: Optional[Any] = None

    @property
    def id(self) -> str:
        return self.email

    def to_dict(self) -> Dict[str, Any]:
        return {
            "email": self.email,
            "display_name": self.display_name,
            "roles": self.roles,
            "sso_subject": self.sso_subject,
            "is_active": self.is_active,
            "last_login_at": self.last_login_at,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], doc_id: Optional[str] = None) -> "User":
        email = data.get("email") or doc_id or ""
        return cls(
            email=email.lower().strip(),
            display_name=data.get("display_name"),
            roles=data.get("roles") or ["user"],
            sso_subject=data.get("sso_subject"),
            is_active=data.get("is_active", True),
            last_login_at=data.get("last_login_at"),
            created_at=data.get("created_at"),
        )


@dataclass
class Role:
    name: str
    display_name: str
    features: List[str] = field(default_factory=list)

    @property
    def id(self) -> str:
        return self.name

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "features": self.features,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], doc_id: Optional[str] = None) -> "Role":
        name = data.get("name") or doc_id or ""
        return cls(
            name=name,
            display_name=data.get("display_name") or name.capitalize(),
            features=data.get("features") or [],
        )


@dataclass
class Feature:
    id: str
    display_name: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "display_name": self.display_name,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], doc_id: Optional[str] = None) -> "Feature":
        fid = data.get("id") or doc_id or ""
        return cls(
            id=fid,
            display_name=data.get("display_name") or fid,
        )


@dataclass
class AuthEvent:
    event_type: str
    user_email: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: Optional[Any] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_email": self.user_email,
            "event_type": self.event_type,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AuthEvent":
        return cls(
            event_type=data.get("event_type", ""),
            user_email=data.get("user_email") or data.get("user_id"),
            ip_address=data.get("ip_address"),
            user_agent=data.get("user_agent"),
            created_at=data.get("created_at"),
        )
